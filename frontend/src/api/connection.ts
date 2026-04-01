import request from '@/lib/request';
import type {
  GenerateCommandsReq,
  GenerateCommandsRes,
  GeneratePreAuthKeyReq,
  GeneratePreAuthKeyRes,
  GenerateSSHCommandReq,
  GenerateSSHCommandRes,
} from './connection.types';

export const connectionApi = {
  generateCommands: (req: GenerateCommandsReq) =>
    request.post<any, GenerateCommandsRes>('/connection/generate', {
      machine_ids: req.machine_ids,
      platform: req.platform,
    }),

  generatePreAuthKey: (req: GeneratePreAuthKeyReq) =>
    request.post<any, GeneratePreAuthKeyRes>('/connection/pre-auth-key', {
      user_id: req.user_id,
      reusable: req.reusable,
      ephemeral: req.ephemeral,
      expiration: req.expiration,
    }),

  generateSSHCommand: (req: GenerateSSHCommandReq) =>
    request.post<any, GenerateSSHCommandRes>('/connection/ssh-command', {
      machine_id: req.machine_id,
      user: req.user,
    }),
};
