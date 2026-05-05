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

export interface ACLDeviceOption {
  id: string;
  label: string;
  ipAddress: string;
  sourceValue: string;
  destinationValue: string;
}

export function buildACLDeviceOptions(
  devices: Array<{
    id: string;
    givenName: string;
    name: string;
    ipAddresses: string[];
  }>,
): ACLDeviceOption[] {
  return devices
    .map((device) => ({
      id: device.id,
      label: device.givenName || device.name,
      ipAddress: device.ipAddresses[0] || '',
      sourceValue: device.ipAddresses[0] || '',
      destinationValue: device.ipAddresses[0] ? `${device.ipAddresses[0]}:*` : '',
    }))
    .filter((device) => device.ipAddress);
}
