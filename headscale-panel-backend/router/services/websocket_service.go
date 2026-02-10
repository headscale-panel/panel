package services

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
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
	mu         sync.RWMutex
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

// InitWebSocket initializes the WebSocket hub
func InitWebSocket() {
	wsHub = &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
	go wsHub.Run()
	go startMetricsCollector()
}

// GetHub returns the global hub instance
func GetHub() *Hub {
	return wsHub
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
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("WebSocket client disconnected: %s", client.ID)

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
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
	defer h.mu.RUnlock()

	for client := range h.clients {
		if client.UserID == userID {
			select {
			case client.Send <- jsonData:
			default:
				close(client.Send)
				delete(h.clients, client)
			}
		}
	}
}

// HandleWebSocket handles WebSocket connections
func HandleWebSocket(c *gin.Context) {
	// Get token from query parameter
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing token"})
		return
	}

	// TODO: Validate token and get user ID
	userID := "user-1" // Placeholder

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket connection: %v", err)
		return
	}

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
		c.Hub.unregister <- c
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
	return time.Now().Format("20060102150405") + "-" + randomString(8)
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}

// startMetricsCollector starts a background goroutine to collect and broadcast metrics
func startMetricsCollector() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
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

// BroadcastNotification broadcasts a notification to all clients
func BroadcastNotification(notifType, title, message string) {
	if wsHub == nil {
		return
	}

	wsHub.Broadcast("notification", Notification{
		ID:        generateClientID(),
		Type:      notifType,
		Title:     title,
		Message:   message,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

// BroadcastACLUpdate broadcasts an ACL update
func BroadcastACLUpdate(updateType string, data interface{}) {
	if wsHub == nil {
		return
	}

	wsHub.Broadcast("acl_update", map[string]interface{}{
		"type": updateType,
		"data": data,
	})
}
