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

import type { Device, PreAuthKey } from './entities';

export interface ListDevicesReq {
  q?: string;
  user_id?: number;
  online?: boolean;
  tagged?: boolean;
}

export type ListDevicesRes = Device[];

export interface GetDeviceReq {
  id: string;
}
export type GetDeviceRes = Device;

export interface RenameDeviceReq {
  id: string;
  name: string;
}
export type RenameDeviceRes = Device;

export interface DeleteDeviceReq {
  id: string;
}

export interface ExpireDeviceReq {
  id: string;
  /** RFC3339 timestamp; omit together with disable_expiry to expire now. */
  expiry?: string;
  disable_expiry?: boolean;
}
export type ExpireDeviceRes = Device;

export interface SetDeviceTagsReq {
  id: string;
  tags: string[];
}
export type SetDeviceTagsRes = Device;

export interface RegisterDeviceReq {
  hs_user_id: number;
  key: string;
}
export type RegisterDeviceRes = Device;

export interface ListPreAuthKeysReq {
  hs_user_id?: number;
}
export type ListPreAuthKeysRes = PreAuthKey[];

export interface CreatePreAuthKeyReq {
  hs_user_id: number;
  reusable?: boolean;
  ephemeral?: boolean;
  /** A Go duration ("24h") or an RFC3339 timestamp. */
  expiration?: string;
}
export type CreatePreAuthKeyRes = PreAuthKey;

export interface ExpirePreAuthKeyReq {
  id: string;
}

export interface DeletePreAuthKeyReq {
  id: string;
}
