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
  GetDeviceStatusHistoriesReq,
  GetDeviceStatusHistoriesRes,
  GetDeviceStatusHistoryReq,
  GetDeviceStatusHistoryRes,
  GetDeviceStatusRes,
  GetInfluxDBStatusRes,
  GetOnlineDurationReq,
  GetOnlineDurationRes,
  GetOnlineDurationSummaryReq,
  GetOnlineDurationSummaryRes,
  GetOnlineDurationStatsReq,
  GetOnlineDurationStatsRes,
  GetTrafficStatsReq,
  GetTrafficStatsRes,
} from './metrics.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

export const metricsApi = {
  getOnlineDuration: (req?: GetOnlineDurationReq) =>
    request<RespType<GetOnlineDurationRes>>({
      url: '/metrics/online-duration',
      method: 'GET',
      params: {
        user_id: req?.user_id,
        machine_id: req?.machine_id,
        start: req?.start,
        end: req?.end,
      },
    }),

  getOnlineDurationStats: (req?: GetOnlineDurationStatsReq) =>
    request<RespType<GetOnlineDurationStatsRes>>({
      url: '/metrics/online-duration-stats',
      method: 'GET',
      params: {
        start: req?.start,
        end: req?.end,
      },
    }),

  getOnlineDurationSummary: (req?: GetOnlineDurationSummaryReq) =>
    request<RespType<GetOnlineDurationSummaryRes>>({
      url: '/metrics/online-duration-summary',
      method: 'GET',
      params: {
        end: req?.end,
      },
    }),

  getDeviceStatus: () =>
    request<RespType<GetDeviceStatusRes>>({
      url: '/metrics/device-status',
      method: 'GET',
    }),

  getDeviceStatusHistory: (req: GetDeviceStatusHistoryReq) =>
    request<RespType<GetDeviceStatusHistoryRes>>({
      url: '/metrics/device-status-history',
      method: 'GET',
      params: {
        machine_id: req.machine_id,
        start: req.start,
        end: req.end,
      },
    }),

  getDeviceStatusHistories: (req: GetDeviceStatusHistoriesReq) =>
    request<RespType<GetDeviceStatusHistoriesRes>>({
      url: '/metrics/device-status-histories',
      method: 'GET',
      params: {
        machine_ids: req.machine_ids.join(','),
        start: req.start,
        end: req.end,
      },
    }),

  getTrafficStats: (req?: GetTrafficStatsReq) =>
    request<RespType<GetTrafficStatsRes>>({
      url: '/metrics/traffic',
      method: 'GET',
      params: {
        machine_id: req?.machine_id,
        start: req?.start,
        end: req?.end,
      },
    }),

  getInfluxDBStatus: () =>
    request<RespType<GetInfluxDBStatusRes>>({
      url: '/metrics/influxdb-status',
      method: 'GET',
    }),
};
