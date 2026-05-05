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
  GetConfigRes,
  PreviewConfigReq,
  PreviewConfigRes,
  UpdateConfigReq,
} from './headscale-config.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

export const headscaleConfigApi = {
  get: () =>
    request<RespType<GetConfigRes>>({ url: '/headscale/config', method: 'GET' }),

  update: (req: UpdateConfigReq) =>
    request<RespType<void>>({ url: '/headscale/config', method: 'PUT', data: req }),

  preview: (req: PreviewConfigReq) =>
    request<RespType<PreviewConfigRes>>({
      url: '/headscale/config/preview',
      method: 'POST',
      data: req,
    }),
};
