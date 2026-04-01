import request from '@/lib/request';
import type {
  ListDevicesReq,
  ListDevicesRes,
  GetDeviceReq,
  GetDeviceRes,
  RenameDeviceReq,
  RenameDeviceRes,
  DeleteDeviceReq,
  DeleteDeviceRes,
  ExpireDeviceReq,
  ExpireDeviceRes,
  SetDeviceTagsReq,
  SetDeviceTagsRes,
  GetDeviceRoutesReq,
  GetDeviceRoutesRes,
  RegisterNodeReq,
  RegisterNodeRes,
} from './device.types';

export const deviceApi = {
  list: (req?: ListDevicesReq) =>
    request.get<any, ListDevicesRes>('/headscale/machines', {
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
        user_id: req?.userId,
        status: req?.status,
      },
    }),
  get: (req: GetDeviceReq) => request.get<any, GetDeviceRes>(`/headscale/machines/${req.id}`),
  rename: (req: RenameDeviceReq) => request.put<any, RenameDeviceRes>(`/headscale/machines/${req.id}/rename`, { name: req.name }),
  delete: (req: DeleteDeviceReq) => request.delete<any, DeleteDeviceRes>(`/headscale/machines/${req.id}`),
  expire: (req: ExpireDeviceReq) => request.post<any, ExpireDeviceRes>(`/headscale/machines/${req.id}/expire`),
  setTags: (req: SetDeviceTagsReq) => request.put<any, SetDeviceTagsRes>(`/headscale/machines/${req.id}/tags`, { tags: req.tags }),
  getRoutes: (req: GetDeviceRoutesReq) => request.get<any, GetDeviceRoutesRes>(`/headscale/machines/${req.id}/routes`),
  registerNode: (req: RegisterNodeReq) => request.post<any, RegisterNodeRes>('/headscale/machines/register', req),
};
