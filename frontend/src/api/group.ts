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

import type { Group } from './entities';
import type {
  CreateGroupReq,
  CreateGroupRes,
  DeleteGroupReq,
  GetPermissionsRes,
  ListGroupsReq,
  UpdateGroupPermissionsReq,
  UpdateGroupReq,
} from './group.types';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const groupApi = {
  list: (req?: ListGroupsReq) =>
    request<RespType<RespPage<Group>>>({
      url: '/system/groups',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
      },
    }),

  create: (req: CreateGroupReq) =>
    request<RespType<CreateGroupRes>>({ url: '/system/groups', method: 'POST', data: req }),

  update: (req: UpdateGroupReq) =>
    request<RespType<void>>({ url: '/system/groups', method: 'PUT', data: req }),

  delete: (req: DeleteGroupReq) =>
    request<RespType<void>>({ url: '/system/groups', method: 'DELETE', data: req }),

  getPermissions: () =>
    request<RespType<GetPermissionsRes>>({ url: '/system/permissions', method: 'GET' }),

  updatePermissions: (req: UpdateGroupPermissionsReq) =>
    request<RespType<void>>({
      url: '/system/groups/permissions',
      method: 'PUT',
      data: { id: req.id, permission_ids: req.permission_ids },
    }),
};
