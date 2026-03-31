export interface DNSRecord {
  id: number;
  name: string;
  type: 'A' | 'AAAA';
  value: string;
  comment?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ListDnsReq {
  page?: number;
  pageSize?: number;
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
  type: 'A' | 'AAAA';
  value: string;
  comment?: string;
}
export type CreateDnsRes = DNSRecord;

export interface UpdateDnsReq {
  id: number;
  name?: string;
  type?: 'A' | 'AAAA';
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
  message: string;
  imported: number;
}

export interface GetDnsFileReq {}
export interface GetDnsFileRes {
  [key: string]: any;
}
