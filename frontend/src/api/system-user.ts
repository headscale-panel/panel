import request from '@/lib/request';
import type {
  ListSystemUsersReq,
  ListSystemUsersRes,
  CreateSystemUserReq,
  CreateSystemUserRes,
  UpdateSystemUserReq,
  UpdateSystemUserRes,
  DeleteSystemUserReq,
  DeleteSystemUserRes,
} from './system-user.types';

export const systemUserApi = {
  list: (req?: ListSystemUsersReq) =>
    request.get<any, ListSystemUsersRes>('/system/users', {
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
      },
    }),
  create: (req: CreateSystemUserReq) => request.post<any, CreateSystemUserRes>('/system/users', req),
  update: (req: UpdateSystemUserReq) => request.put<any, UpdateSystemUserRes>('/system/users', req),
  delete: (req: DeleteSystemUserReq) => request.delete<any, DeleteSystemUserRes>('/system/users', { data: req }),
};
