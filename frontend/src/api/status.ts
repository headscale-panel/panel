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
