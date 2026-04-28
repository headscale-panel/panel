import request, { RespType, RespPage } from '@/lib/request';
import type { HeadscaleUser, HeadscaleAuthKey } from './entities';
import type {
  ListHeadscaleUsersReq,
  CreateHeadscaleUserReq,
  CreateHeadscaleUserRes,
  RenameHeadscaleUserReq,
  DeleteHeadscaleUserReq,
  GetPreAuthKeysReq,
  CreatePreAuthKeyReq,
  ExpirePreAuthKeyReq,
} from './headscale-user.types';

export const headscaleUserApi = {
  list: (req?: ListHeadscaleUsersReq) =>
    request<RespType<RespPage<HeadscaleUser>>>({
      url: '/headscale/users',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
      },
    }),

  create: (req: CreateHeadscaleUserReq) =>
    request<RespType<CreateHeadscaleUserRes>>({
      url: '/headscale/users',
      method: 'POST',
      data: req,
    }),

  rename: (req: RenameHeadscaleUserReq) =>
    request<RespType<void>>({
      url: '/headscale/users/rename',
      method: 'PUT',
      data: req,
    }),

  delete: (req: DeleteHeadscaleUserReq) =>
    request<RespType<void>>({
      url: '/headscale/users',
      method: 'DELETE',
      params: { name: req.name },
    }),

  getPreAuthKeys: (req: GetPreAuthKeysReq) =>
    request<RespType<HeadscaleAuthKey[]>>({
      url: '/headscale/preauthkeys',
      method: 'GET',
      params: req,
    }),

  createPreAuthKey: (req: CreatePreAuthKeyReq) =>
    request<RespType<HeadscaleAuthKey>>({
      url: '/headscale/preauthkeys',
      method: 'POST',
      data: req,
    }),

  expirePreAuthKey: (req: ExpirePreAuthKeyReq) =>
    request<RespType<void>>({
      url: '/headscale/preauthkeys/expire',
      method: 'POST',
      data: req,
    }),
};