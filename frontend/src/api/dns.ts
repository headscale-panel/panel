/*
 * Copyright (C) 2026 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

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
