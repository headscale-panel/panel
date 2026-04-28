import request, { RespType } from '@/lib/request';
import type {
  GetSetupStatusReq,
  GetSetupStatusRes,
  ConnectivityCheckReq,
  ConnectivityCheckRes,
  InitSetupReq,
  InitSetupRes,
} from './setup.types';

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