/**
 * DERP map types mirroring services.DERPMapFile / services.DERPRegion / services.DERPNode.
 */

export interface DERPNode {
  name: string;
  regionid: number;
  hostname: string;
  ipv4?: string;
  ipv6?: string;
  stunport: number;
  stunonly: boolean;
  derpport: number;
}

export interface DERPRegion {
  regionid: number;
  regioncode: string;
  regionname: string;
  nodes: DERPNode[];
}

export interface DERPMap {
  /** Map of region ID → DERPRegion */
  regions: Record<string, DERPRegion>;
}

// ─── Request / Response types ─────────────────────────────────────────────────

export type GetDERPMapRes = DERPMap;
export type UpdateDERPMapRes = void;

export interface AddRegionReq extends Omit<DERPRegion, 'nodes'> {
  nodes?: DERPNode[];
}
export type AddRegionRes = void;

export type UpdateRegionReq = DERPRegion;
export type UpdateRegionRes = void;

export interface DeleteRegionReq {
  regionId: number;
}
export type DeleteRegionRes = void;

export interface AddNodeReq {
  regionId: number;
  node: DERPNode;
}
export type AddNodeRes = void;

export interface UpdateNodeReq {
  regionId: number;
  nodeIndex: number;
  node: DERPNode;
}
export type UpdateNodeRes = void;

export interface DeleteNodeReq {
  regionId: number;
  nodeIndex: number;
}
export type DeleteNodeRes = void;
