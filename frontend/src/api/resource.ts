import request from '@/lib/request';
import type {
  ListResourcesReq,
  ListResourcesRes,
  CreateResourceReq,
  CreateResourceRes,
  UpdateResourceReq,
  UpdateResourceRes,
  DeleteResourceReq,
  DeleteResourceRes,
} from './resource.types';

export const resourceApi = {
  list: (req?: ListResourcesReq) =>
    request.get<any, ListResourcesRes>('/resources', {
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 20,
        keyword: req?.keyword,
      },
    }),
  create: (req: CreateResourceReq) => request.post<any, CreateResourceRes>('/resources', req),
  update: (req: UpdateResourceReq) => request.put<any, UpdateResourceRes>('/resources', req),
  delete: (req: DeleteResourceReq) => request.delete<any, DeleteResourceRes>('/resources', { params: req }),
};
