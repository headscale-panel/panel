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

export interface LoginReq {
  username: string;
  password: string;
  totp_code?: string;
}

export interface LoginRes {
  token: string;
  user: User;
  permissions?: string[];
}

export interface RegisterReq {
  username: string;
  password: string;
  email: string;
}

export interface RegisterRes {
  id?: number;
  username: string;
}

export interface UserInfoReq {}
export type UserInfoRes = User;
export interface MarkGuideTourSeenReq {}
export interface MarkGuideTourSeenRes {}

export interface GenerateTOTPReq {}
export interface GenerateTOTPRes {
  secret: string;
  url: string;
}

export interface EnableTOTPReq {
  code: string;
}
export interface EnableTOTPRes {}

export interface OidcCallbackReq {
  code: string;
  state: string;
}

export interface OidcCallbackRes {
  token?: string;
  user?: User;
  permissions?: string[];
}

export interface OidcCreateHeadscaleUserCallbackRes {
  created: boolean;
  updated_existing: boolean;
  user?: {
    id?: number;
    name?: string;
    display_name?: string;
    email?: string;
    provider?: string;
  };
}

export interface OidcStatusReq {}

export interface OidcStatusRes {
  enabled: boolean;
  builtin?: boolean;
  provider_name?: string;
  issuer?: string;
}

export interface OidcLoginReq {}
export interface OidcLoginRes {
  redirect_url: string;
}
