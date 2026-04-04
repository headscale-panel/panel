import { Card, Select, Typography, theme } from 'antd';
import { ClockCircleOutlined, DashboardOutlined, CloudServerOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { useState, useMemo } from 'react';
import { useRequest } from 'ahooks';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { metricsAPI } from '@/lib/api';
import { message } from 'antd';
import { useTranslation } from '@/i18n/index';

const { Title, Text } = Typography;

export default function Metrics() {
  const t = useTranslation();
  const { token: themeToken } = theme.useToken();
  const [timeRange, setTimeRange] = useState('7d');

  const { data: metricsData, loading } = useRequest(
    async () => {
      try {
        const influxStatus: any = await metricsAPI.getInfluxDBStatus().catch(() => ({ connected: false }));
        const influxConnected = !!influxStatus?.connected;

        const end = new Date();
        const start = new Date();
        if (timeRange === '7d') start.setDate(end.getDate() - 7);
        if (timeRange === '30d') start.setDate(end.getDate() - 30);
        if (timeRange === '90d') start.setDate(end.getDate() - 90);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        const durationStats: any[] = await metricsAPI.getOnlineDurationStats({
          start: formatDate(start),
          end: formatDate(end)
        }).then((r: any) => Array.isArray(r) ? r : r?.data || []).catch(() => []);

        const deviceStatus: any[] = await metricsAPI.getDeviceStatus().then((r: any) => Array.isArray(r) ? r : r?.data || []).catch(() => []);

        const totalDuration = durationStats.reduce((acc, curr) => acc + (curr.online_hours || 0), 0);
        const avgDuration = durationStats.length ? totalDuration / durationStats.length : 0;

        const onlineCount = deviceStatus.filter((d: any) => d.online).length;
        const offlineCount = deviceStatus.length - onlineCount;
        const pieData = [
          { name: t.common.status.online, value: onlineCount },
          { name: t.common.status.offline, value: offlineCount },
        ];

        const sortedActivity = durationStats
          .map((d: any) => ({ name: d.machine_name, hours: parseFloat(d.online_hours?.toFixed(1) || 0) }))
          .sort((a, b) => b.hours - a.hours)
          .slice(0, 10);

        return {
          influxConnected,
          activityData: sortedActivity,
          statusData: pieData,
          summary: {
            avgDuration: parseFloat(avgDuration.toFixed(1)),
            totalOnline: onlineCount,
            totalDevices: deviceStatus.length
          }
        };
      } catch (error) {
        console.error(error);
        message.error(t.metrics.loadFailed);
        throw error;
      }
    },
    {
      refreshDeps: [timeRange],
      onError: () => {
        // Error already handled
      },
    },
  );

  const activityData = metricsData?.activityData || [];
  const statusData = metricsData?.statusData || [];
  const summary = metricsData?.summary || { avgDuration: 0, totalOnline: 0, totalDevices: 0 };
  const influxConnected = metricsData?.influxConnected ?? null;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="page-header-row">
          <div>
            <Title level={4} className="m-0">{t.metrics.title}</Title>
            <Text type="secondary">{t.metrics.description}</Text>
          </div>
          <Select value={timeRange} onChange={setTimeRange} className="w-45" data-tour-id="metrics-range"
            options={[
              { value: '7d', label: t.metrics.last7Days },
              { value: '30d', label: t.metrics.last30Days },
              { value: '90d', label: t.metrics.last90Days },
            ]}
          />
        </div>

        {/* Stats Cards */}
        <PageHeaderStatCards
          minCardWidth={260}
          gap={16}
          items={[
            {
              label: t.metrics.avgOnlineDuration.replace('{range}', timeRange),
              value: `${summary.avgDuration}h`,
              icon: <ClockCircleOutlined style={{ fontSize: 28, color: themeToken.colorPrimary }} />,
              watermark: 'AVG',
            },
            {
              label: t.metrics.onlineDevices,
              value: summary.totalOnline,
              subText: t.metrics.totalDevicesSuffix.replace('{total}', String(summary.totalDevices)),
              icon: <DashboardOutlined className="stat-icon-success" />,
              watermark: 'ON',
            },
            {
              label: t.metrics.dataStatus,
              value: loading ? t.metrics.updating : influxConnected === false ? t.metrics.notConnected : t.metrics.updated,
              valueColor: loading ? undefined : influxConnected === false ? '#fa8c16' : undefined,
              icon: <CloudServerOutlined className="stat-icon-primary" />,
              watermark: 'DB',
            },
          ]}
        />

        {/* Charts */}
        <div className="metric-chart-grid" data-tour-id="metrics-charts">
          {/* Device Activity Bar Chart */}
          <Card title={t.metrics.activeDevicesRanking}>
            <div className="chart-box">
              {activityData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                    <XAxis type="number" unit="h" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                    <Bar dataKey="hours" name={t.metrics.onlineDuration} fill={themeToken.colorPrimary} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: themeToken.colorTextSecondary }}>
                  <ExclamationCircleOutlined className="mr-2" />
                  {t.metrics.noActiveData}
                </div>
              )}
            </div>
          </Card>

          {/* Device Status Pie Chart */}
          <Card title={t.metrics.deviceStatusDistribution}>
            <div className="chart-box">
              {statusData.length > 0 && summary.totalDevices > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">
                      {statusData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#22c55e' : '#e5e7eb'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: themeToken.colorTextSecondary }}>
                  <ExclamationCircleOutlined className="mr-2" />
                  {t.metrics.noDeviceData}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
