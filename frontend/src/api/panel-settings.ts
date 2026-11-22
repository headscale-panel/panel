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
  GetConnectionRes,
  GetIdPStateRes,
  GetPanelSSORes,
  ReconcileRes,
  SaveConnectionReq,
  SavePanelSSOReq,
  SavePanelSSORes,
  SetIdPEnabledReq,
  SetIdPEnabledRes,
  TestConnectionReq,
  TestConnectionRes,
} from './panel-settings.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

/**
 * Connection to headscale, and the two authentication planes.
 *
 * These are three separate things that used to share one settings page and one
 * set of endpoints:
 *
 *  - how the panel reaches headscale (connection);
 *  - how people sign in to the panel (panel SSO — the panel is a client);
 *  - how headscale authenticates its users (panel IdP — the panel is a provider).
 *
 * Keeping them apart is the point: they have different failure modes and
 * different owners.
 */
export const connectionApi = {
  get: () =>
    request<RespType<GetConnectionRes>>({ url: '/system/config/connection', method: 'GET' }),

  save: (req: SaveConnectionReq) =>
    request<RespType<{ message: string }>>({
      url: '/system/config/connection',
      method: 'PUT',
      data: req,
    }),

  /** Probe a configuration without persisting it. */
  test: (req?: TestConnectionReq) =>
    request<RespType<TestConnectionRes>>({
      url: '/system/config/connection/test',
      method: 'POST',
      data: req ?? {},
    }),

  /** Re-sync ACL hosts and create the bindings the panel IdP can prove. */
  reconcile: () =>
    request<RespType<ReconcileRes>>({ url: '/system/reconcile', method: 'POST' }),
};

export const panelSSOApi = {
  get: () =>
    request<RespType<GetPanelSSORes>>({ url: '/system/auth/panel-sso', method: 'GET' }),

  save: (req: SavePanelSSOReq) =>
    request<RespType<SavePanelSSORes>>({
      url: '/system/auth/panel-sso',
      method: 'PUT',
      data: req,
    }),
};

export const idpApi = {
  state: () => request<RespType<GetIdPStateRes>>({ url: '/system/auth/idp', method: 'GET' }),

  /**
   * Turn the provider on or off.
   *
   * Disabling takes effect immediately: /idp/* starts refusing regardless of what
   * the headscale config file still says, which is what stops a stale `oidc:`
   * block from reviving the flow.
   */
  setEnabled: (req: SetIdPEnabledReq) =>
    request<RespType<SetIdPEnabledRes>>({
      url: '/system/auth/idp',
      method: 'PUT',
      data: req,
    }),
};

/** Kept as an alias so the settings page has one obvious import. */
export const panelSettingsApi = connectionApi;
