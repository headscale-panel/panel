import request, { RespType, RespPage } from '@/lib/request';
import type { Resource } from './entities';
import type {
  ListResourcesReq,
  CreateResourceReq,
  CreateResourceRes,
  UpdateResourceReq,
  DeleteResourceReq,
} from './resource.types';

export const resourceApi = {
  list: (req?: ListResourcesReq) =>
    request<RespType<RespPage<Resource>>>({
      url: '/resources',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
        keyword: req?.keyword,
      },
    }),

  create: (req: CreateResourceReq) =>
    request<RespType<CreateResourceRes>>({ url: '/resources', method: 'POST', data: req }),

  update: (req: UpdateResourceReq) =>
    request<RespType<void>>({ url: '/resources', method: 'PUT', data: req }),

  delete: (req: DeleteResourceReq) =>
    request<RespType<void>>({ url: '/resources', method: 'DELETE', params: req }),
};