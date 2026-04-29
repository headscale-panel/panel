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
