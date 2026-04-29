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
