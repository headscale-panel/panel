import request, { RespType } from '@/lib/request';
import type { GetSystemStatusRes, GetHeadscaleStatusRes } from './status.types';

export const statusApi = {
  /** GET /status — global panel + headscale runtime status (requires auth). */
  getSystemStatus: () =>
    request<RespType<GetSystemStatusRes>>({ url: '/status', method: 'GET' }),

  /** GET /headscale/status — lightweight headscale gRPC liveness probe (requires auth). */
  getHeadscaleStatus: () =>
    request<RespType<GetHeadscaleStatusRes>>({ url: '/headscale/status', method: 'GET' }),
};