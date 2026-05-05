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

import type { HeadscaleAuthKey, HeadscaleUser } from './entities';

export interface ListHeadscaleUsersReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
}

export interface ListHeadscaleUsersRes {
  list: HeadscaleUser[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateHeadscaleUserReq {
  name: string;
  display_name: string;
  email: string;
}
export type CreateHeadscaleUserRes = HeadscaleUser;

export interface RenameHeadscaleUserReq {
  old_name: string;
  new_name: string;
  display_name?: string;
  email?: string;
  picture_url?: string;
}
export interface RenameHeadscaleUserRes {}

export interface DeleteHeadscaleUserReq {
  name: string;
}
export interface DeleteHeadscaleUserRes {}

export interface GetPreAuthKeysReq {
  user: string;
}
export type GetPreAuthKeysRes = HeadscaleAuthKey[];

export interface CreatePreAuthKeyReq {
  user: string;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
}
export type CreatePreAuthKeyRes = HeadscaleAuthKey;

export interface ExpirePreAuthKeyReq {
  user: string;
  id: number;
}
export interface ExpirePreAuthKeyRes {}
