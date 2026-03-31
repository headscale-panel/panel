import request from '@/lib/request';
import type {
  GetConfigReq,
  GetConfigRes,
  PreviewConfigReq,
  PreviewConfigRes,
} from './headscale-config.types';

export const headscaleConfigApi = {
  get: (req?: GetConfigReq) =>
    request.get<any, GetConfigRes>('/headscale/config'),

  preview: (req: PreviewConfigReq) =>
    request.post<any, PreviewConfigRes>('/headscale/config/preview', req),
};
