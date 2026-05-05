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
