import request from '@/lib/request';
import type {
  LoginReq,
  LoginRes,
  RegisterReq,
  RegisterRes,
  UserInfoReq,
  UserInfoRes,
  MarkGuideTourSeenReq,
  MarkGuideTourSeenRes,
  GenerateTOTPRes,
  EnableTOTPReq,
  OidcCallbackReq,
  OidcCallbackRes,
  OidcCreateHeadscaleUserCallbackRes,
  OidcStatusReq,
  OidcStatusRes,
} from './auth.types';

export const authApi = {
  login: (req: LoginReq) => request.post<any, LoginRes>('/login', req),
  register: (req: RegisterReq) => request.post<any, RegisterRes>('/register', req),
  getUserInfo: (_req?: UserInfoReq) => request.get<any, UserInfoRes>('/user/info'),
  markGuideTourSeen: (_req?: MarkGuideTourSeenReq) => request.post<any, MarkGuideTourSeenRes>('/user/guide-tour/seen'),
  oidcLogin: () => request.get<any, { url?: string }>('/auth/oidc/login'),
  oidcCallback: (req: OidcCallbackReq) => request.get<any, OidcCallbackRes>('/auth/oidc/callback', { params: req }),
  oidcCreateHeadscaleUserLogin: () => request.get<any, { url?: string; redirect_url?: string }>('/auth/oidc/headscale-user/login'),
  oidcCreateHeadscaleUserCallback: (req: OidcCallbackReq) =>
    request.get<any, OidcCreateHeadscaleUserCallbackRes>('/auth/oidc/headscale-user/callback', { params: req }),
  generateTOTP: () => request.post<any, GenerateTOTPRes>('/user/totp/generate'),
  enableTOTP: (req: EnableTOTPReq) => request.post<any, void>('/user/totp/enable', req),
};

export const publicAuthApi = {
  oidcStatus: (_req?: OidcStatusReq) => request.get<any, OidcStatusRes>('/auth/oidc-status'),
};
