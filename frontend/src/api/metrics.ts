import request, { RespType } from '@/lib/request';
import type {
  GetOnlineDurationReq,
  GetOnlineDurationRes,
  GetOnlineDurationStatsReq,
  GetOnlineDurationStatsRes,
  GetDeviceStatusRes,
  GetDeviceStatusHistoryReq,
  GetDeviceStatusHistoryRes,
  GetTrafficStatsReq,
  GetTrafficStatsRes,
  GetInfluxDBStatusRes,
} from './metrics.types';

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