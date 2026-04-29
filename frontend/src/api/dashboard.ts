import type {
  DashboardACLMatrixReq,
  DashboardACLMatrixRes,
  DashboardOverviewReq,
  DashboardOverviewRes,
  DashboardTopologyReq,
  DashboardTopologyRes,
} from './dashboard.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

export const dashboardApi = {
  getOverview: (_req?: DashboardOverviewReq) =>
    request<RespType<DashboardOverviewRes>>({ url: '/dashboard/overview', method: 'GET' }),

  getTopology: (_req?: DashboardTopologyReq) =>
    request<RespType<DashboardTopologyRes>>({ url: '/topology', method: 'GET' }),

  getTopologyWithACL: (_req?: DashboardTopologyReq) =>
    request<RespType<DashboardTopologyRes>>({ url: '/topology/with-acl', method: 'GET' }),

  getACLMatrix: (_req?: DashboardACLMatrixReq) =>
    request<RespType<DashboardACLMatrixRes>>({ url: '/topology/acl-matrix', method: 'GET' }),
};
