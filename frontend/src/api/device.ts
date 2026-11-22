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
  CreatePreAuthKeyReq,
  CreatePreAuthKeyRes,
  DeleteDeviceReq,
  DeletePreAuthKeyReq,
  ExpireDeviceReq,
  ExpireDeviceRes,
  ExpirePreAuthKeyReq,
  GetDeviceReq,
  GetDeviceRes,
  ListDevicesReq,
  ListDevicesRes,
  ListPreAuthKeysReq,
  ListPreAuthKeysRes,
  RegisterDeviceReq,
  RegisterDeviceRes,
  RenameDeviceReq,
  RenameDeviceRes,
  SetDeviceTagsReq,
  SetDeviceTagsRes,
} from './device.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

/**
 * Devices and pre-auth keys.
 *
 * Two upstream behaviours are reflected in this surface rather than hidden:
 *
 *  - Tagging a device hands it to headscale's synthetic tagged-devices owner.
 *    It is an ownership transfer, so the response carries the new owner instead
 *    of pretending the device still belongs to the previous one.
 *  - A well-formed tag is still refused unless the policy declares it under
 *    tagOwners. The backend checks first and says which rule failed.
 */
export const deviceApi = {
  list: (req?: ListDevicesReq) =>
    request<RespType<ListDevicesRes>>({
      url: '/devices',
      method: 'GET',
      params: {
        q: req?.q,
        user_id: req?.user_id,
        online: req?.online === undefined ? undefined : String(req.online),
        tagged: req?.tagged === undefined ? undefined : String(req.tagged),
      },
    }),

  get: (req: GetDeviceReq) =>
    request<RespType<GetDeviceRes>>({ url: `/devices/${req.id}`, method: 'GET' }),

  rename: (req: RenameDeviceReq) =>
    request<RespType<RenameDeviceRes>>({
      url: `/devices/${req.id}/rename`,
      method: 'POST',
      data: { name: req.name },
    }),

  delete: (req: DeleteDeviceReq) =>
    request<RespType<void>>({ url: `/devices/${req.id}`, method: 'DELETE' }),

  expire: (req: ExpireDeviceReq) =>
    request<RespType<ExpireDeviceRes>>({
      url: `/devices/${req.id}/expire`,
      method: 'POST',
      data: { expiry: req.expiry, disable_expiry: req.disable_expiry ?? false },
    }),

  setTags: (req: SetDeviceTagsReq) =>
    request<RespType<SetDeviceTagsRes>>({
      url: `/devices/${req.id}/tags`,
      method: 'POST',
      data: { tags: req.tags },
    }),

  register: (req: RegisterDeviceReq) =>
    request<RespType<RegisterDeviceRes>>({ url: '/devices/register', method: 'POST', data: req }),

  listPreAuthKeys: (req?: ListPreAuthKeysReq) =>
    request<RespType<ListPreAuthKeysRes>>({
      url: '/preauthkeys',
      method: 'GET',
      params: { hs_user_id: req?.hs_user_id },
    }),

  createPreAuthKey: (req: CreatePreAuthKeyReq) =>
    request<RespType<CreatePreAuthKeyRes>>({
      url: '/preauthkeys',
      method: 'POST',
      data: {
        hs_user_id: req.hs_user_id,
        reusable: req.reusable ?? false,
        ephemeral: req.ephemeral ?? false,
        expiration: req.expiration,
      },
    }),

  expirePreAuthKey: (req: ExpirePreAuthKeyReq) =>
    request<RespType<void>>({ url: `/preauthkeys/${req.id}/expire`, method: 'POST' }),

  deletePreAuthKey: (req: DeletePreAuthKeyReq) =>
    request<RespType<void>>({ url: `/preauthkeys/${req.id}`, method: 'DELETE' }),
};
