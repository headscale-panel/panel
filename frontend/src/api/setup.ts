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
  ConnectivityCheckReq,
  ConnectivityCheckRes,
  GetSetupStatusReq,
  GetSetupStatusRes,
  InitSetupReq,
  InitSetupRes,
} from './setup.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

export const setupApi = {
  getStatus: (_req?: GetSetupStatusReq) =>
    request<RespType<GetSetupStatusRes>>({
      url: '/setup/status',
      method: 'GET',
    }),

  connectivityCheck: (req: ConnectivityCheckReq) =>
    request<RespType<ConnectivityCheckRes>>({
      url: '/setup/connectivity-check',
      method: 'POST',
      data: req,
    }),

  init: (req: InitSetupReq) =>
    request<RespType<InitSetupRes>>({
      url: '/setup/init',
      method: 'POST',
      data: req,
    }),
};
