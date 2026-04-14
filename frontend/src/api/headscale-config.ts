import request from '@/lib/request';
import type {
  HeadscaleConfig,
  GetConfigRes,
  UpdateConfigReq,
  PreviewConfigReq,
  PreviewConfigRes,
} from './headscale-config.types';

export const headscaleConfigApi = {
  get: () =>
    request.get<any, GetConfigRes>('/headscale/config'),

  update: (req: UpdateConfigReq) =>
    request.put<any, void>('/headscale/config', req),

  preview: (req: PreviewConfigReq) =>
    request.post<any, PreviewConfigRes>('/headscale/config/preview', req),
};
