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

import type { User } from './entities';
import type {
  CreateSystemUserReq,
  CreateSystemUserRes,
  DeleteSystemUserReq,
  ListSystemUsersReq,
  UpdateSystemUserReq,
} from './system-user.types';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const systemUserApi = {
  list: (req?: ListSystemUsersReq) =>
    request<RespType<RespPage<User>>>({
      url: '/system/users',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
      },
    }),

  create: (req: CreateSystemUserReq) =>
    request<RespType<CreateSystemUserRes>>({ url: '/system/users', method: 'POST', data: req }),

  update: (req: UpdateSystemUserReq) =>
    request<RespType<void>>({ url: '/system/users', method: 'PUT', data: req }),

  delete: (req: DeleteSystemUserReq) =>
    request<RespType<void>>({ url: '/system/users', method: 'DELETE', data: req }),
};
