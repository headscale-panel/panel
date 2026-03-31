export interface LoginReq {
  username: string;
  password: string;
}

export interface LoginRes {
  token: string;
  user: {
    id: number;
    username: string;
    email?: string;
    role?: string;
    headscale_name?: string;
    display_name?: string;
    avatar?: string;
    permissions?: string[];
  };
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

export interface UserInfoRes {
  id: number;
  username: string;
  email?: string;
  role?: string;
  headscale_name?: string;
  display_name?: string;
  avatar?: string;
  permissions?: string[];
}

export interface OidcCallbackReq {
  code: string;
  state: string;
}

export interface OidcCallbackRes {
  token?: string;
  user?: UserInfoRes;
}

export interface OidcStatusReq {}

export interface OidcStatusRes {
  enabled: boolean;
}
