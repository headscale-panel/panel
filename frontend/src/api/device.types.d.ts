export interface ListDevicesReq {
  page?: number;
  pageSize?: number;
  userId?: string;
  status?: string;
}

export interface DeviceItem {
  [key: string]: any;
}

export interface ListDevicesRes {
  list: DeviceItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

export interface GetDeviceReq {
  id: string;
}
export interface GetDeviceRes extends DeviceItem {}

export interface RenameDeviceReq {
  id: string;
  name: string;
}
export interface RenameDeviceRes extends DeviceItem {}

export interface DeleteDeviceReq {
  id: string;
}
export interface DeleteDeviceRes {}

export interface ExpireDeviceReq {
  id: string;
}
export interface ExpireDeviceRes extends DeviceItem {}

export interface SetDeviceTagsReq {
  id: string;
  tags: string[];
}
export interface SetDeviceTagsRes extends DeviceItem {}

export interface GetDeviceRoutesReq {
  id: string;
}
export interface GetDeviceRoutesRes {
  [key: string]: any;
}

export interface RegisterNodeReq {
  user: string;
  key: string;
}
export interface RegisterNodeRes {
  [key: string]: any;
}
