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

// GET /topology/acl-matrix
export interface DashboardACLMatrixReq {}
export interface DashboardACLMatrixRes {
  [key: string]: unknown;
}
