import type { Resource } from './entities';

export type { Resource };

export interface ListResourcesReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
  keyword?: string;
}

export interface ListResourcesRes {
  list: Resource[];
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
export type CreateResourceRes = Resource;

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

