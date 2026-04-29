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
