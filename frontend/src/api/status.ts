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

import type { GetHeadscaleStatusRes, GetSystemStatusRes } from './status.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

export const statusApi = {
  /** GET /status — global panel + headscale runtime status (requires auth). */
  getSystemStatus: () =>
    request<RespType<GetSystemStatusRes>>({ url: '/status', method: 'GET' }),

  /** GET /headscale/status — lightweight headscale gRPC liveness probe (requires auth). */
  getHeadscaleStatus: () =>
    request<RespType<GetHeadscaleStatusRes>>({ url: '/headscale/status', method: 'GET' }),
};
