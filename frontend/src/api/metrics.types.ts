export interface GetOnlineDurationReq {
  user_id?: string;
  machine_id?: string;
  start?: string;
  end?: string;
}

export interface OnlineDurationRes {
  duration_seconds: number;
  duration_hours: number;
  duration_days: number;
}

export type GetOnlineDurationRes = OnlineDurationRes;

export interface GetOnlineDurationStatsReq {
  start?: string;
  end?: string;
}

export type GetOnlineDurationStatsRes = Record<string, unknown>;

export interface GetDeviceStatusReq {}

export interface DeviceStatusItem {
  machine_id?: string;
  name?: string;
  online?: boolean;
  last_seen?: string;
  ip_addresses?: string[];
}

export type GetDeviceStatusRes = DeviceStatusItem[];

export interface GetDeviceStatusHistoryReq {
  machine_id: string;
  start?: string;
  end?: string;
}

export interface DeviceStatusHistoryRecord {
  timestamp: string;
  online: boolean;
  ip_addresses?: string[];
}

export type GetDeviceStatusHistoryRes = DeviceStatusHistoryRecord[];

export interface GetTrafficStatsReq {
  machine_id?: string;
  start?: string;
  end?: string;
}

export type GetTrafficStatsRes = Record<string, unknown>;

export interface GetInfluxDBStatusReq {}

export interface InfluxDBStatus {
  connected: boolean;
  url?: string;
  error?: string;
  version?: string;
}

export type GetInfluxDBStatusRes = InfluxDBStatus;

