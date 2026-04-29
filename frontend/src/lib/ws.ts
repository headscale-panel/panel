import { getAuthToken, redirectToLoginWithNotice } from './auth';
import { setUnauthorizedHandler } from './request';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private url: string;

  constructor() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}`;
    this.url = `${wsHost}/panel/api/v1/ws`;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN)
      return;
    const token = getAuthToken();
    if (!token)
      return;

    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({ type: 'auth', data: { token } }));
        this.reconnectAttempts = 0;
        this.emit('connected', {});
      };
      this.ws.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data);
          this.emit(type, data);
        } catch {}
      };
      this.ws.onclose = (event) => {
        this.emit('disconnected', { code: event.code, reason: event.reason });
        if (event.code === 1008 || event.code === 4001) {
          handleUnauthorized();
          return;
        }
        this.attemptReconnect();
      };
      this.ws.onerror = () => this.attemptReconnect();
    } catch {
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed', {});
      return;
    }
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  send(type: string, data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event))
      this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  off(event: string, callback: (data: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch {}
    });
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = new WebSocketManager();

function handleUnauthorized() {
  wsManager.disconnect();
  redirectToLoginWithNotice('sessionExpired');
}

setUnauthorizedHandler(() => {
  wsManager.disconnect();
});

export enum WSMetricsUpdateType {
  OnlineDuration = 'online_duration',
  Traffic = 'traffic',
  DeviceCount = 'device_count',
}

export enum WSACLUpdateType {
  RuleAdded = 'rule_added',
  RuleUpdated = 'rule_updated',
  RuleDeleted = 'rule_deleted',
  PolicyApplied = 'policy_applied',
}

export enum WSNotificationType {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Success = 'success',
}

export interface WSDeviceStatusUpdate {
  machineId: string;
  online: boolean;
  lastSeen: string;
  ipAddresses: string[];
}

export interface WSMetricsUpdate {
  type: WSMetricsUpdateType;
  data: any;
}

export interface WSACLUpdate {
  type: WSACLUpdateType;
  data: any;
}

export interface WSNotification {
  id: string;
  type: WSNotificationType;
  title: string;
  message: string;
  timestamp: string;
}
