/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import type { BaseNodeStyleProps } from '@antv/g6';
import { Badge, Circle, Label } from '@antv/g6';

interface TopologyNodeStyle extends BaseNodeStyleProps {
  kind?: 'server' | 'identity' | 'device';
  name?: string;
  meta?: string;
  online?: boolean;
  deviceType?: string;
  accent?: string;
  textColor?: string;
  mutedColor?: string;
  iconSurface?: string;
  iconColor?: string;
}

const DEVICE_ICONS: Record<string, string> = {
  desktop: '▣',
  laptop: '▰',
  phone: '▯',
  tablet: '▭',
  server: '◆',
};

export class TopologyNode extends Circle {
  public render(attributes: Required<TopologyNodeStyle>, container = this) {
    super.render(attributes, container);

    const [width, height] = this.getSize(attributes);
    const isServer = attributes.kind === 'server';
    const isIdentity = attributes.kind === 'identity';
    const icon = isServer
      ? '☁'
      : isIdentity ? attributes.name.charAt(0).toUpperCase() : DEVICE_ICONS[attributes.deviceType] || DEVICE_ICONS.desktop;

    this.upsert('glyph', Label, {
      x: 0,
      y: 0,
      text: icon,
      fontSize: isServer ? 25 : isIdentity ? 15 : 17,
      fontWeight: 700,
      fill: attributes.iconColor,
      textAlign: 'center',
      textBaseline: 'middle',
      pointerEvents: 'none',
    }, container);

    this.upsert('title', Label, {
      x: 0,
      y: height / 2 + 13,
      text: attributes.name,
      fontSize: isServer ? 10 : 9,
      fontWeight: isServer || isIdentity ? 600 : 500,
      fill: attributes.textColor,
      textAlign: 'center',
      wordWrap: true,
      wordWrapWidth: isServer ? 118 : 94,
      maxLines: 1,
      textOverflow: '...',
      background: isServer || isIdentity,
      backgroundFill: attributes.iconSurface,
      backgroundStroke: attributes.accent,
      backgroundLineWidth: 1,
      backgroundRadius: 9,
      padding: isServer || isIdentity ? [3, 7] : 0,
      pointerEvents: 'none',
    }, container);

    this.upsert('meta', Label, {
      x: 0,
      y: height / 2 + (isServer || isIdentity ? 31 : 27),
      text: attributes.meta,
      fontSize: 8,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fill: attributes.mutedColor,
      textAlign: 'center',
      wordWrap: true,
      wordWrapWidth: 100,
      maxLines: 1,
      textOverflow: '...',
      pointerEvents: 'none',
    }, container);

    this.upsert('status', Badge, {
      x: width / 2 - 2,
      y: -height / 2 + 2,
      text: '',
      padding: isServer ? 4.5 : 4,
      background: true,
      backgroundFill: attributes.online ? '#22c55e' : '#94a3b8',
      backgroundStroke: attributes.iconSurface,
      backgroundLineWidth: 3,
      pointerEvents: 'none',
    }, container);
  }
}
