export interface ListSystemUsersReq {
  page?: number;
  pageSize?: number;
}

export interface SystemUserItem {
  id: number;
  username: string;
  email?: string;
  group_id?: number;
  is_active?: boolean;
  headscale_name?: string;
  display_name?: string;
}

export interface ListSystemUsersRes {
  list: SystemUserItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateSystemUserReq {
  username: string;
  password?: string;
  email?: string;
  group_id?: number;
  headscale_name?: string;
  display_name?: string;
}

export interface CreateSystemUserRes {}

export interface UpdateSystemUserReq {
  id: number;
  email?: string;
  group_id?: number;
  is_active?: boolean;
  password?: string;
  display_name?: string;
}

export interface UpdateSystemUserRes {}

export interface DeleteSystemUserReq {
  id: number;
}

export interface DeleteSystemUserRes {}
