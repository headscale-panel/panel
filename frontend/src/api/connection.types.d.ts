export interface GenerateCommandsReq {
  machineIds: string[];
  platform: string;
}

export interface GenerateCommandsRes {
  commands: Record<string, string>;
  platform: string;
}

export interface GeneratePreAuthKeyReq {
  userId: string;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
}

export interface PreAuthKey {
  key: string;
  userId: string;
  reusable: boolean;
  ephemeral: boolean;
  expiration?: string;
  createdAt: string;
}

export type GeneratePreAuthKeyRes = PreAuthKey;

export interface GenerateSSHCommandReq {
  machineId: string;
  user?: string;
}

export interface SSHCommand {
  command: string;
  machineId: string;
  user?: string;
}

export type GenerateSSHCommandRes = SSHCommand;
