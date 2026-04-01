import request from '@/lib/request';
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
    request.get<any, GetOnlineDurationRes>('/metrics/online-duration', {
      params: {
        user_id: req?.user_id,
        machine_id: req?.machine_id,
        start: req?.start,
        end: req?.end,
      },
    }),

  getOnlineDurationStats: (req?: GetOnlineDurationStatsReq) =>
    request.get<any, GetOnlineDurationStatsRes>('/metrics/online-duration-stats', {
      params: {
        start: req?.start,
        end: req?.end,
      },
    }),

  getDeviceStatus: () =>
    request.get<any, GetDeviceStatusRes>('/metrics/device-status'),

  getDeviceStatusHistory: (req: GetDeviceStatusHistoryReq) =>
    request.get<any, GetDeviceStatusHistoryRes>('/metrics/device-status-history', {
      params: {
        machine_id: req.machine_id,
        start: req.start,
        end: req.end,
      },
    }),

  getTrafficStats: (req?: GetTrafficStatsReq) =>
    request.get<any, GetTrafficStatsRes>('/metrics/traffic', {
      params: {
        machine_id: req?.machine_id,
        start: req?.start,
        end: req?.end,
      },
    }),

  getInfluxDBStatus: () =>
    request.get<any, GetInfluxDBStatusRes>('/metrics/influxdb-status'),
};
