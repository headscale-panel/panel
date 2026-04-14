export interface HSNoiseConfig {
  private_key_path?: string;
}

export interface HSPrefixes {
  v4?: string;
  allocation?: string;
}

export interface HSEmbeddedDERPServer {
  enabled?: boolean;
}

export interface HSDERPConfig {
  server?: HSEmbeddedDERPServer;
  paths?: string[];
}

export interface HSSQLiteDB {
  path?: string;
  write_ahead_log?: boolean;
}

export interface HSDatabaseConf {
  type?: string;
  sqlite?: HSSQLiteDB;
}

export interface HSNameservers {
  global?: string[];
}

export interface HSDNSConfig {
  magic_dns?: boolean;
  override_local_dns?: boolean;
  base_domain?: string;
  nameservers?: HSNameservers;
}

export interface HSPKCEConfig {
  enabled?: boolean;
  method?: string;
}

export interface HSOIDCConfig {
  only_start_if_oidc_is_available?: boolean;
  issuer?: string;
  client_id?: string;
  client_secret?: string;
  client_secret_path?: string;
  scope?: string[];
  email_verified_required?: boolean;
  allowed_domains?: string[];
  allowed_users?: string[];
  allowed_groups?: string[];
  strip_email_domain?: boolean;
  expiry?: string;
  use_expiry_from_token?: boolean;
  pkce?: HSPKCEConfig;
}

export interface HSPolicyConfig {
  mode?: string;
}

export interface HeadscaleConfig {
  server_url?: string;
  listen_addr?: string;
  metrics_listen_addr?: string;
  grpc_listen_addr?: string;
  grpc_allow_insecure?: boolean;
  private_key_path?: string;
  noise?: HSNoiseConfig;
  prefixes?: HSPrefixes;
  derp?: HSDERPConfig;
  database?: HSDatabaseConf;
  dns?: HSDNSConfig;
  policy?: HSPolicyConfig;
  oidc?: HSOIDCConfig;
}

export type GetConfigRes = HeadscaleConfig;
export type UpdateConfigReq = HeadscaleConfig;
export type PreviewConfigReq = HeadscaleConfig;
export interface PreviewConfigRes {
  yaml?: string;
}
