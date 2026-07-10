/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import type { GraphData } from '@antv/g6';
import type { ACLAction } from '@/lib/enums';

export type DeviceType = 'laptop' | 'phone' | 'desktop' | 'tablet' | 'server';
export type IdentityKind = 'user' | 'tag' | 'owner';

export interface TopologyDevice {
  id: string;
  name: string;
  type: DeviceType;
  ip: string;
  online: boolean;
  userId: string;
  userName: string;
  lastSeen?: string;
  tags: string[];
}

export interface TopologyIdentity {
  id: string;
  name: string;
  online: boolean;
  deviceCount: number;
  kind: IdentityKind;
  colorIndex: number;
}

export interface TopologyACLRule {
  src: string;
  dst: string;
  action: ACLAction;
}

export interface TopologyData {
  server: { id: string; name: string };
  identities: TopologyIdentity[];
  devices: TopologyDevice[];
  acl: TopologyACLRule[];
}

export interface TopologyInput {
  users: Array<{ id: string; name: string; deviceCount: number }>;
  devices: Array<{
    id: string;
    name: string;
    user: string;
    online: boolean;
    ipAddresses: string[];
    lastSeen: string;
    tags?: string[];
  }>;
  acl: TopologyACLRule[];
}

export interface TopologyTheme {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
}

const IDENTITY_COLORS = [
  '#1677ff',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#f43f5e',
  '#06b6d4',
  '#d946ef',
  '#84cc16',
];

function normalizeIdentityKey(value?: string) {
  return (value || '').trim().toLowerCase();
}

function tagIdentityId(tag: string) {
  return `tag:${normalizeIdentityKey(tag)}`;
}

function ownerIdentityId(owner: string) {
  return `owner:${normalizeIdentityKey(owner) || 'unknown'}`;
}

export function inferDeviceType(name: string): DeviceType {
  const value = name.toLowerCase();
  if (/iphone|android|phone|pixel|mobile/.test(value))
    return 'phone';
  if (/ipad|tablet|surface|pad/.test(value))
    return 'tablet';
  if (/macbook|laptop|thinkpad|thinkbook|notebook|mba/.test(value))
    return 'laptop';
  if (/server|nas|raspberry|vault|kvm|openwrt|cloud|\bpi\b|dev/.test(value))
    return 'server';
  return 'desktop';
}

export function normalizeTopology(
  input: TopologyInput | null | undefined,
  statuses: Map<string, { online?: boolean }> | undefined,
  hideOffline: boolean,
): TopologyData | null {
  if (!input?.users || !input.devices)
    return null;

  const userIdByName = new Map(input.users.map((user) => [normalizeIdentityKey(user.name), String(user.id)]));
  const identitiesById = new Map<string, Omit<TopologyIdentity, 'online' | 'deviceCount' | 'colorIndex'>>();

  input.users.forEach((user) => {
    identitiesById.set(String(user.id), { id: String(user.id), name: user.name, kind: 'user' });
  });

  const devices = input.devices.flatMap<TopologyDevice>((device) => {
    const id = String(device.id);
    const online = statuses?.get(id)?.online ?? device.online;
    if (hideOffline && !online)
      return [];

    const tags = (device.tags || []).map((tag) => tag.trim()).filter(Boolean);
    let userId = userIdByName.get(normalizeIdentityKey(device.user));
    let userName = device.user;

    if (!userId && tags.length > 0) {
      userId = tagIdentityId(tags[0]);
      userName = tags[0];
      identitiesById.set(userId, { id: userId, name: userName, kind: 'tag' });
    }

    if (!userId) {
      userId = ownerIdentityId(device.user);
      userName = device.user || 'unknown';
      identitiesById.set(userId, { id: userId, name: userName, kind: 'owner' });
    }

    return [{
      id,
      name: device.name,
      type: inferDeviceType(device.name),
      ip: device.ipAddresses?.[0] || 'N/A',
      online,
      userId,
      userName,
      lastSeen: device.lastSeen,
      tags,
    }];
  });

  const identities = [...identitiesById.values()]
    .map((identity) => {
      const ownedDevices = devices.filter((device) => device.userId === identity.id);
      return {
        ...identity,
        online: ownedDevices.some((device) => device.online),
        deviceCount: ownedDevices.length,
      };
    })
    .filter((identity) => identity.deviceCount > 0)
    .sort((a, b) => b.deviceCount - a.deviceCount || a.name.localeCompare(b.name))
    .map((identity, colorIndex) => ({ ...identity, colorIndex }));

  return {
    server: { id: 'server', name: 'Headscale Server' },
    identities,
    devices,
    acl: input.acl || [],
  };
}

export function identityColor(index: number) {
  return IDENTITY_COLORS[index % IDENTITY_COLORS.length];
}

export function buildACLIndex(data: TopologyData) {
  const allowed = new Map<string, Set<string>>();
  data.acl.forEach((rule) => {
    if (rule.action !== 'accept')
      return;
    if (!allowed.has(rule.src))
      allowed.set(rule.src, new Set());
    allowed.get(rule.src)!.add(rule.dst);
  });
  return allowed;
}

export function canAccess(data: TopologyData, allowed: Map<string, Set<string>>, sourceId: string, targetId: string) {
  if (sourceId === targetId || allowed.get(sourceId)?.has(targetId))
    return true;
  const source = data.devices.find((device) => device.id === sourceId);
  const target = data.devices.find((device) => device.id === targetId);
  return Boolean(source && target && source.userId === target.userId);
}

export function buildACLHighlight(data: TopologyData, selectedId: string) {
  const allowed = buildACLIndex(data);
  const source = data.devices.find((device) => device.id === selectedId);
  const targetIds = new Set<string>();
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  if (!source)
    return { targetIds, nodeIds, edgeIds };

  const sourceIdentityNode = `identity-node:${source.userId}`;
  data.devices
    .filter((device) => device.id !== selectedId && canAccess(data, allowed, selectedId, device.id))
    .forEach((target) => {
      const targetIdentityNode = `identity-node:${target.userId}`;
      targetIds.add(target.id);
      nodeIds.add(source.id);
      nodeIds.add(sourceIdentityNode);
      nodeIds.add(target.id);
      nodeIds.add(targetIdentityNode);
      edgeIds.add(`structure:identity:${source.userId}:${source.id}`);
      edgeIds.add(`structure:identity:${target.userId}:${target.id}`);

      if (source.userId !== target.userId) {
        nodeIds.add(data.server.id);
        edgeIds.add(`structure:server:${source.userId}`);
        edgeIds.add(`structure:server:${target.userId}`);
      }
    });

  return { targetIds, nodeIds, edgeIds };
}

export function deviceRingRank(index: number) {
  let remaining = Math.max(0, index);
  let ring = 0;
  let capacity = 8;
  while (remaining >= capacity) {
    remaining -= capacity;
    ring += 1;
    capacity += 6;
  }
  return 90 - ring;
}

export function buildGraphData(data: TopologyData): GraphData {
  const ringRankByDevice = new Map<string, number>();
  data.identities.forEach((identity) => {
    data.devices
      .filter((device) => device.userId === identity.id)
      .forEach((device, index) => ringRankByDevice.set(device.id, deviceRingRank(index)));
  });

  return {
    nodes: [
      {
        id: data.server.id,
        type: 'topology-node',
        data: { kind: 'server', name: data.server.name, meta: '', online: true },
      },
      ...data.identities.map((identity) => ({
        id: `identity-node:${identity.id}`,
        type: 'topology-node',
        combo: `identity:${identity.id}`,
        data: {
          kind: 'identity',
          identityKind: identity.kind,
          name: identity.name,
          meta: `${identity.deviceCount}`,
          online: identity.online,
          accent: identityColor(identity.colorIndex),
          ringRank: 100,
        },
      })),
      ...data.devices.map((device) => ({
        id: device.id,
        type: 'topology-node',
        combo: `identity:${device.userId}`,
        data: {
          kind: 'device',
          name: device.name,
          meta: device.ip,
          online: device.online,
          deviceType: device.type,
          accent: identityColor(data.identities.find((identity) => identity.id === device.userId)?.colorIndex || 0),
          ringRank: ringRankByDevice.get(device.id) || 90,
        },
      })),
    ],
    combos: data.identities.map((identity) => ({
      id: `identity:${identity.id}`,
      data: {
        kind: identity.kind,
        name: identity.name,
        count: identity.deviceCount,
        online: identity.online,
        accent: identityColor(identity.colorIndex),
      },
    })),
    edges: data.identities.flatMap((identity) => [
      {
        id: `structure:server:${identity.id}`,
        source: data.server.id,
        target: `identity-node:${identity.id}`,
        data: { kind: 'structure', relation: 'backbone', online: identity.online },
      },
      ...data.devices
        .filter((device) => device.userId === identity.id)
        .map((device) => ({
          id: `structure:identity:${identity.id}:${device.id}`,
          source: `identity-node:${identity.id}`,
          target: device.id,
          data: { kind: 'structure', relation: 'member', online: device.online },
        })),
    ]),
  };
}
