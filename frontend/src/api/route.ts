import request from '@/lib/request';
import type { ListRoutesReq, ListRoutesRes, ToggleRouteReq, ToggleRouteRes } from './route.types';

export const routeApi = {
  list: (req?: ListRoutesReq) =>
    request.get<any, ListRoutesRes>('/routes', {
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 20,
        user_id: req?.userId,
        machine_id: req?.machineId,
      },
    }),
  enable: (req: ToggleRouteReq) => request.post<any, ToggleRouteRes>('/routes/enable', { machine_id: req.machineId, destination: req.destination }),
  disable: (req: ToggleRouteReq) => request.post<any, ToggleRouteRes>('/routes/disable', { machine_id: req.machineId, destination: req.destination }),
};
