import type { User } from './entities';
import type {
  CreateSystemUserReq,
  CreateSystemUserRes,
  DeleteSystemUserReq,
  ListSystemUsersReq,
  UpdateSystemUserReq,
} from './system-user.types';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const systemUserApi = {
  list: (req?: ListSystemUsersReq) =>
    request<RespType<RespPage<User>>>({
      url: '/system/users',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
      },
    }),

  create: (req: CreateSystemUserReq) =>
    request<RespType<CreateSystemUserRes>>({ url: '/system/users', method: 'POST', data: req }),

  update: (req: UpdateSystemUserReq) =>
    request<RespType<void>>({ url: '/system/users', method: 'PUT', data: req }),

  delete: (req: DeleteSystemUserReq) =>
    request<RespType<void>>({ url: '/system/users', method: 'DELETE', data: req }),
};
