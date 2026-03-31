export interface ListHeadscaleUsersReq {
  page?: number;
  pageSize?: number;
}

export interface HeadscaleUserItem {
  [key: string]: any;
}

export interface ListHeadscaleUsersRes {
  list: HeadscaleUserItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateHeadscaleUserReq {
  name: string;
}
export interface CreateHeadscaleUserRes {
  [key: string]: any;
}

export interface RenameHeadscaleUserReq {
  oldName: string;
  newName: string;
}
export interface RenameHeadscaleUserRes {}

export interface DeleteHeadscaleUserReq {
  name: string;
}
export interface DeleteHeadscaleUserRes {}

export interface GetPreAuthKeysReq {
  user: string;
}
export interface GetPreAuthKeysRes {
  [key: string]: any;
}

export interface CreatePreAuthKeyReq {
  user: string;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
}
export interface CreatePreAuthKeyRes {
  [key: string]: any;
}

export interface ExpirePreAuthKeyReq {
  user: string;
  key: string;
}
export interface ExpirePreAuthKeyRes {}
