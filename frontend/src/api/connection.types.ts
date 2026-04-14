export interface GenerateCommandsReq {
  machine_ids: string[];
  platform: string;
}

export interface GenerateCommandsRes {
  commands: Record<string, string>;
  platform: string;
}

export interface GeneratePreAuthKeyReq {
  /** Panel user database ID (uint) — not a Headscale user ID */
  user_id: number;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
}

export interface PreAuthKey {
  key: string;
  user_id: number;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
  createdAt?: string;
}

export type GeneratePreAuthKeyRes = PreAuthKey;

export interface GenerateSSHCommandReq {
  /** Headscale machine ID (uint64) */
  machine_id: number;
  user?: string;
}

export interface SSHCommand {
  command: string;
  machine_id: number;
  user?: string;
}

export type GenerateSSHCommandRes = SSHCommand;

