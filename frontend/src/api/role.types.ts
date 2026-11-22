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

import type { Permission, Role } from './entities';

export type ListRolesRes = Role[];
export type GetRoleRes = Role;

export interface CreateRoleReq {
  name: string;
  description?: string;
  permission_ids?: number[];
}
export type CreateRoleRes = Role;

export interface UpdateRoleReq {
  id: number;
  name?: string;
  description?: string;
  permission_ids?: number[];
}
export type UpdateRoleRes = Role;

export interface SetRolePermissionsReq {
  id: number;
  permission_ids: number[];
}
export type SetRolePermissionsRes = Role;

export interface DeleteRoleReq {
  id: number;
}

export type ListPermissionsRes = Permission[];

export interface GrantEnrollReq {
  role_id: number;
}
export type GrantEnrollRes = Role;
