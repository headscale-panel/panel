import request from '@/lib/request';
import type {
  DashboardOverviewReq,
  DashboardOverviewRes,
  DashboardTopologyReq,
  DashboardTopologyRes,
  DashboardACLMatrixReq,
  DashboardACLMatrixRes,
} from './dashboard.types';

export const dashboardApi = {
  getOverview: (_req?: DashboardOverviewReq) => request.get<any, DashboardOverviewRes>('/dashboard/overview'),
  getTopology: (_req?: DashboardTopologyReq) => request.get<any, DashboardTopologyRes>('/topology'),
  getTopologyWithACL: (_req?: DashboardTopologyReq) => request.get<any, DashboardTopologyRes>('/topology/with-acl'),
  getACLMatrix: (_req?: DashboardACLMatrixReq) => request.get<any, DashboardACLMatrixRes>('/topology/acl-matrix'),
};
