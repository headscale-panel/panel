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

import type {
  Binding,
  IdentityOrigin,
  NetworkIdentity,
  ReconcileResult,
} from './entities';

export interface ListNetworkIdentitiesReq {
  q?: string;
  origin?: IdentityOrigin;
  orphaned?: boolean;
  bound?: boolean;
}

export type ListNetworkIdentitiesRes = NetworkIdentity[];

export interface GetNetworkIdentityReq {
  hsUserId: number;
}
export type GetNetworkIdentityRes = NetworkIdentity;

export interface CreateNetworkIdentityReq {
  name: string;
  display_name?: string;
  email?: string;
}
export type CreateNetworkIdentityRes = NetworkIdentity;

export interface RenameNetworkIdentityReq {
  hsUserId: number;
  name: string;
}
export type RenameNetworkIdentityRes = NetworkIdentity;

export interface DeleteNetworkIdentityReq {
  hsUserId: number;
}

export interface BindNetworkIdentityReq {
  hsUserId: number;
  account_id: number;
  primary?: boolean;
}

export interface UnbindNetworkIdentityReq {
  hsUserId: number;
}

export type ReconcileBindingsRes = ReconcileResult;

export type ListBindingsRes = Binding[];

export interface OrphanBinding extends Binding {
  reason: string;
}
export type ListOrphanBindingsRes = OrphanBinding[];
