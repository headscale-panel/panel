import request from '@/lib/request';
import type {
  ListDnsReq,
  ListDnsRes,
  GetDnsReq,
  GetDnsRes,
  CreateDnsReq,
  CreateDnsRes,
  UpdateDnsReq,
  UpdateDnsRes,
  DeleteDnsReq,
  DeleteDnsRes,
  SyncDnsReq,
  SyncDnsRes,
  ImportDnsReq,
  ImportDnsRes,
  GetDnsFileReq,
  GetDnsFileRes,
} from './dns.types';

export const dnsApi = {
  list: (req?: ListDnsReq) =>
    request.get<any, ListDnsRes>('/dns/records', {
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 50,
        keyword: req?.keyword,
        type: req?.type,
      },
    }),
  get: (req: GetDnsReq) => request.get<any, GetDnsRes>(`/dns/records/${req.id}`),
  create: (req: CreateDnsReq) => request.post<any, CreateDnsRes>('/dns/records', req),
  update: (req: UpdateDnsReq) => request.put<any, UpdateDnsRes>('/dns/records', req),
  delete: (req: DeleteDnsReq) => request.delete<any, DeleteDnsRes>('/dns/records', { params: req }),
  sync: (_req?: SyncDnsReq) => request.post<any, SyncDnsRes>('/dns/sync'),
  import: (_req?: ImportDnsReq) => request.post<any, ImportDnsRes>('/dns/import'),
  getFile: (_req?: GetDnsFileReq) => request.get<any, GetDnsFileRes>('/dns/file'),
};
