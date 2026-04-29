import type {
  EnableBuiltinOIDCReq,
  EnableBuiltinOIDCRes,
  GetBuiltinOIDCReq,
  GetBuiltinOIDCRes,
  GetConnectionReq,
  GetConnectionRes,
  GetOIDCSettingsReq,
  GetOIDCSettingsRes,
  GetOIDCStatusReq,
  GetOIDCStatusRes,
  SaveConnectionReq,
  SaveConnectionRes,
  SaveOIDCSettingsReq,
  SaveOIDCSettingsRes,
  SyncDataReq,
  SyncDataRes,
} from './panel-settings.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

export const panelSettingsApi = {
  getConnection: (_req?: GetConnectionReq) =>
    request<RespType<GetConnectionRes>>({ url: '/panel/connection', method: 'GET' }),

  saveConnection: (req: SaveConnectionReq) =>
    request<RespType<SaveConnectionRes>>({
      url: '/panel/connection',
      method: 'PUT',
      data: {
        grpc_addr: req.grpc_addr,
        api_key: req.api_key,
        insecure: req.insecure,
      },
    }),

  syncData: (_req?: SyncDataReq) =>
    request<RespType<SyncDataRes>>({ url: '/panel/sync', method: 'POST' }),

  getBuiltinOIDC: (_req?: GetBuiltinOIDCReq) =>
    request<RespType<GetBuiltinOIDCRes>>({ url: '/panel/builtin-oidc', method: 'GET' }),

  enableBuiltinOIDC: (_req?: EnableBuiltinOIDCReq) =>
    request<RespType<EnableBuiltinOIDCRes>>({ url: '/panel/builtin-oidc', method: 'POST' }),

  getOIDCSettings: (_req?: GetOIDCSettingsReq) =>
    request<RespType<GetOIDCSettingsRes>>({ url: '/panel/oidc-settings', method: 'GET' }),

  saveOIDCSettings: (req: SaveOIDCSettingsReq) =>
    request<RespType<SaveOIDCSettingsRes>>({ url: '/panel/oidc-settings', method: 'PUT', data: req }),

  getOIDCStatus: (_req?: GetOIDCStatusReq) =>
    request<RespType<GetOIDCStatusRes>>({ url: '/panel/oidc-status', method: 'GET' }),
};
