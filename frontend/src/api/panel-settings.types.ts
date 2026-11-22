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

// ─── Headscale connection ────────────────────────────────────────────────────

export interface ConnectionSettings {
  api_addr: string;
  insecure: boolean;
  tls_skip_verify?: boolean;
  tls_ca_cert?: string;
  has_api_key: boolean;
  is_configured: boolean;
  /**
   * Present only when the stored settings predate headscale 0.30. The value is a
   * gRPC port, which cannot be converted into an HTTP API address, so the
   * operator has to enter one.
   */
  legacy_grpc_addr?: string;
}

export type GetConnectionRes = ConnectionSettings;

export interface SaveConnectionReq {
  api_addr: string;
  /** Omit to keep the stored key. */
  api_key?: string;
  insecure: boolean;
  tls_skip_verify?: boolean;
  tls_ca_cert?: string;
}

export interface TestConnectionReq {
  api_addr?: string;
  api_key?: string;
  insecure?: boolean;
  tls_skip_verify?: boolean;
  tls_ca_cert?: string;
}

export type ConnState
  = | 'ok'
    | 'unreachable'
    | 'tls_error'
    | 'unauthorized'
    | 'version_mismatch';

export interface TestConnectionRes {
  state: ConnState;
  detail?: string;
  commit?: string;
  in_baseline: boolean;
  baseline_commit?: string;
}

export interface ReconcileRes {
  scanned: number;
  bound: number[] | null;
  skipped: number[] | null;
  failed: number[] | null;
}

// ─── Panel SSO (the panel as an OIDC client) ─────────────────────────────────

export type SSOProvisioning = 'disabled' | 'jit';

export interface PanelSSOSettings {
  enabled: boolean;
  issuer: string;
  client_id: string;
  has_client_secret: boolean;
  scopes: string[] | null;
  email_verified_required: boolean;
  /** No code-level default: an operator must choose. */
  provisioning: SSOProvisioning | '';
  default_role_id: number;
}

export type GetPanelSSORes = PanelSSOSettings;

export interface SavePanelSSOReq {
  enabled: boolean;
  issuer: string;
  client_id: string;
  /** Omit to keep the stored secret. */
  client_secret?: string;
  scopes: string[];
  email_verified_required: boolean;
  provisioning: SSOProvisioning;
  default_role_id: number;
}

export type SavePanelSSORes = PanelSSOSettings;

// ─── Panel IdP (the panel as an OIDC provider for headscale) ─────────────────

export interface IdPState {
  enabled: boolean;
  configured: boolean;
  issuer?: string;
  client_id?: string;
  redirect_uri?: string;
  enrollment_mode: string;
  auto_bind: boolean;
  enabled_at?: string;
}

export type GetIdPStateRes = IdPState;

export interface SetIdPEnabledReq {
  enabled: boolean;
}
export type SetIdPEnabledRes = IdPState;
