import type {
  DeleteDeviceReq,
  ExpireDeviceReq,
  GetDeviceReq,
  GetDeviceRes,
  GetDeviceRoutesReq,
  GetDeviceRoutesRes,
  ListDevicesReq,
  RegisterNodeReq,
  RenameDeviceReq,
  SetDeviceTagsReq,
} from './device.types';
import type { HeadscaleMachine } from './entities';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const deviceApi = {
  list: (req?: ListDevicesReq) =>
    request<RespType<RespPage<HeadscaleMachine>>>({
      url: '/headscale/machines',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
        user_id: req?.userId,
        status: req?.status,
      },
    }),

  get: (req: GetDeviceReq) =>
    request<RespType<GetDeviceRes>>({ url: `/headscale/machines/${req.id}`, method: 'GET' }),

  rename: (req: RenameDeviceReq) =>
    request<RespType<HeadscaleMachine>>({
      url: `/headscale/machines/${req.id}/rename`,
      method: 'PUT',
      data: { name: req.name },
    }),

  delete: (req: DeleteDeviceReq) =>
    request<RespType<void>>({ url: `/headscale/machines/${req.id}`, method: 'DELETE' }),

  expire: (req: ExpireDeviceReq) =>
    request<RespType<HeadscaleMachine>>({
      url: `/headscale/machines/${req.id}/expire`,
      method: 'POST',
    }),

  setTags: (req: SetDeviceTagsReq) =>
    request<RespType<HeadscaleMachine>>({
      url: `/headscale/machines/${req.id}/tags`,
      method: 'PUT',
      data: { tags: req.tags },
    }),

  getRoutes: (req: GetDeviceRoutesReq) =>
    request<RespType<GetDeviceRoutesRes>>({
      url: `/headscale/machines/${req.id}/routes`,
      method: 'GET',
    }),

  registerNode: (req: RegisterNodeReq) =>
    request<RespType<HeadscaleMachine>>({
      url: '/headscale/machines/register',
      method: 'POST',
      data: req,
    }),
};
