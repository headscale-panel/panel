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

import type { Resource } from './entities';
import type {
  CreateResourceReq,
  CreateResourceRes,
  DeleteResourceReq,
  ListResourcesReq,
  UpdateResourceReq,
} from './resource.types';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const resourceApi = {
  list: (req?: ListResourcesReq) =>
    request<RespType<RespPage<Resource>>>({
      url: '/resources',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
        keyword: req?.keyword,
      },
    }),

  create: (req: CreateResourceReq) =>
    request<RespType<CreateResourceRes>>({ url: '/resources', method: 'POST', data: req }),

  update: (req: UpdateResourceReq) =>
    request<RespType<void>>({ url: '/resources', method: 'PUT', data: req }),

  delete: (req: DeleteResourceReq) =>
    request<RespType<void>>({ url: '/resources', method: 'DELETE', params: req }),
};
