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
