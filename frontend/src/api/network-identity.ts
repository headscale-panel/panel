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
  BindNetworkIdentityReq,
  CreateNetworkIdentityReq,
  CreateNetworkIdentityRes,
  DeleteNetworkIdentityReq,
  GetNetworkIdentityReq,
  GetNetworkIdentityRes,
  ListNetworkIdentitiesReq,
  ListNetworkIdentitiesRes,
  ReconcileBindingsRes,
  RenameNetworkIdentityReq,
  RenameNetworkIdentityRes,
  UnbindNetworkIdentityReq,
} from './network-identity.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

/**
 * Network identities: how the tailnet sees a person.
 *
 * Nothing here is stored by the panel except the binding. A headscale user can
 * exist with no panel account at all — that is what the `manual` origin means —
 * and an account can have no network identity yet.
 */
export const networkIdentityApi = {
  list: (req?: ListNetworkIdentitiesReq) =>
    request<RespType<ListNetworkIdentitiesRes>>({
      url: '/network-identities',
      method: 'GET',
      params: {
        q: req?.q,
        origin: req?.origin,
        orphaned: req?.orphaned ? 'true' : undefined,
        bound: req?.bound === undefined ? undefined : String(req.bound),
      },
    }),

  get: (req: GetNetworkIdentityReq) =>
    request<RespType<GetNetworkIdentityRes>>({
      url: `/network-identities/${req.hsUserId}`,
      method: 'GET',
    }),

  create: (req: CreateNetworkIdentityReq) =>
    request<RespType<CreateNetworkIdentityRes>>({
      url: '/network-identities',
      method: 'POST',
      data: req,
    }),

  rename: (req: RenameNetworkIdentityReq) =>
    request<RespType<RenameNetworkIdentityRes>>({
      url: `/network-identities/${req.hsUserId}/rename`,
      method: 'POST',
      data: { name: req.name },
    }),

  delete: (req: DeleteNetworkIdentityReq) =>
    request<RespType<void>>({
      url: `/network-identities/${req.hsUserId}`,
      method: 'DELETE',
    }),

  bind: (req: BindNetworkIdentityReq) =>
    request<RespType<{ message: string }>>({
      url: `/network-identities/${req.hsUserId}/bind`,
      method: 'POST',
      data: { account_id: req.account_id, primary: req.primary ?? false },
    }),

  unbind: (req: UnbindNetworkIdentityReq) =>
    request<RespType<{ message: string }>>({
      url: `/network-identities/${req.hsUserId}/bind`,
      method: 'DELETE',
    }),

  /**
   * Create the bindings the panel IdP can prove ownership of.
   *
   * Only panel-minted identities are eligible. An identity from another IdP is
   * skipped on purpose: matching it by email address is how an account gets
   * taken over.
   */
  reconcile: () =>
    request<RespType<ReconcileBindingsRes>>({
      url: '/network-identities/reconcile',
      method: 'POST',
    }),
};
