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

import type {
  CreateRoleReq,
  CreateRoleRes,
  DeleteRoleReq,
  GrantEnrollReq,
  GrantEnrollRes,
  ListPermissionsRes,
  ListRolesRes,
  SetRolePermissionsReq,
  SetRolePermissionsRes,
  UpdateRoleReq,
  UpdateRoleRes,
} from './role.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

/**
 * Roles and the permission catalogue.
 *
 * Roles replaced the old "groups" concept, which had drifted into being both an
 * ACL grouping and the thing that decided permissions. There is now exactly one
 * grouping concept, and ACL groups are derived from it.
 */
export const roleApi = {
  list: () => request<RespType<ListRolesRes>>({ url: '/roles', method: 'GET' }),

  create: (req: CreateRoleReq) =>
    request<RespType<CreateRoleRes>>({ url: '/roles', method: 'POST', data: req }),

  update: (req: UpdateRoleReq) =>
    request<RespType<UpdateRoleRes>>({
      url: `/roles/${req.id}`,
      method: 'PUT',
      data: { name: req.name, description: req.description, permission_ids: req.permission_ids },
    }),

  delete: (req: DeleteRoleReq) =>
    request<RespType<void>>({ url: `/roles/${req.id}`, method: 'DELETE' }),

  setPermissions: (req: SetRolePermissionsReq) =>
    request<RespType<SetRolePermissionsRes>>({
      url: `/roles/${req.id}/permissions`,
      method: 'PUT',
      data: { permission_ids: req.permission_ids },
    }),

  permissionCatalogue: () =>
    request<RespType<ListPermissionsRes>>({ url: '/permissions', method: 'GET' }),

  /** Give a role the right to bring devices onto the tailnet. */
  grantEnroll: (req: GrantEnrollReq) =>
    request<RespType<GrantEnrollRes>>({
      url: '/system/auth/grant-enroll',
      method: 'POST',
      data: { role_id: req.role_id },
    }),
};
