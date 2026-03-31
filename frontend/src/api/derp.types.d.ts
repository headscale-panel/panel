export interface GetDerpReq {}

export interface DerpServer {
  regionId: number;
  regionCode: string;
  regionName: string;
  ipv4?: string;
  ipv6?: string;
  hostname?: string;
  stun?: boolean;
  relays?: Array<{
    hostname?: string;
    ipv4?: string;
    ipv6?: string;
  }>;
}

export type GetDerpRes = {
  servers: DerpServer[];
  default?: number;
};
