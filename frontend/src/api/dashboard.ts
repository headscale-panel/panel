import request from '@/lib/request';
import type {
  DashboardOverviewReq,
  DashboardOverviewRes,
  DashboardTopologyReq,
  DashboardTopologyRes,
  DashboardStatsReq,
  DashboardStatsRes,
} from './dashboard.types';

export const dashboardApi = {
  getOverview: (_req?: DashboardOverviewReq) => request.get<any, DashboardOverviewRes>('/dashboard/overview'),
  getTopology: (_req?: DashboardTopologyReq) => request.get<any, DashboardTopologyRes>('/topology'),
  getTopologyWithACL: (_req?: DashboardTopologyReq) => request.get<any, DashboardTopologyRes>('/topology/with-acl'),
  getStats: (_req?: DashboardStatsReq) => request.get<any, DashboardStatsRes>('/dashboard/stats'),
};
