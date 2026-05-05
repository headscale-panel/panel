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

/**
 * System and Headscale runtime status types.
 */

export interface SystemStatus {
  /** Whether headscale OIDC is configured (non-empty issuer). */
  oidc_enabled: boolean;
  /** Whether Docker-in-Docker auto-restart is enabled. */
  dind_mode: boolean;
  /** Whether the panel can reach the Headscale gRPC service. */
  hs_connected: boolean;
  /** Current panel initialization state, e.g. "initialized". */
  setup_state: string;
  /** Authenticated user's basic info (only present when called with auth). */
  current_user?: StatusUser;
}

export interface StatusUser {
  id: number;
  username: string;
  email: string;
  display_name: string;
  role: string;
}

export interface HeadscaleServerStatus {
  running: boolean;
}

export interface GetSystemStatusRes extends SystemStatus {}
export interface GetHeadscaleStatusRes extends HeadscaleServerStatus {}
