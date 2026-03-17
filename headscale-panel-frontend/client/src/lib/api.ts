import axios from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from './store';
import { getTranslations } from '@/i18n/index';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    const { code, msg, data, error: rawError } = response.data;
    if (code === 0) return data;

    const t = getTranslations();
    let detail = msg || t.common.errors.requestFailed;
    if (rawError) detail = `${detail}\n\n${rawError}`;

    const isSetupRequest = response.config?.url?.includes('/setup/');
    if (code === 401 && !isSetupRequest) {
      useAuthStore.getState().clearAuth();
      toast.error(t.common.errors.sessionExpired);
      window.location.href = '/panel/login';
    } else if (code === 403 && !isSetupRequest) {
      toast.error(t.common.errors.forbidden);
    } else if (!isSetupRequest) {
      toast.error(detail, code === 50000 ? { duration: 6000 } : undefined);
    }
    return Promise.reject(new Error(detail));
  },
  (error) => {
    const t = getTranslations();
    const isSetupRequest = error.config?.url?.includes('/setup/');
    if (error.response) {
      const { status } = error.response;
      if (status === 401 && !isSetupRequest) {
        useAuthStore.getState().clearAuth();
        toast.error(t.common.errors.sessionExpired);
        window.location.href = '/panel/login';
      } else if (status === 403 && !isSetupRequest) {
        toast.error(t.common.errors.forbidden);
      } else if (status >= 500 && !isSetupRequest) {
        toast.error(t.common.errors.serverError);
      } else if (!isSetupRequest) {
        toast.error(error.response.data?.msg || t.common.errors.requestFailed);
      }
    } else if (error.request && !isSetupRequest) {
      toast.error(t.common.errors.networkError);
    }
    return Promise.reject(error);
  }
);

export default api;

export const authAPI = {
  login: (username: string, password: string) =>
    api.post('/login', { username, password }),
  register: (username: string, password: string, email: string) =>
    api.post('/register', { username, password, email }),
  getUserInfo: () => api.get('/user/info'),
  oidcLogin: () => api.get('/auth/oidc/login'),
  oidcCallback: (code: string, state: string) =>
    api.get('/auth/oidc/callback', { params: { code, state } }),
};

export const publicAuthAPI = {
  oidcStatus: () => api.get('/auth/oidc-status'),
};

export const dashboardAPI = {
  getOverview: () => api.get('/dashboard/overview'),
  getTopology: () => api.get('/topology'),
  getTopologyWithACL: () => api.get('/topology/with-acl'),
  getStats: () => api.get('/dashboard/stats'),
};

export const devicesAPI = {
  list: (params?: { page?: number; pageSize?: number; userId?: string; status?: string }) =>
    api.get('/headscale/machines', {
      params: {
        page: params?.page || 1,
        page_size: params?.pageSize || 20,
        user_id: params?.userId,
        status: params?.status,
      },
    }),
  get: (id: string) => api.get(`/headscale/machines/${id}`),
  rename: (id: string, name: string) =>
    api.put(`/headscale/machines/${id}/rename`, { name }),
  delete: (id: string) => api.delete(`/headscale/machines/${id}`),
  expire: (id: string) => api.post(`/headscale/machines/${id}/expire`),
  setTags: (id: string, tags: string[]) =>
    api.put(`/headscale/machines/${id}/tags`, { tags }),
  getRoutes: (id: string) => api.get(`/headscale/machines/${id}/routes`),
  registerNode: (user: string, key: string) =>
    api.post('/headscale/machines/register', { user, key }),
};

export const usersAPI = {
  list: (params?: { page?: number; pageSize?: number }) =>
    api.get('/headscale/users', {
      params: { page: params?.page || 1, page_size: params?.pageSize || 20 },
    }),
  create: (name: string) => api.post('/headscale/users', { name }),
  rename: (oldName: string, newName: string) =>
    api.put('/headscale/users/rename', { old_name: oldName, new_name: newName }),
  delete: (name: string) => api.delete('/headscale/users', { params: { name } }),
  getPreAuthKeys: (user: string) =>
    api.get('/headscale/preauthkeys', { params: { user } }),
  createPreAuthKey: (user: string, reusable: boolean, ephemeral: boolean, expiration?: string) =>
    api.post('/headscale/preauthkeys', { user, reusable, ephemeral, expiration }),
  expirePreAuthKey: (user: string, key: string) =>
    api.post('/headscale/preauthkeys/expire', { user, key }),
};

export const systemUsersAPI = {
  list: (params?: { page?: number; pageSize?: number }) =>
    api.get('/system/users', {
      params: { page: params?.page || 1, page_size: params?.pageSize || 20 },
    }),
  create: (data: {
    username: string;
    password?: string;
    email?: string;
    group_id?: number;
    headscale_name?: string;
    display_name?: string;
  }) => api.post('/system/users', data),
  update: (data: {
    id: number;
    email?: string;
    group_id?: number;
    is_active?: boolean;
    password?: string;
    display_name?: string;
  }) => api.put('/system/users', data),
  delete: (id: number) => api.delete('/system/users', { data: { id } }),
};

export const groupsAPI = {
  list: (params?: { page?: number; pageSize?: number }) =>
    api.get('/system/groups', {
      params: { page: params?.page || 1, page_size: params?.pageSize || 100 },
    }),
  create: (data: { name: string; permission_ids?: number[] }) =>
    api.post('/system/groups', data),
  update: (data: { id: number; name: string; permission_ids?: number[] }) =>
    api.put('/system/groups', data),
  delete: (id: number) => api.delete('/system/groups', { data: { id } }),
  getPermissions: () => api.get('/system/permissions'),
  updatePermissions: (id: number, permissionIds: number[]) =>
    api.put('/system/groups/permissions', { id, permission_ids: permissionIds }),
};

export const routesAPI = {
  list: (params?: { page?: number; pageSize?: number; userId?: string; machineId?: string }) =>
    api.get('/routes', {
      params: {
        page: params?.page || 1,
        page_size: params?.pageSize || 20,
        user_id: params?.userId,
        machine_id: params?.machineId,
      },
    }),
  enable: (machineId: number, destination: string) =>
    api.post('/routes/enable', { machine_id: machineId, destination }),
  disable: (machineId: number, destination: string) =>
    api.post('/routes/disable', { machine_id: machineId, destination }),
};

export const metricsAPI = {
  getOnlineDuration: (params?: { userId?: string; machineId?: string; start?: string; end?: string }) =>
    api.get('/metrics/online-duration', {
      params: {
        user_id: params?.userId,
        machine_id: params?.machineId,
        start: params?.start,
        end: params?.end,
      },
    }),
  getOnlineDurationStats: (params?: { start?: string; end?: string; groupBy?: string }) =>
    api.get('/metrics/online-duration-stats', {
      params: { start: params?.start, end: params?.end, group_by: params?.groupBy },
    }),
  getDeviceStatus: () => api.get('/metrics/device-status'),
  getDeviceStatusHistory: (machineId: string, params?: { start?: string; end?: string }) =>
    api.get('/metrics/device-status-history', {
      params: { machine_id: machineId, start: params?.start, end: params?.end },
    }),
  getTrafficStats: (params?: { machineId?: string; start?: string; end?: string }) =>
    api.get('/metrics/traffic', {
      params: { machine_id: params?.machineId, start: params?.start, end: params?.end },
    }),
  getInfluxDBStatus: () => api.get('/metrics/influxdb-status'),
};

export const connectionAPI = {
  generateCommands: (machineIds: string[], platform: string) =>
    api.post('/connection/generate', { machine_ids: machineIds, platform }),
  generatePreAuthKey: (userId: string, reusable: boolean, ephemeral: boolean, expiration?: string) =>
    api.post('/connection/pre-auth-key', { user_id: userId, reusable, ephemeral, expiration }),
  generateSSHCommand: (machineId: string, user?: string) =>
    api.post('/connection/ssh-command', { machine_id: machineId, user }),
};

export const aclAPI = {
  getPolicy: () => api.get('/headscale/acl/policy'),
  updatePolicy: (policy: {
    groups?: Record<string, string[]>;
    hosts?: Record<string, string>;
    tagOwners?: Record<string, string[]>;
    acls?: Array<{
      '#ha-meta'?: { name: string; open: boolean };
      action: string;
      src: string[];
      dst: string[];
    }>;
  }) => api.put('/headscale/acl/policy', policy),
  setPolicyRaw: (policy: string) => api.post('/headscale/acl/policy/raw', { policy }),
  getParsedRules: () => api.get('/headscale/acl/parsed-rules'),
  syncResourcesAsHosts: () => api.post('/headscale/acl/sync-resources'),
  addRule: (data: { name: string; sources: string[]; destinations: string[]; action: string }) =>
    api.post('/headscale/acl/add-rule', data),
  updateRuleByIndex: (data: { index: number; name: string; sources: string[]; destinations: string[]; action: string }) =>
    api.put('/headscale/acl/update-rule', data),
  deleteRuleByIndex: (index: number) =>
    api.delete('/headscale/acl/delete-rule', { params: { index } }),
  generate: () => api.post('/headscale/acl/generate'),
  listPolicies: () => api.get('/headscale/acl/policies'),
  apply: (id: number) => api.post('/headscale/acl/apply', { id }),
};

export const resourcesAPI = {
  list: (params?: { page?: number; pageSize?: number; keyword?: string }) =>
    api.get('/resources', {
      params: { page: params?.page || 1, page_size: params?.pageSize || 100, keyword: params?.keyword },
    }),
  create: (data: { name: string; ip_address: string; port?: string; description?: string }) =>
    api.post('/resources', data),
  update: (id: number, data: { name?: string; ip_address?: string; port?: string; description?: string }) =>
    api.put('/resources', { id, ...data }),
  delete: (id: number) => api.delete('/resources', { params: { id } }),
};

export const headscaleConfigAPI = {
  get: () => api.get('/headscale/config'),
  preview: (config: any) => api.post('/headscale/config/preview', config),
};

export const panelSettingsAPI = {
  getConnection: () => api.get('/panel/connection'),
  saveConnection: (data: { grpc_addr: string; api_key?: string; insecure: boolean }) =>
    api.put('/panel/connection', data),
  syncData: () => api.post('/panel/sync'),
  getBuiltinOIDC: () => api.get('/panel/builtin-oidc'),
  enableBuiltinOIDC: () => api.post('/panel/builtin-oidc'),
  getOIDCSettings: () => api.get('/panel/oidc-settings'),
  saveOIDCSettings: (data: any) => api.put('/panel/oidc-settings', data),
  getOIDCStatus: () => api.get('/panel/oidc-status') as Promise<{
    oidc_enabled: boolean;
    third_party: boolean;
    builtin: boolean;
    password_required: boolean;
  }>,
};

export const derpAPI = {
  get: () => api.get('/headscale/derp'),
};

export interface DNSRecord {
  id: number;
  name: string;
  type: 'A' | 'AAAA';
  value: string;
  comment?: string;
  created_at?: string;
  updated_at?: string;
}

export const dnsAPI = {
  list: (params?: { page?: number; pageSize?: number; keyword?: string; type?: string }) =>
    api.get('/dns/records', {
      params: {
        page: params?.page || 1,
        page_size: params?.pageSize || 50,
        keyword: params?.keyword,
        type: params?.type,
      },
    }),
  get: (id: number) => api.get(`/dns/records/${id}`),
  create: (data: { name: string; type: 'A' | 'AAAA'; value: string; comment?: string }) =>
    api.post('/dns/records', data),
  update: (data: { id: number; name?: string; type?: 'A' | 'AAAA'; value?: string; comment?: string }) =>
    api.put('/dns/records', data),
  delete: (id: number) => api.delete('/dns/records', { params: { id } }),
  sync: () => api.post('/dns/sync'),
  import: () => api.post('/dns/import'),
  getFile: () => api.get('/dns/file'),
};

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
    this.url = `${wsHost}/api/v1/ws`;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      this.ws = new WebSocket(`${this.url}?token=${token}`);
      this.ws.onopen = () => { this.reconnectAttempts = 0; this.emit('connected', {}); };
      this.ws.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data);
          this.emit(type, data);
        } catch {}
      };
      this.ws.onclose = (event) => {
        this.emit('disconnected', { code: event.code, reason: event.reason });
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
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => { this.listeners.get(event)?.delete(callback); };
  }

  off(event: string, callback: (data: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((cb) => { try { cb(data); } catch {} });
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = new WebSocketManager();

export interface WSDeviceStatusUpdate {
  machineId: string;
  online: boolean;
  lastSeen: string;
  ipAddresses: string[];
}

export interface WSMetricsUpdate {
  type: 'online_duration' | 'traffic' | 'device_count';
  data: any;
}

export interface WSACLUpdate {
  type: 'rule_added' | 'rule_updated' | 'rule_deleted' | 'policy_applied';
  data: any;
}

export interface WSNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string;
}
