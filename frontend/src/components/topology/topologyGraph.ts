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
    .map((identity) => ({ ...identity, colorIndex: identityColorIndex(identity.id) }));

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

// identityColorIndex maps an identity id onto a colour slot.
//
// Deriving the slot from the id rather than from the position in the sorted list is
// what keeps a user's colour stable: the list is ordered by device count, so an index
// would shift every other identity whenever anyone adds or removes a device.
export function identityColorIndex(identityId: string): number {
  let hash = 0;
  for (let i = 0; i < identityId.length; i++)
    hash = (hash * 31 + identityId.charCodeAt(i)) >>> 0;
  return hash % IDENTITY_COLORS.length;
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

// MAX_DEVICES_PER_IDENTITY bounds how many devices one identity draws.
//
// Past roughly two ring's worth of nodes the cluster is unreadable at any zoom, and
// the layout cost grows with every extra node. The rest are collapsed into a `+N`
// badge the operator can widen by searching or selecting.
export const MAX_DEVICES_PER_IDENTITY = 22;

// collapseLabel renders the device count for an identity node, appending +N when the
// cap hid some of them, so the operator can tell a small group from a truncated one.
function collapseLabel(total: number, hidden: number): string {
  return hidden > 0 ? `${total} (+${hidden})` : String(total);
}

// detailLevelForZoom decides how much text a node shows at a given zoom.
//
// Zoomed out, labels overlap into an unreadable smear and cost a redraw per node for
// information nobody can read; zoomed in, hiding them wastes the space. Three levels
// rather than a continuous fade keeps the node renderer from re-rendering on every
// wheel tick.
export function detailLevelForZoom(zoom: number): 0 | 1 | 2 {
  if (zoom < 0.55)
    return 0;
  if (zoom < 0.9)
    return 1;
  return 2;
}

// nodeTexts returns the name and meta line a node should render at a detail level.
//
// Kept pure so the three-way rule is testable without a canvas: level 0 shows only
// the icon, level 1 adds the name, level 2 adds the meta line as well.
export function nodeTexts(detailLevel: number, name: string, meta: string): { name: string; meta: string } {
  if (detailLevel <= 0)
    return { name: '', meta: '' };
  if (detailLevel === 1)
    return { name, meta: '' };
  return { name, meta };
}

export function buildGraphData(data: TopologyData, alwaysVisible?: Set<string>): GraphData {
  const visibleDeviceIds = new Set<string>();
  const hiddenByDevice = new Map<string, number>();

  const ringRankByDevice = new Map<string, number>();
  data.identities.forEach((identity) => {
    const owned = data.devices.filter((device) => device.userId === identity.id);
    // A device the operator is searching for or has selected stays visible even when
    // it falls outside the visible window; hiding the thing they asked about would
    // make the cap feel like a bug.
    const pinned = owned.filter((device) => alwaysVisible?.has(device.id));
    const rest = owned.filter((device) => !alwaysVisible?.has(device.id));
    const room = Math.max(0, MAX_DEVICES_PER_IDENTITY - pinned.length);
    const shown = [...pinned, ...rest.slice(0, room)];
    hiddenByDevice.set(identity.id, owned.length - shown.length);

    shown.forEach((device, index) => {
      visibleDeviceIds.add(device.id);
      ringRankByDevice.set(device.id, deviceRingRank(index));
    });
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
          meta: collapseLabel(identity.deviceCount, hiddenByDevice.get(identity.id) || 0),
          online: identity.online,
          accent: identityColor(identity.colorIndex),
          ringRank: 100,
        },
      })),
      ...data.devices.filter((device) => visibleDeviceIds.has(device.id)).map((device) => ({
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
        visibleCount: data.devices.filter((device) => device.userId === identity.id && visibleDeviceIds.has(device.id)).length,
        hiddenCount: identity.deviceCount - data.devices.filter((device) => device.userId === identity.id && visibleDeviceIds.has(device.id)).length,
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
