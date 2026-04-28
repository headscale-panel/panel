import request, { RespType, RespPage } from '@/lib/request';
import type { RouteItem } from './route.types';
import type {
  ListRoutesReq,
  ToggleRouteReq,
} from './route.types';

export const routeApi = {
  list: (req?: ListRoutesReq) =>
    request<RespType<RespPage<RouteItem>>>({
      url: '/routes',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
        user_id: req?.userId,
        machine_id: req?.machine_id,
      },
    }),

  enable: (req: ToggleRouteReq) =>
    request<RespType<void>>({
      url: '/routes/enable',
      method: 'POST',
      data: { machine_id: req.machine_id, destination: req.destination },
    }),

  disable: (req: ToggleRouteReq) =>
    request<RespType<void>>({
      url: '/routes/disable',
      method: 'POST',
      data: { machine_id: req.machine_id, destination: req.destination },
    }),
};