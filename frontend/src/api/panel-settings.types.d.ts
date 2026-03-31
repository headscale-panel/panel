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

export type SaveConnectionRes = ConnectionSettings;

export interface SyncDataReq {}

export type SyncDataRes = { success: boolean; message?: string };

export interface GetBuiltinOIDCReq {}

export interface BuiltinOIDC {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  redirectUrl?: string;
}

export type GetBuiltinOIDCRes = BuiltinOIDC;

export interface EnableBuiltinOIDCReq {}

export type EnableBuiltinOIDCRes = BuiltinOIDC;

export interface GetOIDCSettingsReq {}

export interface OIDCSettings {
  enabled: boolean;
  provider?: string;
  clientId?: string;
  clientSecret?: string;
  authUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  scopes?: string[];
  [key: string]: any;
}

export type GetOIDCSettingsRes = OIDCSettings;

export interface SaveOIDCSettingsReq {
  [key: string]: any;
}

export type SaveOIDCSettingsRes = OIDCSettings;

export interface GetOIDCStatusReq {}

export interface OIDCStatus {
  oidc_enabled: boolean;
  third_party: boolean;
  builtin: boolean;
  password_required: boolean;
}

export type GetOIDCStatusRes = OIDCStatus;
