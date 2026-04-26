import request from '@/lib/request';
import type { GetSystemStatusRes, GetHeadscaleStatusRes } from './status.types';

export const statusApi = {
  /** GET /status — global panel + headscale runtime status (requires auth). */
  getSystemStatus: () => request.get<any, GetSystemStatusRes>('/status'),
  /** GET /headscale/status — lightweight headscale gRPC liveness probe (requires auth). */
  getHeadscaleStatus: () => request.get<any, GetHeadscaleStatusRes>('/headscale/status'),
};
