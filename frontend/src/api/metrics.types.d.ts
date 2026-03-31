export interface GetOnlineDurationReq {
  userId?: string;
  machineId?: string;
  start?: string;
  end?: string;
}

export interface OnlineDurationRecord {
  userId?: string;
  machineId?: string;
  duration: number;
  timestamp: string;
}

export type GetOnlineDurationRes = OnlineDurationRecord[];

export interface GetOnlineDurationStatsReq {
  start?: string;
  end?: string;
  groupBy?: string;
}

export interface OnlineDurationStats {
  total: number;
  average: number;
  max: number;
  min: number;
  groupBy?: string;
  data: Record<string, number>;
}

export type GetOnlineDurationStatsRes = OnlineDurationStats;

export interface DeviceStatusItem {
  machineId: string;
  name: string;
  online: boolean;
  lastSeen: string;
  ipAddresses: string[];
}

export type GetDeviceStatusRes = DeviceStatusItem[];

export interface GetDeviceStatusHistoryReq {
  machineId: string;
  start?: string;
  end?: string;
}

export interface DeviceStatusHistoryRecord {
  timestamp: string;
  online: boolean;
  ipAddresses: string[];
}

export type GetDeviceStatusHistoryRes = DeviceStatusHistoryRecord[];

export interface GetTrafficStatsReq {
  machineId?: string;
  start?: string;
  end?: string;
}

export interface TrafficStats {
  machineId?: string;
  totalIn: number;
  totalOut: number;
  averageIn: number;
  averageOut: number;
  data: Array<{
    timestamp: string;
    in: number;
    out: number;
  }>;
}

export type GetTrafficStatsRes = TrafficStats;

export interface InfluxDBStatus {
  connected: boolean;
  url?: string;
  error?: string;
  version?: string;
}

export type GetInfluxDBStatusRes = InfluxDBStatus;
