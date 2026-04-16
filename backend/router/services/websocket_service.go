package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"headscale-panel/pkg/conf"
	paneljwt "headscale-panel/pkg/utils/jwt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return isOriginAllowed(r)
	},
}

// Client represents a WebSocket client
type Client struct {
	ID     string
	UserID string
	Conn   *websocket.Conn
	Send   chan []byte
	Hub    *Hub
	mu     sync.Mutex
}

// Hub maintains the set of active clients and broadcasts messages
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	stop       chan struct{}
	stopped    chan struct{}
	mu         sync.RWMutex
	stopOnce   sync.Once
}

// Message types
type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type DeviceStatusUpdate struct {
	MachineID   string   `json:"machineId"`
	Online      bool     `json:"online"`
	LastSeen    string   `json:"lastSeen"`
	IPAddresses []string `json:"ipAddresses"`
}

type MetricsUpdate struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type Notification struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

// Global hub instance
var wsHub *Hub
var wsInitOnce sync.Once
var wsMetricsCancel context.CancelFunc
var wsMetricsStopped chan struct{}
var wsLifecycleMu sync.Mutex

// InitWebSocket initializes the WebSocket hub
func InitWebSocket() {
	wsHub = &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client, 256),
		unregister: make(chan *Client, 256),
		stop:       make(chan struct{}),
		stopped:    make(chan struct{}),
	}
	collectorCtx, collectorCancel := context.WithCancel(context.Background())
	collectorStopped := make(chan struct{})

	wsLifecycleMu.Lock()
	wsMetricsCancel = collectorCancel
	wsMetricsStopped = collectorStopped
	wsLifecycleMu.Unlock()

	go wsHub.Run()
	go startMetricsCollector(collectorCtx, collectorStopped)
}

// GetHub returns the global hub instance
func GetHub() *Hub {
	ensureWebSocketHub()
	return wsHub
}

func ensureWebSocketHub() {
	wsInitOnce.Do(func() {
		InitWebSocket()
	})
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("WebSocket client connected: %s", client.ID)

		case client := <-h.unregister:
			h.removeClient(client)
			log.Printf("WebSocket client disconnected: %s", client.ID)

		case message := <-h.broadcast:
			h.mu.RLock()
			var staleClients []*Client
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					staleClients = append(staleClients, client)
				}
			}
			h.mu.RUnlock()
			for _, client := range staleClients {
				h.enqueueUnregister(client)
			}
		case <-h.stop:
			h.mu.Lock()
			for client := range h.clients {
				delete(h.clients, client)
				close(client.Send)
				_ = client.Conn.Close()
			}
			h.mu.Unlock()
			close(h.stopped)
			return
		}
	}
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(msgType string, data interface{}) {
	msg := WSMessage{
		Type: msgType,
		Data: data,
	}
	jsonData, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal WebSocket message: %v", err)
		return
	}
	h.broadcast <- jsonData
}

// BroadcastToUser sends a message to a specific user
func (h *Hub) BroadcastToUser(userID string, msgType string, data interface{}) {
	msg := WSMessage{
		Type: msgType,
		Data: data,
	}
	jsonData, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal WebSocket message: %v", err)
		return
	}

	h.mu.RLock()
	var staleClients []*Client

	for client := range h.clients {
		if client.UserID == userID {
			select {
			case client.Send <- jsonData:
			default:
				staleClients = append(staleClients, client)
			}
		}
	}
	h.mu.RUnlock()

	for _, client := range staleClients {
		h.enqueueUnregister(client)
	}
}

func (h *Hub) enqueueUnregister(client *Client) {
	select {
	case h.unregister <- client:
	default:
		h.removeClient(client)
	}
}

func (h *Hub) removeClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; !ok {
		return
	}

	delete(h.clients, client)
	close(client.Send)
	_ = client.Conn.Close()
}

func (h *Hub) Stop() {
	h.stopOnce.Do(func() {
		close(h.stop)
		<-h.stopped
	})
}

// HandleWebSocket handles WebSocket connections
func HandleWebSocket(c *gin.Context) {
	ensureWebSocketHub()

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket connection: %v", err)
		return
	}

	// Require the first message to be an auth message within 10 seconds.
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, message, err := conn.ReadMessage()
	if err != nil {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(4001, "auth timeout"))
		conn.Close()
		return
	}

	var authMsg WSMessage
	if err := json.Unmarshal(message, &authMsg); err != nil || authMsg.Type != "auth" {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(4001, "first message must be auth"))
		conn.Close()
		return
	}

	dataMap, ok := authMsg.Data.(map[string]interface{})
	if !ok {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(4001, "invalid auth data"))
		conn.Close()
		return
	}
	token, _ := dataMap["token"].(string)
	if token == "" {
		// Backward compat: also accept token from query param during migration period
		token = extractWebSocketToken(c)
	}
	if token == "" {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(4001, "missing token"))
		conn.Close()
		return
	}

	claims, err := paneljwt.ParseToken(token)
	if err != nil {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(4001, "invalid token"))
		conn.Close()
		return
	}
	user, err := ValidateSessionUser(claims.UserID)
	if err != nil {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(4001, "invalid token"))
		conn.Close()
		return
	}
	userID := fmt.Sprintf("%d", user.ID)

	// Auth succeeded — reset deadline and register client
	conn.SetReadDeadline(time.Time{})

	client := &Client{
		ID:     generateClientID(),
		UserID: userID,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		Hub:    wsHub,
	}

	wsHub.register <- client

	go client.writePump()
	go client.readPump()
}

func extractWebSocketToken(c *gin.Context) string {
	token := strings.TrimSpace(c.Query("token"))
	if token != "" {
		return token
	}

	authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}

	return ""
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current WebSocket message
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.Hub.enqueueUnregister(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512 * 1024)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Failed to unmarshal WebSocket message: %v", err)
			continue
		}

		// Process message based on type
		switch msg.Type {
		case "subscribe":
		case "unsubscribe":
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

// generateClientID generates a unique client ID
func generateClientID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("ws-%d", time.Now().UnixNano())
	}
	return "ws-" + hex.EncodeToString(buf)
}

// startMetricsCollector starts a background goroutine to collect and broadcast metrics
func startMetricsCollector(ctx context.Context, stopped chan<- struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer close(stopped)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		if wsHub == nil {
			continue
		}

		// Collect device status
		// TODO: Implement actual device status collection from Headscale

		// Broadcast metrics update
		wsHub.Broadcast("metrics_update", MetricsUpdate{
			Type: "device_count",
			Data: map[string]interface{}{
				"online": 12,
				"total":  22,
			},
		})
	}
}

// BroadcastDeviceStatus broadcasts a device status update
func BroadcastDeviceStatus(machineID string, online bool, lastSeen string, ipAddresses []string) {
	if wsHub == nil {
		return
	}

	wsHub.Broadcast("device_status", DeviceStatusUpdate{
		MachineID:   machineID,
		Online:      online,
		LastSeen:    lastSeen,
		IPAddresses: ipAddresses,
	})
}

func isOriginAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		// Non-browser clients may not send Origin.
		return true
	}

	originURL, err := url.Parse(origin)
	if err != nil || originURL.Host == "" {
		return false
	}

	originHost := strings.ToLower(originURL.Host)
	requestHost := strings.ToLower(strings.TrimSpace(r.Host))
	if requestHost != "" && originHost == requestHost {
		return true
	}

	baseURL := strings.TrimSpace(conf.Conf.System.BaseURL)
	if baseURL != "" {
		if base, err := url.Parse(baseURL); err == nil {
			if strings.EqualFold(originHost, strings.ToLower(base.Host)) {
				return true
			}
		}
	}

	return false
}

func StopWebSocket() {
	wsLifecycleMu.Lock()
	cancel := wsMetricsCancel
	stopped := wsMetricsStopped
	wsMetricsCancel = nil
	wsMetricsStopped = nil
	hub := wsHub
	wsLifecycleMu.Unlock()

	if cancel != nil {
		cancel()
	}
	if stopped != nil {
		<-stopped
	}
	if hub != nil {
		hub.Stop()
	}

	wsLifecycleMu.Lock()
	wsHub = nil
	wsInitOnce = sync.Once{}
	wsLifecycleMu.Unlock()
}
