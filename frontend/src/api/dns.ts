import type {
  CreateDnsReq,
  CreateDnsRes,
  DeleteDnsReq,
  GetDnsFileRes,
  GetDnsReq,
  GetDnsRes,
  ListDnsReq,
  SyncDnsRes,
  UpdateDnsReq,
  UpdateDnsRes,
} from './dns.types';
import type { DNSRecord } from './entities';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const dnsApi = {
  list: (req?: ListDnsReq) =>
    request<RespType<RespPage<DNSRecord>>>({
      url: '/dns/records',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        all: req?.all ? 'true' : undefined,
        keyword: req?.keyword,
        type: req?.type,
      },
    }),

  get: (req: GetDnsReq) =>
    request<RespType<GetDnsRes>>({ url: `/dns/records/${req.id}`, method: 'GET' }),

  create: (req: CreateDnsReq) =>
    request<RespType<CreateDnsRes>>({ url: '/dns/records', method: 'POST', data: req }),

  update: (req: UpdateDnsReq) =>
    request<RespType<UpdateDnsRes>>({ url: '/dns/records', method: 'PUT', data: req }),

  delete: (req: DeleteDnsReq) =>
    request<RespType<void>>({ url: '/dns/records', method: 'DELETE', params: req }),

  sync: () =>
    request<RespType<SyncDnsRes>>({ url: '/dns/sync', method: 'POST' }),

  import: () =>
    request<RespType<void>>({ url: '/dns/import', method: 'POST' }),

  getFile: () =>
    request<RespType<GetDnsFileRes>>({ url: '/dns/file', method: 'GET' }),
};
