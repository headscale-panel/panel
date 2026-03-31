import DashboardLayout from '@/components/DashboardLayout';
import NetworkTopology from '@/components/NetworkTopology';
import { dashboardAPI, devicesAPI, usersAPI } from '@/lib/api';
import {
  applyRealtimeDeviceStatus,
  type DashboardStats,
  type DashboardTopologyData,
} from '@/lib/dashboard';
import {
  normalizeDeviceListResponse,
  normalizeHeadscaleUserOptions,
  normalizeOverview,
  normalizeTopology,
} from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';
import { useWebSocketConnection, useDeviceStatusUpdates, useMetricsUpdates } from '@/hooks/useWebSocket';
import { useState } from 'react';
import { useRequest } from 'ahooks';
import { Button, Card, Tag, Typography, message, theme } from 'antd';
import { ReloadOutlined, WifiOutlined, GlobalOutlined, TeamOutlined, DashboardOutlined, PercentageOutlined, CloudServerOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function Dashboard() {
  const t = useTranslation();
  const { token } = theme.useToken();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    onlineDevices: 0,
    totalDevices: 0,
    totalUsers: 0,
    dnsRecordCount: 0,
  });
  const [topologyData, setTopologyData] = useState<DashboardTopologyData | null>(null);

  const { isConnected } = useWebSocketConnection();
  
  // Real-time device status updates
  const deviceStatuses = useDeviceStatusUpdates((update) => {
    setTopologyData((prev) => {
      if (!prev) return prev;

      const result = applyRealtimeDeviceStatus(prev, update);
      setStats((currentStats) => ({
        ...currentStats,
        onlineDevices: result.onlineDevices,
      }));
      return result.topology;
    });
  });

  // Real-time metrics updates
  useMetricsUpdates((update) => {
    if (update.type === 'device_count') {
      setStats((prev) => ({
        ...prev,
        onlineDevices: update.data.online,
        totalDevices: update.data.total,
      }));
    }
  });

  const fetchDashboardData = async () => {
    // Fetch data from multiple APIs in parallel
    const [devicesRes, usersRes, topologyRes, overviewRes] = await Promise.allSettled([
      devicesAPI.list({ page: 1, pageSize: 1000 }),
      usersAPI.list({ page: 1, pageSize: 1000 }),
      dashboardAPI.getTopologyWithACL(),
      dashboardAPI.getOverview(),
    ]);

    // Process devices data for stats
    let onlineDevices = 0;
    let totalDevices = 0;
    let devices: DashboardTopologyData['devices'] = [];
    let users: DashboardTopologyData['users'] = [];
    let acl: DashboardTopologyData['acl'] = [];
    let policy: DashboardTopologyData['policy'] = undefined;
    let totalUsers = 0;
    let dnsRecordCount = 0;

    // Extract overview data if available
    if (overviewRes.status === 'fulfilled' && overviewRes.value) {
      const ov = normalizeOverview(overviewRes.value);
      dnsRecordCount = ov.dns_record_count;
    }

    // Prefer topology API data (has correct string IDs and proper structure)
    if (topologyRes.status === 'fulfilled' && topologyRes.value) {
      const topologyDataRes = normalizeTopology(topologyRes.value);

      // Use topology users data (IDs are already strings)
      if (topologyDataRes?.users?.length) {
        users = topologyDataRes.users;
        totalUsers = users.length;
      }

      // Use topology devices data (IDs are already strings)
      if (topologyDataRes?.devices?.length) {
        devices = topologyDataRes.devices;
        totalDevices = devices.length;
        onlineDevices = devices.filter((d) => d.online).length;
      }

      // Use topology ACL data
      acl = topologyDataRes?.acl || [];

      // Use policy data for advanced ACL parsing
      policy = topologyDataRes?.policy || undefined;
    } else {
      // Fallback: build from separate API responses
      if (devicesRes.status === 'fulfilled' && devicesRes.value) {
        const devicesData = normalizeDeviceListResponse(devicesRes.value);
        totalDevices = devicesData.list.length;
        onlineDevices = devicesData.list.filter((device) => device.online).length;
        devices = devicesData.list.map((device) => ({
          id: device.id,
          name: device.given_name || device.name || 'Unknown',
          user: device.user?.name || 'unknown',
          online: device.online,
          ipAddresses: device.ip_addresses,
          lastSeen: device.last_seen || new Date().toISOString(),
        }));
      }

      if (usersRes.status === 'fulfilled' && usersRes.value) {
        const normalizedUsers = normalizeHeadscaleUserOptions(usersRes.value);
        totalUsers = normalizedUsers.length;
        users = normalizedUsers.map((user) => ({
          id: user.id,
          name: user.name,
          deviceCount: devices.filter((device) => device.user === user.name).length,
        }));
      }
    }

    return {
      stats: {
        onlineDevices,
        totalDevices,
        totalUsers,
        dnsRecordCount,
      },
      topologyData: { users, devices, acl, policy },
    };
  };

  const { loading, refreshAsync } = useRequest(fetchDashboardData, {
    pollingInterval: 30000,
    onSuccess: (data) => {
      setStats(data.stats);
      setTopologyData(data.topologyData);
    },
    onError: (error: any) => {
      console.error('Failed to load dashboard data:', error);
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAsync();
      message.success(t.dashboard.dataRefreshed);
    } catch (error: any) {
      message.error(t.dashboard.loadFailed + (error.message || t.common.errors.unknownError));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>{t.dashboard.title}</Typography.Title>
            <Typography.Text type="secondary">{t.dashboard.description}</Typography.Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isConnected && (
              <Tag icon={<WifiOutlined />} color="success">{t.dashboard.realtime}</Tag>
            )}
            <Button icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh} loading={refreshing}>
              {t.dashboard.refresh}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: t.dashboard.onlineDevices, value: stats.onlineDevices, sub: t.dashboard.totalDevices.replace('{count}', String(stats.totalDevices)), icon: <DashboardOutlined style={{ fontSize: 28, color: '#1677ff' }} /> },
            { label: t.dashboard.totalDevicesLabel || '总设备', value: stats.totalDevices, sub: `${stats.onlineDevices} ${t.common.status.online}`, icon: <CloudServerOutlined style={{ fontSize: 28, color: '#722ed1' }} /> },
            { label: t.dashboard.totalUsers, value: stats.totalUsers, sub: t.dashboard.activeUsers, icon: <TeamOutlined style={{ fontSize: 28, color: '#52c41a' }} /> },
            { label: t.dashboard.onlineRate || '在线率', value: stats.totalDevices > 0 ? `${Math.round((stats.onlineDevices / stats.totalDevices) * 100)}%` : '0%', sub: `${stats.onlineDevices}/${stats.totalDevices}`, icon: <PercentageOutlined style={{ fontSize: 28, color: '#fa8c16' }} /> },
            { label: t.dashboard.dnsCount, value: stats.dnsRecordCount, sub: t.dashboard.dnsSubtitle, icon: <GlobalOutlined style={{ fontSize: 28, color: '#13c2c2' }} /> },
          ].map((stat, i) => (
            <Card key={i} size="small" style={{ padding: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{stat.label}</Text>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{stat.value}</div>
                  {stat.sub && <Text type="secondary" style={{ fontSize: 12 }}>{stat.sub}</Text>}
                </div>
                {stat.icon}
              </div>
            </Card>
          ))}
        </div>

        {/* Network Topology */}
        <div>
          <Typography.Title level={5} style={{ marginBottom: 16 }}>
            {t.dashboard.networkTopology}
          </Typography.Title>
          <NetworkTopology
            data={topologyData}
            deviceStatuses={deviceStatuses}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
