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

import type { Account, AccountStatus, Role } from './entities';

export interface ListAccountsReq {
  q?: string;
  status?: AccountStatus;
  role_id?: number;
}

export type ListAccountsRes = Account[];

export interface GetAccountReq {
  id: number;
}
export type GetAccountRes = Account;

export interface CreateAccountReq {
  username: string;
  /** Omit to create an account that can only sign in through SSO. */
  password?: string;
  email?: string;
  display_name?: string;
  role_id: number;
}
export type CreateAccountRes = Account;

export interface UpdateAccountReq {
  id: number;
  display_name?: string;
  email?: string;
  role_id?: number;
}
export type UpdateAccountRes = Account;

export interface SetAccountStatusReq {
  id: number;
  status: AccountStatus;
}
export type SetAccountStatusRes = Account;

export interface SetAccountPasswordReq {
  id: number;
  password: string;
}

export interface DeleteAccountReq {
  id: number;
}

export interface AccountIdentity {
  id: number;
  account_id: number;
  provider: string;
  issuer: string;
  subject: string;
  email_at_link?: string;
  last_login_at?: string | null;
  created_at?: string;
}

export type ListAccountIdentitiesRes = AccountIdentity[];

export interface UnlinkAccountIdentityReq {
  id: number;
  identityId: number;
}

export interface AccountNetworkBinding {
  id: number;
  account_id: number;
  hs_user_id: number;
  is_primary: boolean;
  hs_cached_name?: string;
  hs_cached_email?: string;
  hs_cached_at?: string | null;
}

export type ListAccountBindingsRes = AccountNetworkBinding[];

export interface TransferBindingReq {
  id: number;
  hs_user_id: number;
}
export type TransferBindingRes = AccountNetworkBinding;

export type { Role };

export interface SetPrimaryBindingReq {
  id: number;
  hsUserId: number;
}
