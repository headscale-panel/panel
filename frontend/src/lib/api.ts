import api, { setUnauthorizedHandler } from './request';
import { getAuthToken, redirectToLoginWithNotice } from './auth';
import { DNSRecordType } from './enums';
import {
  aclApi,
  authApi,
  dashboardApi,
  deviceApi,
  dnsApi,
  groupApi,
  headscaleConfigApi,
  headscaleUserApi,
  metricsApi,
  panelAccountApi,
  panelSettingsApi,
  publicAuthApi,
  resourceApi,
  routeApi,
  systemUserApi,
} from '@/api';

export default api;

export const authAPI = {
  login: (username: string, password: string, totp_code?: string) => authApi.login({ username, password, totp_code }),
  register: (username: string, password: string, email: string) => authApi.register({ username, password, email }),
  getUserInfo: () => authApi.getUserInfo(),
  markGuideTourSeen: () => authApi.markGuideTourSeen(),
  oidcLogin: () => authApi.oidcLogin(),
  oidcCallback: (code: string, state: string) => authApi.oidcCallback({ code, state }),
  generateTOTP: () => authApi.generateTOTP(),
  enableTOTP: (code: string) => authApi.enableTOTP({ code }),
};

export const publicAuthAPI = {
  oidcStatus: () => publicAuthApi.oidcStatus(),
};

export const dashboardAPI = {
  getOverview: () => dashboardApi.getOverview(),
  getTopology: () => dashboardApi.getTopology(),
  getTopologyWithACL: () => dashboardApi.getTopologyWithACL(),
};

export const devicesAPI = {
  list: (params?: { page?: number; pageSize?: number; all?: boolean; userId?: string; status?: string }) => deviceApi.list(params),
  get: (id: string) => deviceApi.get({ id }),
  rename: (id: string, name: string) => deviceApi.rename({ id, name }),
  delete: (id: string) => deviceApi.delete({ id }),
  expire: (id: string) => deviceApi.expire({ id }),
  setTags: (id: string, tags: string[]) => deviceApi.setTags({ id, tags }),
  getRoutes: (id: string) => deviceApi.getRoutes({ id }),
  registerNode: (user: string, key: string) => deviceApi.registerNode({ user, key }),
};

export const usersAPI = {
  list: (params?: { page?: number; pageSize?: number; all?: boolean }) => headscaleUserApi.list(params),
  create: (name: string) => headscaleUserApi.create({ name }),
  rename: (oldName: string, newName: string) => headscaleUserApi.rename({ old_name: oldName, new_name: newName }),
  delete: (name: string) => headscaleUserApi.delete({ name }),
  getPreAuthKeys: (user: string) => headscaleUserApi.getPreAuthKeys({ user }),
  createPreAuthKey: (user: string, reusable: boolean, ephemeral: boolean, expiration?: string) =>
    headscaleUserApi.createPreAuthKey({ user, reusable, ephemeral, expiration }),
  expirePreAuthKey: (user: string, key: string) => headscaleUserApi.expirePreAuthKey({ user, key }),
};

const systemUsersAPI = {
  list: (params?: { page?: number; pageSize?: number; all?: boolean }) => systemUserApi.list(params),
  create: (data: {
    username: string;
    password?: string;
    email?: string;
    group_id?: number;
    headscale_name?: string;
    display_name?: string;
  }) => systemUserApi.create(data),
  update: (data: {
    id: number;
    email?: string;
    group_id?: number;
    is_active?: boolean;
    password?: string;
    display_name?: string;
  }) => systemUserApi.update(data),
  delete: (id: number) => systemUserApi.delete({ id }),
};

export const groupsAPI = {
  list: (params?: { page?: number; pageSize?: number; all?: boolean }) => groupApi.list(params),
  create: (data: { name: string; permission_ids?: number[] }) => groupApi.create(data),
  update: (data: { id: number; name: string; permission_ids?: number[] }) => groupApi.update(data),
  delete: (id: number) => groupApi.delete({ id }),
  getPermissions: () => groupApi.getPermissions(),
  updatePermissions: (id: number, permissionIds: number[]) => groupApi.updatePermissions({ id, permission_ids: permissionIds }),
};

export const routesAPI = {
  list: (params?: { page?: number; pageSize?: number; all?: boolean; userId?: string; machine_id?: string }) => routeApi.list(params),
  enable: (machineId: number, destination: string) => routeApi.enable({ machine_id: machineId, destination }),
  disable: (machineId: number, destination: string) => routeApi.disable({ machine_id: machineId, destination }),
};

export const metricsAPI = {
  getOnlineDuration: (params?: { user_id?: string; machine_id?: string; start?: string; end?: string }) =>
    metricsApi.getOnlineDuration(params),
  getOnlineDurationStats: (params?: { start?: string; end?: string }) =>
    metricsApi.getOnlineDurationStats(params),
  getDeviceStatus: () => metricsApi.getDeviceStatus(),
  getDeviceStatusHistory: (machineId: string, params?: { start?: string; end?: string }) =>
    metricsApi.getDeviceStatusHistory({ machine_id: machineId, ...params }),
  getTrafficStats: (params?: { machine_id?: string; start?: string; end?: string }) =>
    metricsApi.getTrafficStats(params),
  getInfluxDBStatus: () => metricsApi.getInfluxDBStatus(),
};

export const aclAPI = {
  getPolicy: () => aclApi.getPolicy(),
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
  }) => aclApi.updatePolicy(policy),
  setPolicyRaw: (policy: string) => aclApi.setPolicyRaw({ policy }),
  getParsedRules: () => aclApi.getParsedRules(),
  syncResourcesAsHosts: () => aclApi.syncResourcesAsHosts(),
  addRule: (data: { name: string; sources: string[]; destinations: string[]; action: string }) =>
    aclApi.addRule(data),
  updateRuleByIndex: (data: { index: number; name: string; sources: string[]; destinations: string[]; action: string }) =>
    aclApi.updateRuleByIndex(data),
  deleteRuleByIndex: (index: number) =>
    aclApi.deleteRuleByIndex({ index }),
  generate: () => aclApi.generate(),
  listPolicies: () => aclApi.listPolicies(),
  apply: (id: number) => aclApi.apply({ id }),
};

export const resourcesAPI = {
  list: (params?: { page?: number; pageSize?: number; all?: boolean; keyword?: string }) => resourceApi.list(params),
  create: (data: { name: string; ip_address: string; port?: string; description?: string }) => resourceApi.create(data),
  update: (id: number, data: { name?: string; ip_address?: string; port?: string; description?: string }) => resourceApi.update({ id, ...data }),
  delete: (id: number) => resourceApi.delete({ id }),
};

export const headscaleConfigAPI = {
  get: () => headscaleConfigApi.get(),
  update: (config: any) => headscaleConfigApi.update(config),
  preview: (config: any) => headscaleConfigApi.preview(config),
};

export const panelSettingsAPI = {
  getConnection: () => panelSettingsApi.getConnection(),
  saveConnection: (data: { grpc_addr: string; api_key?: string; insecure: boolean }) =>
    panelSettingsApi.saveConnection(data),
  syncData: () => panelSettingsApi.syncData(),
  getBuiltinOIDC: () => panelSettingsApi.getBuiltinOIDC(),
  enableBuiltinOIDC: () => panelSettingsApi.enableBuiltinOIDC(),
  getOIDCSettings: () => panelSettingsApi.getOIDCSettings(),
  saveOIDCSettings: (data: any) => panelSettingsApi.saveOIDCSettings(data),
  getOIDCStatus: () => panelSettingsApi.getOIDCStatus(),
};

export const dnsAPI = {
  list: (params?: { page?: number; pageSize?: number; keyword?: string; type?: string }) => dnsApi.list(params),
  get: (id: number) => dnsApi.get({ id }),
  create: (data: { name: string; type: DNSRecordType; value: string; comment?: string }) => dnsApi.create(data),
  update: (data: { id: number; name?: string; type?: DNSRecordType; value?: string; comment?: string }) => dnsApi.update(data),
  delete: (id: number) => dnsApi.delete({ id }),
  sync: () => dnsApi.sync(),
  import: () => dnsApi.import(),
  getFile: () => dnsApi.getFile(),
};

export const panelAccountsAPI = {
  list: panelAccountApi.list,
  getDetail: panelAccountApi.getDetail,
  create: panelAccountApi.create,
  update: panelAccountApi.update,
  setStatus: panelAccountApi.setStatus,
  delete: panelAccountApi.delete,
  getLoginIdentities: panelAccountApi.getLoginIdentities,
  getNetworkBindings: panelAccountApi.getNetworkBindings,
  updateNetworkBindings: panelAccountApi.updateNetworkBindings,
  setPrimaryBinding: panelAccountApi.setPrimaryBinding,
  listAvailableNetworkIdentities: panelAccountApi.listAvailableNetworkIdentities,
  resetTOTP: panelAccountApi.resetTOTP,
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
    this.url = `${wsHost}/panel/api/v1/ws`;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const token = getAuthToken();
    if (!token) return;

    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        // Send auth token as the first message instead of in the URL
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
function handleUnauthorized() {
  wsManager.disconnect();
  redirectToLoginWithNotice('sessionExpired');
}
setUnauthorizedHandler(() => {
  wsManager.disconnect();
});

export enum WSMetricsUpdateType { OnlineDuration = 'online_duration', Traffic = 'traffic', DeviceCount = 'device_count' }
export enum WSACLUpdateType { RuleAdded = 'rule_added', RuleUpdated = 'rule_updated', RuleDeleted = 'rule_deleted', PolicyApplied = 'policy_applied' }
export enum WSNotificationType { Info = 'info', Warning = 'warning', Error = 'error', Success = 'success' }

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
