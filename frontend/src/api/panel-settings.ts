import request from '@/lib/request';
import type {
  GetConnectionReq,
  GetConnectionRes,
  SaveConnectionReq,
  SaveConnectionRes,
  SyncDataReq,
  SyncDataRes,
  GetBuiltinOIDCReq,
  GetBuiltinOIDCRes,
  EnableBuiltinOIDCReq,
  EnableBuiltinOIDCRes,
  GetOIDCSettingsReq,
  GetOIDCSettingsRes,
  SaveOIDCSettingsReq,
  SaveOIDCSettingsRes,
  GetOIDCStatusReq,
  GetOIDCStatusRes,
} from './panel-settings.types';

export const panelSettingsApi = {
  getConnection: (req?: GetConnectionReq) =>
    request.get<any, GetConnectionRes>('/panel/connection'),

  saveConnection: (req: SaveConnectionReq) =>
    request.put<any, SaveConnectionRes>('/panel/connection', {
      grpc_addr: req.grpc_addr,
      api_key: req.api_key,
      insecure: req.insecure,
    }),

  syncData: (req?: SyncDataReq) =>
    request.post<any, SyncDataRes>('/panel/sync'),

  getBuiltinOIDC: (req?: GetBuiltinOIDCReq) =>
    request.get<any, GetBuiltinOIDCRes>('/panel/builtin-oidc'),

  enableBuiltinOIDC: (req?: EnableBuiltinOIDCReq) =>
    request.post<any, EnableBuiltinOIDCRes>('/panel/builtin-oidc'),

  getOIDCSettings: (req?: GetOIDCSettingsReq) =>
    request.get<any, GetOIDCSettingsRes>('/panel/oidc-settings'),

  saveOIDCSettings: (req: SaveOIDCSettingsReq) =>
    request.put<any, SaveOIDCSettingsRes>('/panel/oidc-settings', req),

  getOIDCStatus: (req?: GetOIDCStatusReq) =>
    request.get<any, GetOIDCStatusRes>('/panel/oidc-status'),
};
