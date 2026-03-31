import { describe, expect, it } from 'vitest';
import { buildACLDeviceOptions } from './acl';

describe('ACL device options', () => {
  it('keeps the full device list available to the searchable picker', () => {
    const devices = Array.from({ length: 12 }, (_, index) => ({
      id: `device-${index + 1}`,
      givenName: `Device ${index + 1}`,
      name: `device-${index + 1}`,
      ipAddresses: [`100.64.0.${index + 1}`],
    }));

    const options = buildACLDeviceOptions(devices);

    expect(options).toHaveLength(12);
    expect(options.at(-1)?.label).toBe('Device 12');
    expect(options.at(-1)?.destinationValue).toBe('100.64.0.12:*');
  });
});
