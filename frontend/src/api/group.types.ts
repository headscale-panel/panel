import type { Group, Permission } from './entities';

export type { Group, Permission };

export interface ListGroupsReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
}

export interface ListGroupsRes {
  list: Group[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateGroupReq {
  name: string;
  permission_ids?: number[];
}
export interface CreateGroupRes extends Group {}

export interface UpdateGroupReq {
  id: number;
  name: string;
  permission_ids?: number[];
}
export interface UpdateGroupRes {}

export interface DeleteGroupReq {
  id: number;
}
export interface DeleteGroupRes {}

export interface GetPermissionsReq {}
export type GetPermissionsRes = Permission[];

export interface UpdateGroupPermissionsReq {
  id: number;
  permission_ids: number[];
}
export interface UpdateGroupPermissionsRes {}

export interface AddGroupPermissionsReq {
  id: number;
  permission_ids: number[];
}
export interface AddGroupPermissionsRes {}

export interface RemoveGroupPermissionsReq {
  id: number;
  permission_ids: number[];
}
export interface RemoveGroupPermissionsRes {}

