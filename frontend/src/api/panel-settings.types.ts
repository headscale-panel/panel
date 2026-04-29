export interface GetConnectionReq {}

export interface ConnectionSettings {
  grpc_addr: string;
  api_key?: string;
  insecure: boolean;
}

export type GetConnectionRes = ConnectionSettings;

export interface SaveConnectionReq {
  grpc_addr: string;
  api_key?: string;
  insecure: boolean;
}

export interface SaveConnectionRes { message: string }

export interface SyncDataReq {}
export interface SyncDataRes { message: string }

export interface GetBuiltinOIDCReq {}

export interface BuiltinOIDCConfig {
  enabled?: boolean;
  client_id?: string;
  client_secret?: string;
  redirect_url?: string;
}

export type GetBuiltinOIDCRes = BuiltinOIDCConfig;
export type EnableBuiltinOIDCRes = BuiltinOIDCConfig;

export interface EnableBuiltinOIDCReq {}

export interface GetOIDCSettingsReq {}

export interface OIDCSettingsPayload {
  enabled?: boolean;
  issuer?: string;
  client_id?: string;
  client_secret?: string;
  client_secret_path?: string;
  scope?: string[];
  allowed_domains?: string[];
  allowed_groups?: string[];
  allowed_users?: string[];
  strip_email_domain?: boolean;
  email_verified_required?: boolean;
  pkce_enabled?: boolean;
  pkce_method?: string;
  only_start_if_oidc_is_available?: boolean;
  expiry?: string;
  use_expiry_from_token?: boolean;
}

export type GetOIDCSettingsRes = OIDCSettingsPayload | null;

export interface SaveOIDCSettingsReq extends OIDCSettingsPayload {}
export interface SaveOIDCSettingsRes { message: string }

export interface GetOIDCStatusReq {}

export interface OIDCStatusRes {
  oidc_enabled: boolean;
  third_party: boolean;
  builtin: boolean;
  password_required: boolean;
}

export type GetOIDCStatusRes = OIDCStatusRes;
