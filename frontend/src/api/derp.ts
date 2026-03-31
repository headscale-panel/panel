import request from '@/lib/request';
import type {
  GetDerpReq,
  GetDerpRes,
} from './derp.types';

export const derpApi = {
  get: (req?: GetDerpReq) =>
    request.get<any, GetDerpRes>('/headscale/derp'),
};
