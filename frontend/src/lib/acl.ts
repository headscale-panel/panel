export interface ACLDeviceOption {
  id: string;
  label: string;
  ipAddress: string;
  sourceValue: string;
  destinationValue: string;
}

export function buildACLDeviceOptions(
  devices: Array<{
    id: string;
    givenName: string;
    name: string;
    ipAddresses: string[];
  }>,
): ACLDeviceOption[] {
  return devices
    .map((device) => ({
      id: device.id,
      label: device.givenName || device.name,
      ipAddress: device.ipAddresses[0] || '',
      sourceValue: device.ipAddresses[0] || '',
      destinationValue: device.ipAddresses[0] ? `${device.ipAddresses[0]}:*` : '',
    }))
    .filter((device) => device.ipAddress);
}
