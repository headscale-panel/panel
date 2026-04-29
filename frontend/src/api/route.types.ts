export interface ListRoutesReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
  userId?: string;
  machine_id?: string;
}

export interface RouteItem {
  id?: number;
  machine_id?: number;
  prefix?: string;
  advertised?: boolean;
  enabled?: boolean;
  is_primary?: boolean;
}

export interface ListRoutesRes {
  list: RouteItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface ToggleRouteReq {
  machine_id: number;
  destination: string;
}

export interface ToggleRouteRes {}
