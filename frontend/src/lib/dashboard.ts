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

import type { ACLAction } from './enums';

export interface DashboardStats {
  onlineDevices: number;
  totalDevices: number;
  totalUsers: number;
  dnsRecordCount: number;
}

export interface DashboardTopologyUser {
  id: string;
  name: string;
  deviceCount: number;
}

export interface DashboardTopologyDevice {
  id: string;
  name: string;
  user: string;
  online: boolean;
  ipAddresses: string[];
  lastSeen: string;
  tags?: string[];
}

export interface DashboardTopologyACLRule {
  src: string;
  dst: string;
  action: ACLAction;
}

export interface DashboardTopologyPolicy {
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
}

export interface DashboardTopologyData {
  users: DashboardTopologyUser[];
  devices: DashboardTopologyDevice[];
  acl: DashboardTopologyACLRule[];
  policy?: DashboardTopologyPolicy;
}

export interface DashboardDeviceStatusUpdate {
  machineId: string;
  online: boolean;
  lastSeen: string;
  ipAddresses: string[];
}

export interface DashboardRealtimeUpdateResult {
  topology: DashboardTopologyData;
  onlineDevices: number;
  changed: boolean;
}

export function applyRealtimeDeviceStatus(
  topology: DashboardTopologyData,
  update: DashboardDeviceStatusUpdate,
): DashboardRealtimeUpdateResult {
  let changed = false;

  const devices = topology.devices.map((device) => {
    if (device.id !== update.machineId) {
      return device;
    }

    const nextDevice = {
      ...device,
      online: update.online,
      lastSeen: update.lastSeen,
      ipAddresses: update.ipAddresses,
    };

    changed
      = device.online !== nextDevice.online
        || device.lastSeen !== nextDevice.lastSeen
        || device.ipAddresses.join(',') !== nextDevice.ipAddresses.join(',');

    return nextDevice;
  });

  return {
    topology: {
      ...topology,
      devices,
    },
    onlineDevices: devices.filter((device) => device.online).length,
    changed,
  };
}
