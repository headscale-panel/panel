import type { Group } from './entities';
import type {
  CreateGroupReq,
  CreateGroupRes,
  DeleteGroupReq,
  GetPermissionsRes,
  ListGroupsReq,
  UpdateGroupPermissionsReq,
  UpdateGroupReq,
} from './group.types';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const groupApi = {
  list: (req?: ListGroupsReq) =>
    request<RespType<RespPage<Group>>>({
      url: '/system/groups',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
      },
    }),

  create: (req: CreateGroupReq) =>
    request<RespType<CreateGroupRes>>({ url: '/system/groups', method: 'POST', data: req }),

  update: (req: UpdateGroupReq) =>
    request<RespType<void>>({ url: '/system/groups', method: 'PUT', data: req }),

  delete: (req: DeleteGroupReq) =>
    request<RespType<void>>({ url: '/system/groups', method: 'DELETE', data: req }),

  getPermissions: () =>
    request<RespType<GetPermissionsRes>>({ url: '/system/permissions', method: 'GET' }),

  updatePermissions: (req: UpdateGroupPermissionsReq) =>
    request<RespType<void>>({
      url: '/system/groups/permissions',
      method: 'PUT',
      data: { id: req.id, permission_ids: req.permission_ids },
    }),
};
