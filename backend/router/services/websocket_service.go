// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/log"
	paneljwt "headscale-panel/pkg/utils/jwt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
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
	ID             string
	UserID         string
	AccountID      uint
	SessionVersion uint64
	ExpiresAt      time.Time
	Conn           *websocket.Conn
	Send           chan []byte
	Hub            *Hub
	mu             sync.Mutex
}

func (c *Client) isSessionValid() bool {
	if c.AccountID == 0 || Accounts == nil {
		return false
	}
	if !c.ExpiresAt.IsZero() && time.Now().After(c.ExpiresAt) {
		return false
	}
	acc, err := Accounts.Get(c.AccountID)
	if err != nil || !acc.IsActive() {
		return false
	}
	return acc.SessionVersion == c.SessionVersion
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
			log.L.Info("WebSocket client connected", zap.String("clientID", client.ID))

		case client := <-h.unregister:
			h.removeClient(client)
			log.L.Info("WebSocket client disconnected", zap.String("clientID", client.ID))

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
		log.L.Error("Failed to marshal WebSocket message", zap.Error(err))
		return
	}
	h.broadcast <- jsonData
}

// BroadcastAuthorized sends a message only to connected clients whose session
// is still valid and whose role holds requiredPermission.
func (h *Hub) BroadcastAuthorized(requiredPermission, msgType string, data interface{}) {
	msg := WSMessage{
		Type: msgType,
		Data: data,
	}
	jsonData, err := json.Marshal(msg)
	if err != nil {
		log.L.Error("Failed to marshal WebSocket message", zap.Error(err))
		return
	}

	h.mu.RLock()
	clients := make([]*Client, 0, len(h.clients))
	for client := range h.clients {
		clients = append(clients, client)
	}
	h.mu.RUnlock()

	var staleClients []*Client
	for _, client := range clients {
		if Accounts == nil || client.AccountID == 0 {
			staleClients = append(staleClients, client)
			continue
		}
		if !client.ExpiresAt.IsZero() && time.Now().After(client.ExpiresAt) {
			staleClients = append(staleClients, client)
			continue
		}
		acc, accErr := Accounts.Get(client.AccountID)
		if accErr != nil || !acc.IsActive() || acc.SessionVersion != client.SessionVersion {
			staleClients = append(staleClients, client)
			continue
		}
		if requiredPermission != "" && !Accounts.HasPermission(acc, requiredPermission) {
			continue
		}
		select {
		case client.Send <- jsonData:
		default:
			staleClients = append(staleClients, client)
		}
	}

	for _, client := range staleClients {
		h.enqueueUnregister(client)
	}
}

// BroadcastToUser sends a message to a specific user
func (h *Hub) BroadcastToUser(userID string, msgType string, data interface{}) {
	msg := WSMessage{
		Type: msgType,
		Data: data,
	}
	jsonData, err := json.Marshal(msg)
	if err != nil {
		log.L.Error("Failed to marshal WebSocket message", zap.Error(err))
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
		log.L.Error("Failed to upgrade WebSocket connection", zap.Error(err))
		return
	}

	// Bound frame size before reading the unauthenticated auth frame.
	conn.SetReadLimit(512 * 1024)

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
	session, err := ResolveSession(claims)
	if err != nil {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(4001, "invalid token"))
		conn.Close()
		return
	}
	userID := fmt.Sprintf("%d", session.Account.ID)

	// Auth succeeded — reset deadline and register client
	conn.SetReadDeadline(time.Time{})

	var expiresAt time.Time
	if claims.ExpiresAt != nil {
		expiresAt = claims.ExpiresAt.Time
	}

	client := &Client{
		ID:             generateClientID(),
		UserID:         userID,
		AccountID:      session.Account.ID,
		SessionVersion: session.Account.SessionVersion,
		ExpiresAt:      expiresAt,
		Conn:           conn,
		Send:           make(chan []byte, 256),
		Hub:            wsHub,
	}

	wsHub.register <- client

	go client.writePump()
	go client.readPump()
}

func extractWebSocketToken(c *gin.Context) string {
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
			if !c.isSessionValid() {
				c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				_ = c.Conn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(4001, "session expired"))
				return
			}
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
				log.L.Error("WebSocket error", zap.Error(err))
			}
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.L.Error("Failed to unmarshal WebSocket message", zap.Error(err))
			continue
		}

		// Process message based on type
		switch msg.Type {
		case "subscribe":
		case "unsubscribe":
		default:
			log.L.Warn("Unknown message type", zap.String("type", msg.Type))
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

		deviceMetrics := collectDeviceCountMetrics(ctx)

		// Broadcast metrics update only to clients authorized to view metrics
		wsHub.BroadcastAuthorized(constants.PermMetricsView, "metrics_update", MetricsUpdate{
			Type: "device_count",
			Data: deviceMetrics,
		})
	}
}

func collectDeviceCountMetrics(ctx context.Context) map[string]interface{} {
	metrics := map[string]interface{}{
		"online": 0,
		"total":  0,
	}

	client, err := headscaleRESTClient()
	if err != nil {
		log.L.Warn("WebSocket metrics: headscale client unavailable", zap.Error(err))
		return metrics
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	nodes, apiErr := client.ListNodes(queryCtx, "")
	if apiErr != nil {
		log.L.Error("WebSocket metrics: failed to list headscale nodes", zap.Error(apiErr))
		return metrics
	}

	online := 0
	for _, node := range nodes {
		if node.LastSeen == nil {
			continue
		}
		if time.Since(*node.LastSeen) < 5*time.Minute {
			online++
		}
	}

	metrics["online"] = online
	metrics["total"] = len(nodes)

	return metrics
}

// BroadcastDeviceStatus broadcasts a device status update to clients authorized
// to list all network devices.
func BroadcastDeviceStatus(machineID string, online bool, lastSeen string, ipAddresses []string) {
	if wsHub == nil {
		return
	}

	wsHub.BroadcastAuthorized(constants.PermNetworkDeviceList, "device_status", DeviceStatusUpdate{
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
	originScheme := strings.ToLower(originURL.Scheme)
	if originScheme != "http" && originScheme != "https" {
		return false
	}

	originHost := strings.ToLower(originURL.Host)
	baseURL := strings.TrimSpace(conf.Conf.System.BaseURL)
	if baseURL != "" {
		if base, parseErr := url.Parse(baseURL); parseErr == nil && base.Host != "" {
			baseScheme := strings.ToLower(base.Scheme)
			if strings.EqualFold(originHost, strings.ToLower(base.Host)) && originScheme == baseScheme {
				return true
			}
			// Allow Vite dev server when running locally.
			if strings.HasPrefix(strings.ToLower(baseURL), "http://localhost") ||
				strings.HasPrefix(strings.ToLower(baseURL), "http://127.0.0.1") {
				if originScheme == "http" && originHost == "localhost:5173" {
					return true
				}
			}
		}
	}

	requestHost := strings.ToLower(strings.TrimSpace(r.Host))
	requestScheme := "http"
	if r.TLS != nil {
		requestScheme = "https"
	}
	if requestHost != "" && originHost == requestHost && originScheme == requestScheme {
		return true
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
