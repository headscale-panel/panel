import request from '@/lib/request';
import type {
  ListGroupsReq,
  ListGroupsRes,
  CreateGroupReq,
  CreateGroupRes,
  UpdateGroupReq,
  UpdateGroupRes,
  DeleteGroupReq,
  DeleteGroupRes,
  GetPermissionsReq,
  GetPermissionsRes,
  UpdateGroupPermissionsReq,
  UpdateGroupPermissionsRes,
} from './group.types';

export const groupApi = {
  list: (req?: ListGroupsReq) =>
    request.get<any, ListGroupsRes>('/system/groups', {
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
      },
    }),
  create: (req: CreateGroupReq) => request.post<any, CreateGroupRes>('/system/groups', req),
  update: (req: UpdateGroupReq) => request.put<any, UpdateGroupRes>('/system/groups', req),
  delete: (req: DeleteGroupReq) => request.delete<any, DeleteGroupRes>('/system/groups', { data: req }),
  getPermissions: (_req?: GetPermissionsReq) => request.get<any, GetPermissionsRes>('/system/permissions'),
  updatePermissions: (req: UpdateGroupPermissionsReq) =>
    request.put<any, UpdateGroupPermissionsRes>('/system/groups/permissions', {
      id: req.id,
      permission_ids: req.permission_ids,
    }),
};
