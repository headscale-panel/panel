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
import type {
  CreateHeadscaleUserReq,
  CreateHeadscaleUserRes,
  CreatePreAuthKeyReq,
  DeleteHeadscaleUserReq,
  ExpirePreAuthKeyReq,
  GetPreAuthKeysReq,
  ListHeadscaleUsersReq,
  RenameHeadscaleUserReq,
} from './headscale-user.types';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const headscaleUserApi = {
  list: (req?: ListHeadscaleUsersReq) =>
    request<RespType<RespPage<HeadscaleUser>>>({
      url: '/headscale/users',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
      },
    }),

  create: (req: CreateHeadscaleUserReq) =>
    request<RespType<CreateHeadscaleUserRes>>({
      url: '/headscale/users',
      method: 'POST',
      data: req,
    }),

  rename: (req: RenameHeadscaleUserReq) =>
    request<RespType<void>>({
      url: '/headscale/users/rename',
      method: 'PUT',
      data: req,
    }),

  delete: (req: DeleteHeadscaleUserReq) =>
    request<RespType<void>>({
      url: '/headscale/users',
      method: 'DELETE',
      params: { name: req.name },
    }),

  getPreAuthKeys: (req: GetPreAuthKeysReq) =>
    request<RespType<HeadscaleAuthKey[]>>({
      url: '/headscale/preauthkeys',
      method: 'GET',
      params: req,
    }),

  createPreAuthKey: (req: CreatePreAuthKeyReq) =>
    request<RespType<HeadscaleAuthKey>>({
      url: '/headscale/preauthkeys',
      method: 'POST',
      data: req,
    }),

  expirePreAuthKey: (req: ExpirePreAuthKeyReq) =>
    request<RespType<void>>({
      url: '/headscale/preauthkeys/expire',
      method: 'POST',
      data: req,
    }),
};
