export interface GenerateCommandsReq {
  machine_ids: string[];
  platform: string;
}

export interface GenerateCommandsRes {
  commands: Record<string, string>;
  platform: string;
}

export interface GeneratePreAuthKeyReq {
  user_id: string;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
}

export interface PreAuthKey {
  key: string;
  user_id: string;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
  createdAt?: string;
}

export type GeneratePreAuthKeyRes = PreAuthKey;

export interface GenerateSSHCommandReq {
  machine_id: string;
  user?: string;
}

export interface SSHCommand {
  command: string;
  machine_id: string;
  user?: string;
}

export type GenerateSSHCommandRes = SSHCommand;

