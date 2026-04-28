import request, { RespType } from '@/lib/request';
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
  login: (req: LoginReq) =>
    request<RespType<LoginRes>>({ url: '/login', method: 'POST', data: req }),

  register: (req: RegisterReq) =>
    request<RespType<RegisterRes>>({ url: '/register', method: 'POST', data: req }),

  getUserInfo: (_req?: UserInfoReq) =>
    request<RespType<UserInfoRes>>({ url: '/user/info', method: 'GET' }),

  markGuideTourSeen: (_req?: MarkGuideTourSeenReq) =>
    request<RespType<MarkGuideTourSeenRes>>({ url: '/user/guide-tour/seen', method: 'POST' }),

  oidcLogin: () =>
    request<RespType<{ url?: string }>>({ url: '/auth/oidc/login', method: 'GET' }),

  oidcCallback: (req: OidcCallbackReq) =>
    request<RespType<OidcCallbackRes>>({
      url: '/auth/oidc/callback',
      method: 'GET',
      params: req,
    }),

  oidcCreateHeadscaleUserLogin: () =>
    request<RespType<{ url?: string; redirect_url?: string }>>({
      url: '/auth/oidc/headscale-user/login',
      method: 'GET',
    }),

  oidcCreateHeadscaleUserCallback: (req: OidcCallbackReq) =>
    request<RespType<OidcCreateHeadscaleUserCallbackRes>>({
      url: '/auth/oidc/headscale-user/callback',
      method: 'GET',
      params: req,
    }),

  generateTOTP: () =>
    request<RespType<GenerateTOTPRes>>({ url: '/user/totp/generate', method: 'POST' }),

  enableTOTP: (req: EnableTOTPReq) =>
    request<RespType<void>>({ url: '/user/totp/enable', method: 'POST', data: req }),
};

export const publicAuthApi = {
  oidcStatus: (_req?: OidcStatusReq) =>
    request<RespType<OidcStatusRes>>({ url: '/auth/oidc-status', method: 'GET' }),
};