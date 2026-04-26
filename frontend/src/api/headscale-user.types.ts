import type { HeadscaleUser, HeadscaleAuthKey } from './entities';

export interface ListHeadscaleUsersReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
}

export interface ListHeadscaleUsersRes {
  list: HeadscaleUser[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateHeadscaleUserReq {
  name: string;
  display_name: string;
  email: string;
}
export type CreateHeadscaleUserRes = HeadscaleUser;

export interface RenameHeadscaleUserReq {
  old_name: string;
  new_name: string;
}
export interface RenameHeadscaleUserRes {}

export interface DeleteHeadscaleUserReq {
  name: string;
}
export interface DeleteHeadscaleUserRes {}

export interface GetPreAuthKeysReq {
  user: string;
}
export type GetPreAuthKeysRes = HeadscaleAuthKey[];

export interface CreatePreAuthKeyReq {
  user: string;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
}
export type CreatePreAuthKeyRes = HeadscaleAuthKey;

export interface ExpirePreAuthKeyReq {
  user: string;
  key: string;
}
export interface ExpirePreAuthKeyRes {}

