/*
 * Copyright (C) 2026 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

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
