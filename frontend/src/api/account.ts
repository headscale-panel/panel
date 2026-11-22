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
  CreateAccountReq,
  CreateAccountRes,
  DeleteAccountReq,
  GetAccountReq,
  GetAccountRes,
  ListAccountBindingsRes,
  ListAccountIdentitiesRes,
  ListAccountsReq,
  ListAccountsRes,
  SetAccountPasswordReq,
  SetAccountStatusReq,
  SetAccountStatusRes,
  SetPrimaryBindingReq,
  TransferBindingReq,
  TransferBindingRes,
  UnlinkAccountIdentityReq,
  UpdateAccountReq,
  UpdateAccountRes,
} from './account.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

/**
 * Panel accounts: the people who sign in to the panel.
 *
 * Nothing here touches the tailnet. Those live on networkIdentityApi and
 * deviceApi; the two are joined only by a binding, which is why deleting an
 * account leaves its network identity alone.
 */
export const accountApi = {
  list: (req?: ListAccountsReq) =>
    request<RespType<ListAccountsRes>>({
      url: '/accounts',
      method: 'GET',
      params: { q: req?.q, status: req?.status, role_id: req?.role_id },
    }),

  get: (req: GetAccountReq) =>
    request<RespType<GetAccountRes>>({ url: `/accounts/${req.id}`, method: 'GET' }),

  create: (req: CreateAccountReq) =>
    request<RespType<CreateAccountRes>>({ url: '/accounts', method: 'POST', data: req }),

  update: (req: UpdateAccountReq) =>
    request<RespType<UpdateAccountRes>>({
      url: `/accounts/${req.id}`,
      method: 'PUT',
      data: { display_name: req.display_name, email: req.email, role_id: req.role_id },
    }),

  delete: (req: DeleteAccountReq) =>
    request<RespType<void>>({ url: `/accounts/${req.id}`, method: 'DELETE' }),

  setStatus: (req: SetAccountStatusReq) =>
    request<RespType<SetAccountStatusRes>>({
      url: `/accounts/${req.id}/status`,
      method: 'POST',
      data: { status: req.status },
    }),

  setPassword: (req: SetAccountPasswordReq) =>
    request<RespType<{ message: string }>>({
      url: `/accounts/${req.id}/password`,
      method: 'POST',
      data: { password: req.password },
    }),

  identities: (req: GetAccountReq) =>
    request<RespType<ListAccountIdentitiesRes>>({
      url: `/accounts/${req.id}/identities`,
      method: 'GET',
    }),

  unlinkIdentity: (req: UnlinkAccountIdentityReq) =>
    request<RespType<void>>({
      url: `/accounts/${req.id}/identities/${req.identityId}`,
      method: 'DELETE',
    }),

  networkBindings: (req: GetAccountReq) =>
    request<RespType<ListAccountBindingsRes>>({
      url: `/accounts/${req.id}/network-bindings`,
      method: 'GET',
    }),

  setPrimaryBinding: (req: SetPrimaryBindingReq) =>
    request<RespType<{ message: string }>>({
      url: `/accounts/${req.id}/network-bindings/${req.hsUserId}/primary`,
      method: 'POST',
    }),

  transferBinding: (req: TransferBindingReq) =>
    request<RespType<TransferBindingRes>>({
      url: `/accounts/${req.id}/network-bindings/transfer`,
      method: 'POST',
      data: { hs_user_id: req.hs_user_id },
    }),
};
