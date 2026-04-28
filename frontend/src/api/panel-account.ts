import request, { RespType, RespPage } from '@/lib/request';
import type { PanelAccountListItem } from './panel-account.types';
import type {
  ListPanelAccountsReq,
  PanelAccountDetail,
  CreatePanelAccountReq,
  UpdatePanelAccountReq,
  SetStatusReq,
  LoginIdentities,
  NetworkBinding,
  UpdateNetworkBindingsReq,
  SetPrimaryBindingReq,
  ListAvailableNetworkIdentitiesReq,
  NetworkIdentityItem,
} from './panel-account.types';

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