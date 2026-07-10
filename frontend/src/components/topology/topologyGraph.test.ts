/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { describe, expect, it } from 'vitest';
import { ACLAction } from '@/lib/enums';
import { buildACLHighlight, buildGraphData, deviceRingRank, normalizeTopology } from './topologyGraph';

const input = {
  users: [{ id: '1', name: 'alice', deviceCount: 2 }],
  devices: [
    { id: '10', name: 'alice-laptop', user: 'alice', online: true, ipAddresses: ['100.64.0.1'], lastSeen: '' },
    { id: '11', name: 'alice-phone', user: 'alice', online: false, ipAddresses: ['100.64.0.2'], lastSeen: '' },
    { id: '12', name: 'nas', user: '', online: true, ipAddresses: ['100.64.0.3'], lastSeen: '', tags: ['tag:server'] },
  ],
  acl: [{ src: '10', dst: '12', action: ACLAction.Accept }],
};

describe('topology graph adapter', () => {
  it('groups devices into user and tag combos', () => {
    const topology = normalizeTopology(input, undefined, false)!;
    const graph = buildGraphData(topology);

    expect(topology.identities).toHaveLength(2);
    expect(graph.combos).toHaveLength(2);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.nodes?.filter((node) => node.data?.kind === 'identity')).toHaveLength(2);
    expect(graph.nodes?.find((node) => node.id === '12')?.combo).toBe('identity:tag:tag:server');
  });

  it('filters offline devices and empty identities', () => {
    const topology = normalizeTopology(input, undefined, true)!;
    expect(topology.devices.map((device) => device.id)).toEqual(['10', '12']);
    expect(topology.identities.every((identity) => identity.deviceCount > 0)).toBe(true);
  });

  it('maps ACL reachability onto existing topology paths', () => {
    const topology = normalizeTopology(input, undefined, false)!;
    const highlight = buildACLHighlight(topology, '10');
    expect([...highlight.targetIds].sort()).toEqual(['11', '12']);
    expect(highlight.edgeIds).toContain('structure:identity:1:10');
    expect(highlight.edgeIds).toContain('structure:identity:1:11');
    expect(highlight.edgeIds).toContain('structure:server:1');
    expect(highlight.edgeIds).toContain('structure:server:tag:tag:server');
    expect([...highlight.edgeIds].some((id) => id.startsWith('acl:'))).toBe(false);
  });

  it('splits large identity groups across progressively larger rings', () => {
    expect(Array.from({ length: 8 }, (_, index) => deviceRingRank(index))).toEqual(Array.from({ length: 8 }).fill(90));
    expect(deviceRingRank(8)).toBe(89);
    expect(deviceRingRank(21)).toBe(89);
    expect(deviceRingRank(22)).toBe(88);
    expect(deviceRingRank(41)).toBe(88);
    expect(deviceRingRank(42)).toBe(87);
  });
});
