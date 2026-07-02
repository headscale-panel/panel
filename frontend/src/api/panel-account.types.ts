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

// ─── Panel Account types ────────────────────────────────────────────────────

export interface PanelAccountGroupRef {
  id: number;
  name: string;
}

export interface PanelAccountListItem {
  id: number;
  username: string;
  email: string;
  display_name: string;
  is_active: boolean;
  group: PanelAccountGroupRef | null;
  login_methods: string[];
  network_binding_count: number;
  created_at: string;
  updated_at: string;
}

export interface PanelPermissionItem {
  code: string;
  name: string;
  type: string;
}

export interface PanelAccountGroupDetail {
  id: number;
  name: string;
  permissions: PanelPermissionItem[];
}

export interface LocalLoginIdentity {
  enabled: boolean;
  has_password: boolean;
  totp_enabled: boolean;
}

export interface OIDCLoginIdentity {
  bound: boolean;
  provider?: string;
  provider_id?: string;
  email?: string;
}

export interface LoginIdentities {
  local: LocalLoginIdentity | null;
  oidc: OIDCLoginIdentity | null;
}

export interface NetworkBinding {
  id: number;
  headscale_id: number;
  headscale_name: string;
  display_name: string;
  email: string;
  provider: string;
  is_primary: boolean;
}

export interface PanelAccountDetail {
  id: number;
  username: string;
  email: string;
  display_name: string;
  is_active: boolean;
  group: PanelAccountGroupDetail | null;
  login_identities: LoginIdentities | null;
  network_bindings: NetworkBinding[];
  created_at: string;
  updated_at: string;
}

export interface NetworkIdentityItem {
  id: number;
  name: string;
  display_name: string;
  email: string;
  provider: string;
}

// ─── Request / Response types ───────────────────────────────────────────────

export interface ListPanelAccountsReq {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  group_id?: number;
  provider?: string;
}

export interface ListPanelAccountsRes {
  list: PanelAccountListItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface CreatePanelAccountReq {
  username: string;
  password?: string;
  email?: string;
  group_id?: number;
}

export interface PanelAccountImportRow {
  row_number?: number;
  username: string;
  password: string;
  email?: string;
  display_name?: string;
  group_id?: number;
  group_name?: string;
  is_active?: boolean;
}

export interface ImportPanelAccountsReq {
  dry_run: boolean;
  rows: PanelAccountImportRow[];
}

export interface PanelAccountImportRowResult {
  row_number: number;
  username: string;
  email: string;
  display_name: string;
  group_id: number;
  group_name: string;
  is_active: boolean;
  valid: boolean;
  errors?: string[];
}

export interface PanelAccountImportResult {
  dry_run: boolean;
  total: number;
  valid: number;
  invalid: number;
  imported: number;
  rows: PanelAccountImportRowResult[];
  can_import: boolean;
  has_errors: boolean;
}

export interface UpdatePanelAccountReq {
  email?: string;
  display_name?: string;
  password?: string;
  group_id?: number;
}

export interface SetStatusReq {
  is_active: boolean;
}

export interface BindingEntry {
  headscale_name: string;
  is_primary: boolean;
}

export interface UpdateNetworkBindingsReq {
  bindings: BindingEntry[];
}

export interface SetPrimaryBindingReq {
  binding_id: number;
}

export interface ListAvailableNetworkIdentitiesReq {
  search?: string;
  exclude_account_id?: number;
}
