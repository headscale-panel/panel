import request from '@/lib/request';
import type {
  ListPanelAccountsReq,
  ListPanelAccountsRes,
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
    request.get<any, ListPanelAccountsRes>('/panel-accounts', {
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
    request.get<any, PanelAccountDetail>(`/panel-accounts/${id}`),

  create: (req: CreatePanelAccountReq) =>
    request.post<any, void>('/panel-accounts', req),

  update: (id: number, req: UpdatePanelAccountReq) =>
    request.put<any, void>(`/panel-accounts/${id}`, req),

  setStatus: (id: number, req: SetStatusReq) =>
    request.put<any, void>(`/panel-accounts/${id}/status`, req),

  delete: (id: number) =>
    request.delete<any, void>(`/panel-accounts/${id}`),

  getLoginIdentities: (id: number) =>
    request.get<any, LoginIdentities>(`/panel-accounts/${id}/login-identities`),

  getNetworkBindings: (id: number) =>
    request.get<any, NetworkBinding[]>(`/panel-accounts/${id}/network-bindings`),

  updateNetworkBindings: (id: number, req: UpdateNetworkBindingsReq) =>
    request.put<any, void>(`/panel-accounts/${id}/network-bindings`, req),

  setPrimaryBinding: (id: number, req: SetPrimaryBindingReq) =>
    request.put<any, void>(`/panel-accounts/${id}/primary-binding`, req),

  listAvailableNetworkIdentities: (req?: ListAvailableNetworkIdentitiesReq) =>
    request.get<any, NetworkIdentityItem[]>('/network-identities/available', {
      params: {
        search: req?.search || undefined,
        exclude_account_id: req?.exclude_account_id || undefined,
      },
    }),

  resetTOTP: (id: number) =>
    request.put<any, void>(`/panel-accounts/${id}/reset-totp`),
};
