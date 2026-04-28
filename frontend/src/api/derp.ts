import request, { RespType } from '@/lib/request';
import type {
  GetDERPMapRes,
  DERPMap,
  DERPRegion,
  DERPNode,
} from './derp.types';

export const derpApi = {
  /** GET /headscale/derp — retrieve the full DERP map */
  get: () =>
    request<RespType<GetDERPMapRes>>({ url: '/headscale/derp', method: 'GET' }),

  /** PUT /headscale/derp — replace the entire DERP map */
  update: (derpMap: DERPMap) =>
    request<RespType<void>>({ url: '/headscale/derp', method: 'PUT', data: derpMap }),

  /** POST /headscale/derp/regions — add a new region */
  addRegion: (region: DERPRegion) =>
    request<RespType<void>>({ url: '/headscale/derp/regions', method: 'POST', data: region }),

  /** PUT /headscale/derp/regions/:regionId — update an existing region */
  updateRegion: (regionId: number, region: DERPRegion) =>
    request<RespType<void>>({
      url: `/headscale/derp/regions/${regionId}`,
      method: 'PUT',
      data: region,
    }),

  /** DELETE /headscale/derp/regions/:regionId — delete a region */
  deleteRegion: (regionId: number) =>
    request<RespType<void>>({
      url: `/headscale/derp/regions/${regionId}`,
      method: 'DELETE',
    }),

  /** POST /headscale/derp/regions/:regionId/nodes — add a node to a region */
  addNode: (regionId: number, node: DERPNode) =>
    request<RespType<void>>({
      url: `/headscale/derp/regions/${regionId}/nodes`,
      method: 'POST',
      data: node,
    }),

  /** PUT /headscale/derp/regions/:regionId/nodes/:nodeIndex — update a node */
  updateNode: (regionId: number, nodeIndex: number, node: DERPNode) =>
    request<RespType<void>>({
      url: `/headscale/derp/regions/${regionId}/nodes/${nodeIndex}`,
      method: 'PUT',
      data: node,
    }),

  /** DELETE /headscale/derp/regions/:regionId/nodes/:nodeIndex — delete a node */
  deleteNode: (regionId: number, nodeIndex: number) =>
    request<RespType<void>>({
      url: `/headscale/derp/regions/${regionId}/nodes/${nodeIndex}`,
      method: 'DELETE',
    }),
};