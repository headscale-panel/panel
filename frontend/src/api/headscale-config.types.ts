export interface GetConfigReq {}

export interface HeadscaleOIDCConfig {
  issuer?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string[];
  allowed_domains?: string[];
  allowed_groups?: string[];
  allowed_users?: string[];
  strip_email_domain?: boolean;
  [key: string]: unknown;
}

export interface HeadscaleConfig {
  server_url?: string;
  listen_addr?: string;
  private_key_path?: string;
  noise?: unknown;
  prefixes?: {
    v4: string;
    v6: string;
  };
  derp?: unknown;
  oidc?: HeadscaleOIDCConfig;
  [key: string]: unknown;
}

export type GetConfigRes = HeadscaleConfig;

export interface PreviewConfigReq extends HeadscaleConfig {}

export type PreviewConfigRes = {
  yaml?: string;
};

export interface UpdateConfigReq extends HeadscaleConfig {}
export interface UpdateConfigRes {}

