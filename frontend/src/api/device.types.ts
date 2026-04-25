import type { HeadscaleMachine, HeadscaleUser } from './entities';

export interface ListDevicesReq {
  page?: number;
  pageSize?: number;
  all?: boolean;
  userId?: string;
  status?: string;
}

export interface ListDevicesRes {
  list: HeadscaleMachine[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface GetDeviceReq {
  id: string;
}
export type GetDeviceRes = HeadscaleMachine;

export interface RenameDeviceReq {
  id: string;
  name: string;
}
export type RenameDeviceRes = HeadscaleMachine;

export interface DeleteDeviceReq {
  id: string;
}
export interface DeleteDeviceRes {}

export interface ExpireDeviceReq {
  id: string;
}
export type ExpireDeviceRes = HeadscaleMachine;

export interface SetDeviceTagsReq {
  id: string;
  tags: string[];
}
export type SetDeviceTagsRes = HeadscaleMachine;

export interface GetDeviceRoutesReq {
  id: string;
}
export interface GetDeviceRoutesRes {
  routes?: Array<{
    id: number;
    machine: HeadscaleMachine;
    prefix: string;
    advertised: boolean;
    enabled: boolean;
    isPrimary: boolean;
  }>;
}

export interface RegisterNodeReq {
  user: string;
  key: string;
}
export type RegisterNodeRes = HeadscaleMachine;

