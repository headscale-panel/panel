export interface GetConfigReq {}

export interface HeadscaleConfig {
  server_url?: string;
  listen_addr?: string;
  private_key_path?: string;
  noise?: any;
  prefixes?: {
    v4: string;
    v6: string;
  };
  derp?: any;
  [key: string]: any;
}

export type GetConfigRes = HeadscaleConfig;

export interface PreviewConfigReq {
  [key: string]: any;
}

export type PreviewConfigRes = {
  valid: boolean;
  errors?: string[];
  preview?: HeadscaleConfig;
};
