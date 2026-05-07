/*
 * Copyright (C) 2026 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

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

export interface GetDeviceStatusHistoriesReq {
  machine_ids: string[];
  start?: string;
  end?: string;
}

export interface DeviceStatusHistoryRecord {
  timestamp: string;
  online: boolean;
  ip_addresses?: string[];
}

export type GetDeviceStatusHistoryRes = DeviceStatusHistoryRecord[];

export type GetDeviceStatusHistoriesRes = Record<string, DeviceStatusHistoryRecord[]>;

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
