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

import { describe, expect, it } from 'vitest';
import { buildACLDeviceOptions } from './acl';

describe('aCL device options', () => {
  it('keeps the full device list available to the searchable picker', () => {
    const devices = Array.from({ length: 12 }, (_, index) => ({
      id: `device-${index + 1}`,
      givenName: `Device ${index + 1}`,
      name: `device-${index + 1}`,
      ipAddresses: [`100.64.0.${index + 1}`],
    }));

    const options = buildACLDeviceOptions(devices);

    expect(options).toHaveLength(12);
    expect(options.at(-1)?.label).toBe('Device 12');
    expect(options.at(-1)?.destinationValue).toBe('100.64.0.12:*');
  });
});
