/*
 * Copyright (C) 2026 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { ReactNode } from 'react';
import { Card, Typography } from 'antd';

const { Text } = Typography;

export interface PageHeaderStatCardItem {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  subText?: ReactNode;
  watermark?: ReactNode;
  valueColor?: string;
}

interface PageHeaderStatCardsProps {
  items: PageHeaderStatCardItem[];
  minCardWidth?: number;
  gap?: number;
}

export default function PageHeaderStatCards({
  items,
  minCardWidth = 180,
  gap = 12,
}: PageHeaderStatCardsProps) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`, gap }}>
      {items.map((item, index) => (
        <Card key={item.key ?? `${index}`} size="small" className="stat-card">
          {item.watermark
            ? (
                <div className="stat-watermark">
                  {item.watermark}
                </div>
              )
            : null}
          <div className="stat-content">
            <div>
              <Text type="secondary" className="stat-label">{item.label}</Text>
              <div className="stat-value" style={{ color: item.valueColor }}>{item.value}</div>
              {item.subText ? <Text type="secondary" className="stat-subtext">{item.subText}</Text> : null}
            </div>
            {item.icon}
          </div>
        </Card>
      ))}
    </div>
  );
}
