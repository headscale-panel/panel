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

import type { DashboardTopologyData } from './dashboard';
import { describe, expect, it } from 'vitest';
import { applyRealtimeDeviceStatus } from './dashboard';

describe('dashboard realtime device updates', () => {
  const topology: DashboardTopologyData = {
    users: [{ id: 'u-1', name: 'alice', deviceCount: 2 }],
    devices: [
      {
        id: 'device-1',
        name: 'MacBook',
        user: 'alice',
        online: true,
        ipAddresses: ['100.64.0.1'],
        lastSeen: '2026-03-18T00:00:00.000Z',
      },
      {
        id: 'device-2',
        name: 'iPhone',
        user: 'alice',
        online: false,
        ipAddresses: ['100.64.0.2'],
        lastSeen: '2026-03-18T00:00:00.000Z',
      },
    ],
    acl: [],
  };

  it('does not drift the online count when a duplicate heartbeat arrives', () => {
    const result = applyRealtimeDeviceStatus(topology, {
      machineId: 'device-1',
      online: true,
      ipAddresses: ['100.64.0.1'],
      lastSeen: '2026-03-18T00:01:00.000Z',
    });

    expect(result.onlineDevices).toBe(1);
    expect(result.topology.devices[0].lastSeen).toBe('2026-03-18T00:01:00.000Z');
  });

  it('recomputes the count from the device list when status truly changes', () => {
    const result = applyRealtimeDeviceStatus(topology, {
      machineId: 'device-1',
      online: false,
      ipAddresses: ['100.64.0.1'],
      lastSeen: '2026-03-18T00:02:00.000Z',
    });

    expect(result.onlineDevices).toBe(0);
    expect(result.topology.devices[0].online).toBe(false);
  });
});
