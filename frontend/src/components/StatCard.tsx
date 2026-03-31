import React from 'react';
import { Card, Statistic, theme, Typography } from 'antd';

const { Text } = Typography;

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  subtitle,
}: StatCardProps) {
  const { token } = theme.useToken();

  return (
    <Card hoverable styles={{ body: { padding: 20 } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 14 }}>{title}</Text>
          <Statistic value={value} valueStyle={{ fontSize: 28, fontWeight: 700, marginTop: 4 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {trend && (
              <Text style={{ fontSize: 13, color: trend.isPositive ? '#52c41a' : '#ff4d4f' }}>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </Text>
            )}
            {subtitle && (
              <Text type="secondary" style={{ fontSize: 13 }}>{subtitle}</Text>
            )}
          </div>
        </div>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          background: `${token.colorPrimary}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon style={{ fontSize: 24, color: token.colorPrimary }} />
        </div>
      </div>
    </Card>
  );
}
