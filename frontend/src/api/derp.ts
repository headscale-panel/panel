import request from '@/lib/request';
import type {
  GetDERPMapRes,
  DERPMap,
  DERPRegion,
  DERPNode,
} from './derp.types';

export const derpApi = {
  /** GET /headscale/derp — retrieve the full DERP map */
  get: () => request.get<any, GetDERPMapRes>('/headscale/derp'),

  /** PUT /headscale/derp — replace the entire DERP map */
  update: (derpMap: DERPMap) => request.put<any, void>('/headscale/derp', derpMap),

  /** POST /headscale/derp/regions — add a new region */
  addRegion: (region: DERPRegion) =>
    request.post<any, void>('/headscale/derp/regions', region),

  /** PUT /headscale/derp/regions/:regionId — update an existing region */
  updateRegion: (regionId: number, region: DERPRegion) =>
    request.put<any, void>(`/headscale/derp/regions/${regionId}`, region),

  /** DELETE /headscale/derp/regions/:regionId — delete a region */
  deleteRegion: (regionId: number) =>
    request.delete<any, void>(`/headscale/derp/regions/${regionId}`),

  /** POST /headscale/derp/regions/:regionId/nodes — add a node to a region */
  addNode: (regionId: number, node: DERPNode) =>
    request.post<any, void>(`/headscale/derp/regions/${regionId}/nodes`, node),

  /** PUT /headscale/derp/regions/:regionId/nodes/:nodeIndex — update a node */
  updateNode: (regionId: number, nodeIndex: number, node: DERPNode) =>
    request.put<any, void>(`/headscale/derp/regions/${regionId}/nodes/${nodeIndex}`, node),

  /** DELETE /headscale/derp/regions/:regionId/nodes/:nodeIndex — delete a node */
  deleteNode: (regionId: number, nodeIndex: number) =>
    request.delete<any, void>(`/headscale/derp/regions/${regionId}/nodes/${nodeIndex}`),
};
