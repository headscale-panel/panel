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
  DeleteDeviceReq,
  ExpireDeviceReq,
  GetDeviceReq,
  GetDeviceRes,
  GetDeviceRoutesReq,
  GetDeviceRoutesRes,
  ListDevicesReq,
  RegisterNodeReq,
  RenameDeviceReq,
  SetDeviceTagsReq,
} from './device.types';
import type { HeadscaleMachine } from './entities';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const deviceApi = {
  list: (req?: ListDevicesReq) =>
    request<RespType<RespPage<HeadscaleMachine>>>({
      url: '/headscale/machines',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
        user_id: req?.userId,
        status: req?.status,
      },
    }),

  get: (req: GetDeviceReq) =>
    request<RespType<GetDeviceRes>>({ url: `/headscale/machines/${req.id}`, method: 'GET' }),

  rename: (req: RenameDeviceReq) =>
    request<RespType<HeadscaleMachine>>({
      url: `/headscale/machines/${req.id}/rename`,
      method: 'PUT',
      data: { name: req.name },
    }),

  delete: (req: DeleteDeviceReq) =>
    request<RespType<void>>({ url: `/headscale/machines/${req.id}`, method: 'DELETE' }),

  expire: (req: ExpireDeviceReq) =>
    request<RespType<HeadscaleMachine>>({
      url: `/headscale/machines/${req.id}/expire`,
      method: 'POST',
    }),

  setTags: (req: SetDeviceTagsReq) =>
    request<RespType<HeadscaleMachine>>({
      url: `/headscale/machines/${req.id}/tags`,
      method: 'PUT',
      data: { tags: req.tags },
    }),

  getRoutes: (req: GetDeviceRoutesReq) =>
    request<RespType<GetDeviceRoutesRes>>({
      url: `/headscale/machines/${req.id}/routes`,
      method: 'GET',
    }),

  registerNode: (req: RegisterNodeReq) =>
    request<RespType<HeadscaleMachine>>({
      url: '/headscale/machines/register',
      method: 'POST',
      data: req,
    }),
};
