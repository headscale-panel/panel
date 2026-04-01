export interface DashboardOverviewReq {}
export interface DashboardOverviewRes {
  total_machines?: number;
  online_machines?: number;
  total_users?: number;
  total_routes?: number;
  [key: string]: unknown;
}

export interface DashboardTopologyReq {}
export interface DashboardTopologyRes {
  nodes?: Array<{
    id: string;
    label: string;
    ip?: string;
  }>;
  edges?: Array<{
    source: string;
    target: string;
  }>;
  [key: string]: unknown;
}

// Kept for backward compatibility with existing callers
export interface DashboardStatsReq {}
export interface DashboardStatsRes {
  [key: string]: unknown;
}

