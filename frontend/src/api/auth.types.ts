import type { User } from './entities';

export interface LoginReq {
  username: string;
  password: string;
  totp_code?: string;
}

export interface LoginRes {
  token: string;
  user: User;
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
export type UserInfoRes = User;

export interface GenerateTOTPReq {}
export interface GenerateTOTPRes {
  secret: string;
  url: string;
}

export interface EnableTOTPReq {
  code: string;
}
export interface EnableTOTPRes {}

export interface OidcCallbackReq {
  code: string;
  state: string;
}

export interface OidcCallbackRes {
  token?: string;
  user?: User;
}

export interface OidcStatusReq {}

export interface OidcStatusRes {
  enabled: boolean;
  builtin?: boolean;
  provider_name?: string;
  issuer?: string;
}

export interface OidcLoginReq {}
export interface OidcLoginRes {
  redirect_url: string;
}

