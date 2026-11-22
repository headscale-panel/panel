/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type {
  AuthStatusRes,
  ChangePasswordReq,
  EnableTOTPReq,
  GenerateTOTPRes,
  LoginReq,
  LoginRes,
  MeRes,
  RegisterReq,
  RegisterRes,
} from './auth.types';
import type { NetworkIdentity } from './entities';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

/**
 * The panel's own sign-in endpoints.
 *
 * The panel is an OIDC *client* here. The panel acting as a provider for
 * headscale is a separate surface (idpApi) with its own endpoints.
 */
export const authApi = {
  login: (req: LoginReq) =>
    request<RespType<LoginRes>>({ url: '/auth/login', method: 'POST', data: req }),

  register: (req: RegisterReq) =>
    request<RespType<RegisterRes>>({ url: '/auth/register', method: 'POST', data: req }),

  logout: () =>
    request<RespType<{ message: string }>>({ url: '/auth/logout', method: 'POST' }),

  status: () =>
    request<RespType<AuthStatusRes>>({ url: '/auth/status', method: 'GET' }),

  me: () => request<RespType<MeRes>>({ url: '/me', method: 'GET' }),

  changePassword: (req: ChangePasswordReq) =>
    request<RespType<{ message: string }>>({ url: '/me/password', method: 'PUT', data: req }),

  markGuideTourSeen: () =>
    request<RespType<{ message: string }>>({ url: '/me/guide-tour/seen', method: 'POST' }),

  resetGuideTour: () =>
    request<RespType<{ message: string }>>({ url: '/me/guide-tour/reset', method: 'POST' }),

  generateTOTP: () =>
    request<RespType<GenerateTOTPRes>>({ url: '/me/totp/generate', method: 'POST' }),

  enableTOTP: (req: EnableTOTPReq) =>
    request<RespType<{ message: string }>>({ url: '/me/totp/enable', method: 'POST', data: req }),

  disableTOTP: () =>
    request<RespType<{ message: string }>>({ url: '/me/totp', method: 'DELETE' }),

  /**
   * Absolute URL that starts the panel SSO flow.
   *
   * A full navigation is required: the browser has to leave the app, visit the
   * external identity provider, and come back. On return the backend redirects to
   * the app with the token in the URL fragment.
   */
  panelSSOLoginURL: () => `${apiBase()}/auth/panel-sso/login`,

  /** The tailnet identities owned by the signed-in account. */
  meNetworkIdentities: () =>
    request<RespType<NetworkIdentity[]>>({ url: '/me/network-identities', method: 'GET' }),
};

/** Base URL of the panel API, honouring a deployment under a path prefix. */
function apiBase(): string {
  const configured = import.meta.env.VITE_API_URL || '/panel/api/v1';
  if (/^https?:\/\//.test(configured))
    return configured.replace(/\/+$/, '');
  return `${window.location.origin}${configured}`.replace(/\/+$/, '');
}
