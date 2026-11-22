// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import type {
  ConfigOwnershipMode,
  GetConfigRes,
  PreviewConfigRes,
  RunningConfigRes,
  UpdateConfigReq,
  UpdateConfigRes,
  UpdateModeReq,
} from './headscale-config.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

export const headscaleConfigApi = {
  get: () => request<RespType<GetConfigRes>>({ url: '/system/config/headscale', method: 'GET' }),

  getRunning: (docs = true) =>
    request<RespType<RunningConfigRes>>({
      url: '/system/config/headscale/running',
      method: 'GET',
      params: { docs },
    }),

  update: (req: UpdateConfigReq) =>
    request<RespType<UpdateConfigRes>>({ url: '/system/config/headscale', method: 'PUT', data: req }),

  preview: (values: Record<string, unknown>) =>
    request<RespType<PreviewConfigRes>>({
      url: '/system/config/headscale/preview',
      method: 'POST',
      data: { values },
    }),

  getMode: () =>
    request<RespType<{ mode: ConfigOwnershipMode }>>({
      url: '/system/config/model',
      method: 'GET',
    }),

  updateMode: (req: UpdateModeReq) =>
    request<RespType<{ mode: ConfigOwnershipMode }>>({
      url: '/system/config/model',
      method: 'PUT',
      data: req,
    }),
};
