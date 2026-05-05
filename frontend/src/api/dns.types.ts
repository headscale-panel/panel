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

import type { DNSRecord } from './entities';
import type { DNSRecordType } from '@/lib/enums';

export interface ListDnsReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
  keyword?: string;
  type?: string;
}

export interface ListDnsRes {
  list: DNSRecord[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface GetDnsReq {
  id: number;
}
export type GetDnsRes = DNSRecord;

export interface CreateDnsReq {
  name: string;
  type: DNSRecordType;
  value: string;
  comment?: string;
}
export type CreateDnsRes = DNSRecord;

export interface UpdateDnsReq {
  id: number;
  name?: string;
  type?: DNSRecordType;
  value?: string;
  comment?: string;
}
export type UpdateDnsRes = DNSRecord;

export interface DeleteDnsReq {
  id: number;
}
export interface DeleteDnsRes {}

export interface SyncDnsReq {}
export interface SyncDnsRes {
  message: string;
}

export interface ImportDnsReq {}
export interface ImportDnsRes {
  message?: string;
}

export interface GetDnsFileReq {}
export type GetDnsFileRes = DNSRecord[];
