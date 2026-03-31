import request from '@/lib/request';
import type {
  ListHeadscaleUsersReq,
  ListHeadscaleUsersRes,
  CreateHeadscaleUserReq,
  CreateHeadscaleUserRes,
  RenameHeadscaleUserReq,
  RenameHeadscaleUserRes,
  DeleteHeadscaleUserReq,
  DeleteHeadscaleUserRes,
  GetPreAuthKeysReq,
  GetPreAuthKeysRes,
  CreatePreAuthKeyReq,
  CreatePreAuthKeyRes,
  ExpirePreAuthKeyReq,
  ExpirePreAuthKeyRes,
} from './headscale-user.types';

export const headscaleUserApi = {
  list: (req?: ListHeadscaleUsersReq) =>
    request.get<any, ListHeadscaleUsersRes>('/headscale/users', {
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 20,
      },
    }),
  create: (req: CreateHeadscaleUserReq) => request.post<any, CreateHeadscaleUserRes>('/headscale/users', req),
  rename: (req: RenameHeadscaleUserReq) =>
    request.put<any, RenameHeadscaleUserRes>('/headscale/users/rename', { old_name: req.oldName, new_name: req.newName }),
  delete: (req: DeleteHeadscaleUserReq) => request.delete<any, DeleteHeadscaleUserRes>('/headscale/users', { params: { name: req.name } }),
  getPreAuthKeys: (req: GetPreAuthKeysReq) => request.get<any, GetPreAuthKeysRes>('/headscale/preauthkeys', { params: req }),
  createPreAuthKey: (req: CreatePreAuthKeyReq) => request.post<any, CreatePreAuthKeyRes>('/headscale/preauthkeys', req),
  expirePreAuthKey: (req: ExpirePreAuthKeyReq) => request.post<any, ExpirePreAuthKeyRes>('/headscale/preauthkeys/expire', req),
};
