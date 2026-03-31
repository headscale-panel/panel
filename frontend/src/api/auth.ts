import request from '@/lib/request';
import type {
  LoginReq,
  LoginRes,
  RegisterReq,
  RegisterRes,
  UserInfoReq,
  UserInfoRes,
  OidcCallbackReq,
  OidcCallbackRes,
  OidcStatusReq,
  OidcStatusRes,
} from './auth.types';

export const authApi = {
  login: (req: LoginReq) => request.post<any, LoginRes>('/login', req),
  register: (req: RegisterReq) => request.post<any, RegisterRes>('/register', req),
  getUserInfo: (_req?: UserInfoReq) => request.get<any, UserInfoRes>('/user/info'),
  oidcLogin: () => request.get<any, { url?: string }>('/auth/oidc/login'),
  oidcCallback: (req: OidcCallbackReq) => request.get<any, OidcCallbackRes>('/auth/oidc/callback', { params: req }),
};

export const publicAuthApi = {
  oidcStatus: (_req?: OidcStatusReq) => request.get<any, OidcStatusRes>('/auth/oidc-status'),
};
