export interface ListRoutesReq {
  page?: number;
  pageSize?: number;
  userId?: string;
  machineId?: string;
}

export interface RouteItem {
  [key: string]: any;
}

export interface ListRoutesRes {
  list: RouteItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface ToggleRouteReq {
  machineId: number;
  destination: string;
}

export interface ToggleRouteRes {}
