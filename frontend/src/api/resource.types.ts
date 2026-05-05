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

import type { Resource } from './entities';

export interface ListResourcesReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
  keyword?: string;
}

export interface ListResourcesRes {
  list: Resource[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateResourceReq {
  name: string;
  ip_address: string;
  port?: string;
  description?: string;
}
export type CreateResourceRes = Resource;

export interface UpdateResourceReq {
  id: number;
  name?: string;
  ip_address?: string;
  port?: string;
  description?: string;
}
export interface UpdateResourceRes {}

export interface DeleteResourceReq {
  id: number;
}
export interface DeleteResourceRes {}
