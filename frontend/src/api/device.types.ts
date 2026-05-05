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

import type { HeadscaleMachine } from './entities';

export interface ListDevicesReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
  userId?: string;
  status?: string;
}

export interface ListDevicesRes {
  list: HeadscaleMachine[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface GetDeviceReq {
  id: string;
}
export type GetDeviceRes = HeadscaleMachine;

export interface RenameDeviceReq {
  id: string;
  name: string;
}
export type RenameDeviceRes = HeadscaleMachine;

export interface DeleteDeviceReq {
  id: string;
}
export interface DeleteDeviceRes {}

export interface ExpireDeviceReq {
  id: string;
}
export type ExpireDeviceRes = HeadscaleMachine;

export interface SetDeviceTagsReq {
  id: string;
  tags: string[];
}
export type SetDeviceTagsRes = HeadscaleMachine;

export interface GetDeviceRoutesReq {
  id: string;
}
export interface GetDeviceRoutesRes {
  routes?: Array<{
    id: number;
    machine: HeadscaleMachine;
    prefix: string;
    advertised: boolean;
    enabled: boolean;
    isPrimary: boolean;
  }>;
}

export interface RegisterNodeReq {
  user: string;
  key: string;
}
export type RegisterNodeRes = HeadscaleMachine;
