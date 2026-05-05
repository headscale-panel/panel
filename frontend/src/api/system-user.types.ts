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

import type { User } from './entities';

export interface ListSystemUsersReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
}

export interface ListSystemUsersRes {
  list: User[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreateSystemUserReq {
  username: string;
  password?: string;
  email: string;
  group_id?: number;
  display_name: string;
}

export interface CreateSystemUserRes extends User {}

export interface UpdateSystemUserReq {
  id: number;
  email?: string;
  group_id?: number;
  password?: string;
  display_name?: string;
}

export interface UpdateSystemUserRes {}

export interface DeleteSystemUserReq {
  id: number;
}

export interface DeleteSystemUserRes {}
