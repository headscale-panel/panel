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

import type { Group, Permission } from './entities';

export interface ListGroupsReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
}

export interface ListGroupsRes {
  list: Group[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateGroupReq {
  name: string;
  permission_ids?: number[];
}
export interface CreateGroupRes extends Group {}

export interface UpdateGroupReq {
  id: number;
  name: string;
  permission_ids?: number[];
}
export interface UpdateGroupRes {}

export interface DeleteGroupReq {
  id: number;
}
export interface DeleteGroupRes {}

export interface GetPermissionsReq {}
export type GetPermissionsRes = Permission[];

export interface UpdateGroupPermissionsReq {
  id: number;
  permission_ids: number[];
}
export interface UpdateGroupPermissionsRes {}

export interface AddGroupPermissionsReq {
  id: number;
  permission_ids: number[];
}
export interface AddGroupPermissionsRes {}

export interface RemoveGroupPermissionsReq {
  id: number;
  permission_ids: number[];
}
export interface RemoveGroupPermissionsRes {}
