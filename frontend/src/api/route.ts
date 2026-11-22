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

import type { ListRoutesReq, ListRoutesRes, ToggleRouteReq } from './route.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

/**
 * Subnet routes advertised by nodes.
 *
 * Enabling or disabling is an explicit per-node action: the backend replaces the
 * whole approved set, which is why the request names one destination and lets the
 * server compute the resulting set from the current state.
 */
export const routeApi = {
  list: (req?: ListRoutesReq) =>
    request<RespType<ListRoutesRes>>({
      url: '/routes',
      method: 'GET',
      params: { q: req?.q, user_id: req?.user_id, machine_id: req?.machine_id },
    }),

  enable: (req: ToggleRouteReq) =>
    request<RespType<void>>({
      url: `/routes/${req.nodeId}/enable`,
      method: 'POST',
      data: { machine_id: req.nodeId, destination: req.destination },
    }),

  disable: (req: ToggleRouteReq) =>
    request<RespType<void>>({
      url: `/routes/${req.nodeId}/disable`,
      method: 'POST',
      data: { machine_id: req.nodeId, destination: req.destination },
    }),
};
