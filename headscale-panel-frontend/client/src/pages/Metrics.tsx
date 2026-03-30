import { Card, Select, Typography, theme } from 'antd';
import { ClockCircleOutlined, DashboardOutlined, CloudServerOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import DashboardLayout from '@/components/DashboardLayout';
import { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    avgDuration: 0,
    totalOnline: 0,
    totalDevices: 0
  });
  const [influxConnected, setInfluxConnected] = useState<boolean | null>(null);

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const influxStatus: any = await metricsAPI.getInfluxDBStatus().catch(() => ({ connected: false }));
      setInfluxConnected(!!influxStatus?.connected);

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

      setActivityData(sortedActivity);
      setStatusData(pieData);
      setSummary({
        avgDuration: parseFloat(avgDuration.toFixed(1)),
        totalOnline: onlineCount,
        totalDevices: deviceStatus.length
      });

    } catch (error) {
      console.error(error);
      message.error(t.metrics.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const iconBox = (icon: React.ReactNode, color: string) => (
    <div style={{ width: 48, height: 48, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
  );

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{t.metrics.title}</Title>
            <Text type="secondary">{t.metrics.description}</Text>
          </div>
          <Select value={timeRange} onChange={setTimeRange} style={{ width: 180 }}
            options={[
              { value: '7d', label: t.metrics.last7Days },
              { value: '30d', label: t.metrics.last30Days },
              { value: '90d', label: t.metrics.last90Days },
            ]}
          />
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>{t.metrics.avgOnlineDuration.replace('{range}', timeRange)}</Text>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{summary.avgDuration}h</div>
              </div>
              {iconBox(<ClockCircleOutlined style={{ fontSize: 24, color: themeToken.colorPrimary }} />, themeToken.colorPrimary)}
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>{t.metrics.onlineDevices}</Text>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{summary.totalOnline}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>{t.metrics.totalDevicesSuffix.replace('{total}', String(summary.totalDevices))}</Text>
              </div>
              {iconBox(<DashboardOutlined style={{ fontSize: 24, color: '#52c41a' }} />, '#52c41a')}
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>{t.metrics.dataStatus}</Text>
                <div style={{
                  fontSize: 18, fontWeight: 700, marginTop: 8,
                  color: loading ? undefined : influxConnected === false ? '#fa8c16' : undefined
                }}>
                  {loading ? t.metrics.updating : influxConnected === false ? t.metrics.notConnected : t.metrics.updated}
                </div>
              </div>
              {iconBox(<CloudServerOutlined style={{ fontSize: 24, color: '#1677ff' }} />, '#1677ff')}
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
          {/* Device Activity Bar Chart */}
          <Card title={t.metrics.activeDevicesRanking}>
            <div style={{ height: 300, width: '100%' }}>
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
                  <ExclamationCircleOutlined style={{ marginRight: 8 }} />
                  {t.metrics.noActiveData}
                </div>
              )}
            </div>
          </Card>

          {/* Device Status Pie Chart */}
          <Card title={t.metrics.deviceStatusDistribution}>
            <div style={{ height: 300, width: '100%' }}>
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
                  <ExclamationCircleOutlined style={{ marginRight: 8 }} />
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
