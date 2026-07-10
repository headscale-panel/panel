/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import type { GraphData, GraphOptions, IElementEvent, NodeData } from '@antv/g6';
import type {
  DeviceType,
  TopologyData,
  TopologyDevice,
  TopologyInput,
  TopologyTheme,
} from './topology/topologyGraph';
import {
  CloudServerOutlined,
  CodeOutlined,
  CopyOutlined,
  DesktopOutlined,
  ExpandOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LaptopOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  TabletOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import {
  CanvasEvent,
  ComboEvent,
  ExtensionCategory,
  getExtension,
  Graph,
  NodeEvent,
  register,
} from '@antv/g6';
import { Button, Card, Drawer, Empty, message, Tag, theme, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/index';
import {
  buildACLHighlight,
  buildACLIndex,
  buildGraphData,
  canAccess,
  deviceRingRank,
  identityColor,
  normalizeTopology,
} from './topology/topologyGraph';
import { TopologyNode } from './topology/TopologyNode';

const { Text } = Typography;
const TOPOLOGY_NODE = 'topology-node';

if (!getExtension(ExtensionCategory.NODE, TOPOLOGY_NODE))
  register(ExtensionCategory.NODE, TOPOLOGY_NODE, TopologyNode);

interface NetworkTopologyProps {
  data?: (TopologyInput & { policy?: unknown }) | null;
  deviceStatuses?: Map<string, { online?: boolean }>;
}

function graphStructureSignature(data: GraphData) {
  return JSON.stringify({
    nodes: data.nodes?.map((node) => [node.id, node.combo]),
    combos: data.combos?.map((combo) => combo.id),
    edges: data.edges?.map((edge) => [edge.id, edge.source, edge.target]),
  });
}

function nodeStyle(datum: NodeData, colors: TopologyTheme) {
  const item = datum.data || {};
  const isServer = item.kind === 'server';
  const isIdentity = item.kind === 'identity';
  const isOnline = Boolean(item.online);
  const accent = String(item.accent || colors.primary);
  return {
    size: isServer ? 60 : isIdentity ? 38 : 42,
    fill: isServer || isIdentity ? accent : isOnline ? colors.surface : colors.surfaceMuted,
    stroke: isOnline || isServer ? accent : colors.border,
    lineWidth: isServer ? 2.5 : 2,
    shadowColor: colors.isDark ? 'rgba(0,0,0,0.42)' : 'rgba(15,23,42,0.12)',
    shadowBlur: isServer ? 18 : 8,
    shadowOffsetY: 3,
    label: false,
    icon: false,
    badge: false,
    port: false,
    kind: item.kind,
    name: item.name,
    meta: item.meta,
    online: item.online,
    deviceType: item.deviceType,
    accent,
    textColor: colors.text,
    mutedColor: colors.textMuted,
    iconSurface: colors.surface,
    iconColor: isServer || isIdentity ? '#fff' : isOnline ? accent : colors.textMuted,
    cursor: isServer ? 'default' as const : 'pointer' as const,
  };
}

function comboStyle() {
  return {
    padding: [28, 24, 48, 24],
    fillOpacity: 0,
    strokeOpacity: 0,
    lineWidth: 0,
    label: false,
    collapsedMarker: false,
  };
}

function orbitRadius(deviceCount: number, ring: number) {
  const baseRadius = deviceCount <= 2 ? 82 : deviceCount <= 8 ? 94 : 104;
  return baseRadius + ring * 82;
}

async function applyDeviceOrbitPositions(graph: Graph, topology: TopologyData) {
  const server = graph.getNodeData(topology.server.id);
  const serverX = Number(server.style?.x || 0);
  const serverY = Number(server.style?.y || 0);
  const updates: Array<{ id: string; style: { x: number; y: number } }> = [];

  topology.identities.forEach((identity) => {
    const identityNode = graph.getNodeData(`identity-node:${identity.id}`);
    const centerX = Number(identityNode.style?.x || 0);
    const centerY = Number(identityNode.style?.y || 0);
    const backboneAngle = Math.atan2(serverY - centerY, serverX - centerX);
    const devices = topology.devices.filter((device) => device.userId === identity.id);
    const rings = new Map<number, TopologyDevice[]>();
    devices.forEach((device, index) => {
      const ring = 90 - deviceRingRank(index);
      if (!rings.has(ring))
        rings.set(ring, []);
      rings.get(ring)!.push(device);
    });

    rings.forEach((ringDevices, ring) => {
      const radius = orbitRadius(devices.length, ring);
      const reservedAngle = Math.PI / 3;
      const availableAngle = Math.PI * 2 - reservedAngle;
      ringDevices.forEach((device, index) => {
        const angle = ringDevices.length === 1
          ? backboneAngle + Math.PI
          : backboneAngle + reservedAngle / 2 + ((index + 0.5) * availableAngle) / ringDevices.length + ring * 0.13;
        updates.push({
          id: device.id,
          style: {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          },
        });
      });
    });
  });

  if (updates.length) {
    graph.updateNodeData(updates);
    await graph.draw();
  }
}

async function fitOverflowWithMargin(graph: Graph, duration: number) {
  await graph.fitView({ when: 'overflow' }, { duration });
  if (graph.getZoom() < 0.999)
    await graph.zoomBy(0.84, { duration: Math.min(duration, 240) });
}

function createGraphOptions(
  container: HTMLDivElement,
  colorsRef: React.MutableRefObject<TopologyTheme>,
  topologyRef: React.MutableRefObject<TopologyData | null>,
): GraphOptions {
  return {
    container,
    autoResize: true,
    animation: true,
    zoomRange: [0.18, 2.5],
    layout: {
      type: 'combo-combined',
      nodeSize: (datum: NodeData) => datum.data?.kind === 'server' ? 92 : datum.data?.kind === 'identity' ? 82 : 94,
      comboPadding: 30,
      comboSpacing: 56,
      layout: (comboId: string | null) => comboId
        ? {
            type: 'concentric',
            preventOverlap: true,
            nodeSize: (() => {
              const identityId = comboId.slice('identity:'.length);
              const count = topologyRef.current?.identities.find((identity) => identity.id === identityId)?.deviceCount || 1;
              const outerRing = 90 - deviceRingRank(Math.max(0, count - 1));
              const targetRadius = orbitRadius(count, outerRing);
              return Math.max(24, Math.min(74, (targetRadius * Math.PI * 2) / Math.max(1, count)));
            })(),
            nodeSpacing: 8,
            sortBy: 'degree',
            maxLevelDiff: 1,
            equidistant: true,
          }
        : {
            type: 'force',
            preventOverlap: true,
            nodeSize: 'node.size',
            nodeSpacing: 56,
            linkDistance: 220,
            gravity: 5,
            factor: 1.2,
          },
    },
    node: {
      type: TOPOLOGY_NODE,
      style: (datum) => nodeStyle(datum, colorsRef.current),
      state: {
        selected: {
          lineWidth: 3,
          stroke: '#22c55e',
          shadowColor: 'rgba(34,197,94,0.5)',
          shadowBlur: 22,
        },
        related: {
          lineWidth: 2.5,
          stroke: '#22c55e',
          shadowColor: 'rgba(34,197,94,0.3)',
          shadowBlur: 14,
        },
        inactive: { opacity: 0.3 },
      },
      animation: {
        update: [{ fields: ['x', 'y', 'opacity', 'lineWidth'], duration: 280 }],
      },
    },
    combo: {
      type: 'rect',
      style: () => comboStyle(),
      state: {
        selected: { lineWidth: 2.5, strokeOpacity: 0.9 },
        inactive: { opacity: 0.32 },
      },
      animation: { update: [{ fields: ['x', 'y', 'width', 'height'], duration: 320 }] },
    },
    edge: {
      type: 'line',
      style: (datum) => ({
        stroke: colorsRef.current.primary,
        lineWidth: datum.data?.relation === 'backbone' ? 1.8 : 1.2,
        opacity: datum.data?.online ? 0.36 : 0.18,
        lineDash: datum.data?.online ? 0 : [5, 5],
      }),
      state: {
        related: {
          stroke: '#22c55e',
          lineWidth: 2.6,
          opacity: 0.95,
          shadowColor: 'rgba(34,197,94,0.38)',
          shadowBlur: 8,
        },
        inactive: { opacity: 0.06 },
      },
      animation: { update: [{ fields: ['opacity', 'lineWidth', 'stroke'], duration: 220 }] },
    },
    behaviors: [
      'drag-canvas',
      'zoom-canvas',
      { type: 'drag-element', enable: (event: IElementEvent) => event.targetType === 'node' },
      { type: 'optimize-viewport-transform', enable: true },
    ],
  };
}

function DeviceIcon({ type, online, size = 20 }: { type: DeviceType; online: boolean; size?: number }) {
  const style = { fontSize: size, color: online ? '#1677ff' : '#94a3b8' };
  switch (type) {
    case 'laptop': return <LaptopOutlined style={style} />;
    case 'phone': return <MobileOutlined style={style} />;
    case 'tablet': return <TabletOutlined style={style} />;
    case 'server': return <CloudServerOutlined style={style} />;
    default: return <DesktopOutlined style={style} />;
  }
}

export default function NetworkTopology({ data, deviceStatuses }: NetworkTopologyProps) {
  const t = useTranslation();
  const { token } = theme.useToken();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | undefined>(undefined);
  const topologyRef = useRef<TopologyData | null>(null);
  const previousStructureRef = useRef('');
  const themeReadyRef = useRef(false);
  const colorsRef = useRef<TopologyTheme>({} as TopologyTheme);
  const hasACLHighlightRef = useRef(false);
  const [hideOffline, setHideOffline] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<TopologyDevice | null>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const colors = useMemo<TopologyTheme>(() => ({
    isDark,
    background: token.colorBgContainer,
    surface: token.colorBgElevated,
    surfaceMuted: token.colorBgLayout,
    text: token.colorText,
    textMuted: token.colorTextSecondary,
    border: token.colorBorderSecondary,
    primary: token.colorPrimary,
  }), [isDark, token.colorBgContainer, token.colorBgElevated, token.colorBgLayout, token.colorBorderSecondary, token.colorPrimary, token.colorText, token.colorTextSecondary]);
  colorsRef.current = colors;

  const topologyData = useMemo(
    () => normalizeTopology(data || null, deviceStatuses, hideOffline),
    [data, deviceStatuses, hideOffline],
  );
  topologyRef.current = topologyData;

  const graphData = useMemo(() => topologyData ? buildGraphData(topologyData) : { nodes: [], edges: [], combos: [] }, [topologyData]);

  const dynamicHeight = useMemo(() => {
    const count = topologyData?.devices.length || 0;
    return Math.min(900, Math.max(560, 520 + Math.ceil(count / 12) * 70));
  }, [topologyData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container)
      return;

    const graph = new Graph(createGraphOptions(container, colorsRef, topologyRef));
    graphRef.current = graph;

    const selectNode = (event: IElementEvent) => {
      const id = String(event.target.id);
      const device = topologyRef.current?.devices.find((item) => item.id === id);
      if (device)
        setSelectedDevice(device);
    };
    const clearSelection = () => setSelectedDevice(null);

    graph.on(NodeEvent.CLICK, selectNode);
    graph.on(ComboEvent.CLICK, (event) => graph.setElementState(String((event as IElementEvent).target.id), ['selected'], true));
    graph.on(CanvasEvent.CLICK, clearSelection);

    return () => {
      graph.destroy();
      graphRef.current = undefined;
      previousStructureRef.current = '';
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || graph.destroyed)
      return;
    const signature = graphStructureSignature(graphData);
    let cancelled = false;

    const update = async () => {
      if (signature !== previousStructureRef.current) {
        graph.setData(graphData);
        await graph.render();
        if (topologyData)
          await applyDeviceOrbitPositions(graph, topologyData);
        if (!cancelled && graphData.nodes?.length)
          await fitOverflowWithMargin(graph, 420);
        previousStructureRef.current = signature;
        return;
      }

      graph.updateData({
        nodes: graphData.nodes?.map((node) => ({ id: node.id, data: node.data })),
        combos: graphData.combos?.map((combo) => ({ id: combo.id, data: combo.data })),
        edges: graphData.edges?.map((edge) => ({ id: edge.id, data: edge.data })),
      });
      await graph.draw();
    };

    update().catch((error) => console.error('Failed to update topology graph', error));
    return () => { cancelled = true; };
  }, [graphData]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || graph.destroyed)
      return;
    if (!themeReadyRef.current) {
      themeReadyRef.current = true;
      return;
    }
    graph.setOptions(createGraphOptions(containerRef.current!, colorsRef, topologyRef));
    graph.draw().catch((error) => console.error('Failed to update topology theme', error));
  }, [colors]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || graph.destroyed || !topologyData)
      return;
    if (!selectedDevice && !hasACLHighlightRef.current)
      return;
    let cancelled = false;

    const updateACLOverlay = async () => {
      const elementStates: Record<string, string[]> = {};
      topologyData.devices.forEach((device) => { elementStates[device.id] = []; });
      topologyData.identities.forEach((identity) => {
        elementStates[`identity-node:${identity.id}`] = [];
        elementStates[`structure:server:${identity.id}`] = [];
        topologyData.devices
          .filter((device) => device.userId === identity.id)
          .forEach((device) => { elementStates[`structure:identity:${identity.id}:${device.id}`] = []; });
      });
      elementStates[topologyData.server.id] = [];

      if (selectedDevice) {
        const highlight = buildACLHighlight(topologyData, selectedDevice.id);
        topologyData.devices.forEach((device) => {
          elementStates[device.id] = device.id === selectedDevice.id
            ? ['selected']
            : highlight.targetIds.has(device.id) ? ['related'] : ['inactive'];
        });
        topologyData.identities.forEach((identity) => {
          const id = `identity-node:${identity.id}`;
          elementStates[id] = highlight.nodeIds.has(id) ? ['related'] : ['inactive'];
        });
        elementStates[topologyData.server.id] = highlight.nodeIds.has(topologyData.server.id) ? ['related'] : ['inactive'];
        Object.keys(elementStates)
          .filter((id) => id.startsWith('structure:'))
          .forEach((id) => { elementStates[id] = highlight.edgeIds.has(id) ? ['related'] : ['inactive']; });
      }
      hasACLHighlightRef.current = Boolean(selectedDevice);

      // Data updates and the ACL overlay are driven by separate effects. Ensure
      // the latest element instances exist before applying visual states.
      await graph.draw();
      await graph.setElementState(elementStates, true);
      if (!cancelled)
        await graph.draw();
    };

    updateACLOverlay().catch((error) => console.error('Failed to update ACL overlay', error));
    return () => { cancelled = true; };
  }, [selectedDevice, topologyData]);

  const aclIndex = useMemo(() => topologyData ? buildACLIndex(topologyData) : new Map<string, Set<string>>(), [topologyData]);

  const aclGroups = useMemo(() => {
    if (!selectedDevice || !topologyData)
      return {};
    return topologyData.devices
      .filter((device) => device.id !== selectedDevice.id)
      .reduce<Record<string, Array<{ device: TopologyDevice; allowed: boolean }>>>((groups, device) => {
        const key = device.userName || device.userId;
        if (!groups[key])
          groups[key] = [];
        groups[key].push({ device, allowed: canAccess(topologyData, aclIndex, selectedDevice.id, device.id) });
        return groups;
      }, {});
  }, [aclIndex, selectedDevice, topologyData]);

  const aclCounts = useMemo(() => Object.values(aclGroups).flat().reduce(
    (counts, item) => ({ ...counts, [item.allowed ? 'allowed' : 'denied']: counts[item.allowed ? 'allowed' : 'denied'] + 1 }),
    { allowed: 0, denied: 0 },
  ), [aclGroups]);

  const fitView = useCallback(() => {
    const graph = graphRef.current;
    if (graph)
      return fitOverflowWithMargin(graph, 320);
  }, []);
  const zoomBy = useCallback((ratio: number) => graphRef.current?.zoomBy(ratio, { duration: 180 }), []);

  const toggleOfflineDevices = useCallback(() => {
    if (!hideOffline && selectedDevice && !selectedDevice.online)
      setSelectedDevice(null);
    setHideOffline((value) => !value);
  }, [hideOffline, selectedDevice]);

  const copyToClipboard = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    message.success(t.topology.copiedToClipboard);
  }, [t.topology.copiedToClipboard]);

  return (
    <Card className="relative overflow-hidden" styles={{ body: { padding: 0 } }}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: dynamicHeight,
          overflow: 'hidden',
          backgroundColor: token.colorBgContainer,
          backgroundImage: isDark
            ? 'radial-gradient(rgba(96,165,250,0.13) 1px, transparent 1px)'
            : 'radial-gradient(rgba(22,119,255,0.1) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {!topologyData?.devices.length && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <Empty description={t.topology.noData} />
        </div>
      )}

      <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 10, display: 'flex', gap: 6, padding: 6, borderRadius: 12, background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: token.boxShadowTertiary }}>
        <Button size="small" icon={<ZoomInOutlined />} onClick={() => zoomBy(1.16)} />
        <Button size="small" icon={<ZoomOutOutlined />} onClick={() => zoomBy(0.86)} />
        <Button size="small" icon={<ExpandOutlined />} onClick={fitView} />
        <div style={{ width: 1, background: token.colorBorderSecondary, margin: '2px 2px' }} />
        <Button
          size="small"
          type={hideOffline ? 'primary' : 'default'}
          icon={hideOffline ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={toggleOfflineDevices}
        >
          {hideOffline ? t.topology.showOffline : t.topology.hideOffline}
        </Button>
      </div>

      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: token.boxShadowTertiary }}>
        <SafetyCertificateOutlined style={{ color: '#22c55e' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>{t.topology.instructions}</Text>
      </div>

      <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center', padding: '7px 11px', borderRadius: 12, background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: token.boxShadowTertiary }}>
        <Tag color="blue" className="m-0">
          {topologyData?.identities.length || 0}
          {' '}
          {t.topology.usersLabel}
        </Tag>
        <Tag color="cyan" className="m-0">
          {topologyData?.devices.length || 0}
          {' '}
          {t.topology.devicesLabel}
        </Tag>
        <Tag color="green" className="m-0">
          {topologyData?.devices.filter((device) => device.online).length || 0}
          {' '}
          {t.common.status.online}
        </Tag>
      </div>

      <div style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 10, padding: '8px 11px', borderRadius: 12, background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: token.boxShadowTertiary }}>
        <div className="flex items-center gap-3" style={{ fontSize: 11, color: token.colorTextSecondary }}>
          <span className="flex items-center gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 8, background: '#22c55e' }} />
            {t.common.status.online}
          </span>
          <span className="flex items-center gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 8, background: '#94a3b8' }} />
            {t.common.status.offline}
          </span>
          <span className="flex items-center gap-1">
            <i style={{ width: 18, height: 2, borderRadius: 2, background: '#22c55e' }} />
            {t.topology.accessiblePath}
          </span>
        </div>
      </div>

      <Drawer
        open={Boolean(selectedDevice)}
        onClose={() => setSelectedDevice(null)}
        size={420}
        title={selectedDevice && (
          <div className="flex items-center gap-3">
            <div style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: selectedDevice.online ? token.colorPrimaryBg : token.colorBgLayout, border: `1px solid ${selectedDevice.online ? token.colorPrimaryBorder : token.colorBorderSecondary}` }}>
              <DeviceIcon type={selectedDevice.type} online={selectedDevice.online} size={23} />
            </div>
            <div>
              <div className="text-16px font-600">{selectedDevice.name}</div>
              <Text type="secondary" className="mono-cell">{selectedDevice.ip}</Text>
            </div>
          </div>
        )}
      >
        {selectedDevice && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <Text type="secondary">{t.topology.status}</Text>
              <Tag color={selectedDevice.online ? 'success' : 'default'}>{selectedDevice.online ? t.common.status.online : t.common.status.offline}</Tag>
            </div>
            <div className="flex justify-between items-center">
              <Text type="secondary">{t.topology.belongsToUser}</Text>
              <Text strong>{selectedDevice.userName}</Text>
            </div>
            {selectedDevice.tags.length > 0 && (
              <div className="flex justify-between items-start gap-3">
                <Text type="secondary">{t.topology.tags}</Text>
                <div className="flex flex-wrap justify-end gap-1">{selectedDevice.tags.map((tag) => <Tag key={tag} color="gold" className="m-0">{tag}</Tag>)}</div>
              </div>
            )}
            {selectedDevice.lastSeen && (
              <div className="flex justify-between items-center">
                <Text type="secondary">{t.topology.lastOnline}</Text>
                <Text>{selectedDevice.lastSeen}</Text>
              </div>
            )}

            <div style={{ height: 1, background: token.colorBorderSecondary }} />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Text strong>{t.topology.aclPermissions}</Text>
                <Tag>
                  {aclCounts.allowed}
                  {' '}
                  {t.topology.allow}
                  {' '}
                  /
                  {' '}
                  {aclCounts.denied}
                  {' '}
                  {t.topology.deny}
                </Tag>
              </div>
              <div className="max-h-80 overflow-auto pr-1 flex flex-col gap-3">
                {Object.entries(aclGroups).map(([userName, devices], groupIndex) => (
                  <div key={userName}>
                    <div className="flex items-center gap-2 mb-2" style={{ fontSize: 12, color: token.colorTextSecondary }}>
                      <span style={{ width: 20, height: 20, borderRadius: 7, display: 'grid', placeItems: 'center', background: `${identityColor(groupIndex)}20`, color: identityColor(groupIndex), fontWeight: 700 }}>{userName.charAt(0).toUpperCase()}</span>
                      {userName}
                      <Text type="secondary">
                        (
                        {devices.length}
                        )
                      </Text>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {devices.map(({ device, allowed }) => (
                        <div key={device.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: allowed ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.055)', border: `1px solid ${allowed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.16)'}` }}>
                          <div className="flex items-center gap-2">
                            <DeviceIcon type={device.type} online={device.online} size={15} />
                            <div>
                              <div className="text-11px font-500">{device.name}</div>
                              <div style={{ fontSize: 9, color: token.colorTextSecondary, fontFamily: 'var(--font-mono)' }}>{device.ip}</div>
                            </div>
                          </div>
                          <Tag color={allowed ? 'success' : 'error'} className="m-0">{allowed ? t.topology.allow : t.topology.deny}</Tag>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: token.colorBorderSecondary }} />
            <div className="flex flex-col gap-2">
              <Text strong>{t.topology.quickActions}</Text>
              <Button block icon={<CodeOutlined />} onClick={() => copyToClipboard(`ssh root@${selectedDevice.ip}`)}>{t.topology.copySSH}</Button>
              <Button block icon={<CopyOutlined />} onClick={() => copyToClipboard(selectedDevice.ip)}>{t.topology.copyIP}</Button>
            </div>
          </div>
        )}
      </Drawer>
    </Card>
  );
}
