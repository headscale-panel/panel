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

import type { CreatePanelAccountReq, ImportPanelAccountsReq, ListAvailableNetworkIdentitiesReq, ListPanelAccountsReq, LoginIdentities, NetworkBinding, NetworkIdentityItem, PanelAccountDetail, PanelAccountImportResult, PanelAccountListItem, SetPrimaryBindingReq, SetStatusReq, UpdateNetworkBindingsReq, UpdatePanelAccountReq } from './panel-account.types';
import type { RespPage, RespType } from '@/lib/request';
import request from '@/lib/request';

export const panelAccountApi = {
  list: (req?: ListPanelAccountsReq) =>
    request<RespType<RespPage<PanelAccountListItem>>>({
      url: '/panel-accounts',
      method: 'GET',
      params: {
        page: req?.page || 1,
        page_size: req?.pageSize || 10,
        search: req?.search || undefined,
        status: req?.status || undefined,
        group_id: req?.group_id || undefined,
        provider: req?.provider || undefined,
      },
    }),

  getDetail: (id: number) =>
    request<RespType<PanelAccountDetail>>({
      url: `/panel-accounts/${id}`,
      method: 'GET',
    }),

  create: (req: CreatePanelAccountReq) =>
    request<RespType<void>>({ url: '/panel-accounts', method: 'POST', data: req }),

  importAccounts: (req: ImportPanelAccountsReq) =>
    request<RespType<PanelAccountImportResult>>({ url: '/panel-accounts/import', method: 'POST', data: req }),

  update: (id: number, req: UpdatePanelAccountReq) =>
    request<RespType<void>>({ url: `/panel-accounts/${id}`, method: 'PUT', data: req }),

  setStatus: (id: number, req: SetStatusReq) =>
    request<RespType<void>>({ url: `/panel-accounts/${id}/status`, method: 'PUT', data: req }),

  delete: (id: number) =>
    request<RespType<void>>({ url: `/panel-accounts/${id}`, method: 'DELETE' }),

  getLoginIdentities: (id: number) =>
    request<RespType<LoginIdentities>>({
      url: `/panel-accounts/${id}/login-identities`,
      method: 'GET',
    }),

  getNetworkBindings: (id: number) =>
    request<RespType<NetworkBinding[]>>({
      url: `/panel-accounts/${id}/network-bindings`,
      method: 'GET',
    }),

  updateNetworkBindings: (id: number, req: UpdateNetworkBindingsReq) =>
    request<RespType<void>>({
      url: `/panel-accounts/${id}/network-bindings`,
      method: 'PUT',
      data: req,
    }),

  setPrimaryBinding: (id: number, req: SetPrimaryBindingReq) =>
    request<RespType<void>>({
      url: `/panel-accounts/${id}/primary-binding`,
      method: 'PUT',
      data: req,
    }),

  listAvailableNetworkIdentities: (req?: ListAvailableNetworkIdentitiesReq) =>
    request<RespType<NetworkIdentityItem[]>>({
      url: '/network-identities/available',
      method: 'GET',
      params: {
        search: req?.search || undefined,
        exclude_account_id: req?.exclude_account_id || undefined,
      },
    }),

  resetTOTP: (id: number) =>
    request<RespType<void>>({
      url: `/panel-accounts/${id}/reset-totp`,
      method: 'PUT',
    }),
};
