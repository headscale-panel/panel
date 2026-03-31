export interface ListGroupsReq {
  page?: number;
  pageSize?: number;
}

export interface GroupItem {
  id: number;
  name: string;
  permission_ids?: number[];
}

export interface ListGroupsRes {
  list: GroupItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateGroupReq {
  name: string;
  permission_ids?: number[];
}
export interface CreateGroupRes extends GroupItem {}

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
export interface PermissionItem {
  id: number;
  key: string;
  name?: string;
}
export type GetPermissionsRes = PermissionItem[];

export interface UpdateGroupPermissionsReq {
  id: number;
  permissionIds: number[];
}
export interface UpdateGroupPermissionsRes {}
