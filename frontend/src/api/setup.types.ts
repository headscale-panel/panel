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

export interface GetSetupStatusReq {}

export interface GetSetupStatusRes {
  initialized?: boolean;
  bootstrap_configured?: boolean;
  setup_window_open?: boolean;
  setup_window_deadline?: string;
  init_token?: string;
}

export interface ConnectivityCheckReq {
  headscale_grpc_addr?: string;
  api_key?: string;
  strict_api?: boolean;
  grpc_allow_insecure?: boolean;
  grpc_tls_skip_verify?: boolean;
  grpc_tls_ca_cert?: string;
}

export interface ConnectivityCheckRes {
  all_reachable?: boolean;
  checks?: Array<{
    name: string;
    address?: string;
    reachable: boolean;
    detail: string;
  }>;
}

export interface InitSetupReq {
  headscale_grpc_addr?: string;
  api_key?: string;
  enable_tls?: boolean;
  tls_skip_verify?: boolean;
  tls_ca_cert?: string;
  username?: string;
  password?: string;
  email?: string;
}

export interface InitSetupRes {
  user?: {
    username?: string;
  };
  password_generated?: boolean;
  generated_password?: string;
}
