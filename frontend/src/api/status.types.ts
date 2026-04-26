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
