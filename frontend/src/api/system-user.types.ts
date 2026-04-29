import type { User } from './entities';

export interface ListSystemUsersReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
}

export interface ListSystemUsersRes {
  list: User[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateSystemUserReq {
  username: string;
  password?: string;
  email: string;
  group_id?: number;
  display_name: string;
}

export interface CreateSystemUserRes extends User {}

export interface UpdateSystemUserReq {
  id: number;
  email?: string;
  group_id?: number;
  password?: string;
  display_name?: string;
}

export interface UpdateSystemUserRes {}

export interface DeleteSystemUserReq {
  id: number;
}

export interface DeleteSystemUserRes {}
