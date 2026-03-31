export interface ResourceItem {
  id: number;
  name: string;
  ip_address: string;
  port?: string;
  description?: string;
}

export interface ListResourcesReq {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface ListResourcesRes {
  list: ResourceItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateResourceReq {
  name: string;
  ip_address: string;
  port?: string;
  description?: string;
}
export interface CreateResourceRes {}

export interface UpdateResourceReq {
  id: number;
  name?: string;
  ip_address?: string;
  port?: string;
  description?: string;
}
export interface UpdateResourceRes {}

export interface DeleteResourceReq {
  id: number;
}
export interface DeleteResourceRes {}
