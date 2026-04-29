import type { DashboardStats, DashboardTopologyData } from '@/lib/dashboard';
import { CloudServerOutlined, DashboardOutlined, GlobalOutlined, PercentageOutlined, ReloadOutlined, TeamOutlined, WifiOutlined } from '@ant-design/icons';
import { useRequest } from 'ahooks';
import { Button, message, Tag, Typography } from 'antd';
import { useState } from 'react';
import { dashboardApi, deviceApi, headscaleUserApi } from '@/api';
import DashboardLayout from '@/components/DashboardLayout';
import NetworkTopology from '@/components/NetworkTopology';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { useDeviceStatusUpdates, useMetricsUpdates, useWebSocketConnection } from '@/hooks/useWebSocket';
import { useTranslation } from '@/i18n/index';
import {
  applyRealtimeDeviceStatus,

} from '@/lib/dashboard';
import {
  normalizeDeviceListResponse,
  normalizeHeadscaleUserOptions,
  normalizeOverview,
  normalizeTopology,
} from '@/lib/normalizers';

export default function Dashboard() {
  const t = useTranslation();
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
      if (!prev)
        return prev;

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
      deviceApi.list({ all: true }),
      headscaleUserApi.list({ all: true }),
      dashboardApi.getTopologyWithACL(),
      dashboardApi.getOverview(),
    ]);

    // Process devices data for stats
    let onlineDevices = 0;
    let totalDevices = 0;
    let devices: DashboardTopologyData['devices'] = [];
    let users: DashboardTopologyData['users'] = [];
    let acl: DashboardTopologyData['acl'] = [];
    let policy: DashboardTopologyData['policy'];
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

  const { refreshAsync } = useRequest(fetchDashboardData, {
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
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <Typography.Title level={4} className="m-0">{t.dashboard.title}</Typography.Title>
            <Typography.Text type="secondary">{t.dashboard.description}</Typography.Text>
          </div>
          <div className="flex items-center gap-3">
            {isConnected && (
              <Tag icon={<WifiOutlined />} color="success">{t.dashboard.realtime}</Tag>
            )}
            <Button data-tour-id="dashboard-refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh} loading={refreshing}>
              {t.dashboard.refresh}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div data-tour-id="dashboard-stats">
          <PageHeaderStatCards
            items={[
              { label: t.dashboard.onlineDevices, value: stats.onlineDevices, subText: t.dashboard.totalDevices.replace('{count}', String(stats.totalDevices)), icon: <DashboardOutlined className="stat-icon-primary" />, watermark: 'LIVE' },
              { label: t.dashboard.totalDevicesLabel || '总设备', value: stats.totalDevices, subText: `${stats.onlineDevices} ${t.common.status.online}`, icon: <CloudServerOutlined className="stat-icon-accent" />, watermark: 'ALL' },
              { label: t.dashboard.totalUsers, value: stats.totalUsers, subText: t.dashboard.activeUsers, icon: <TeamOutlined className="stat-icon-success" />, watermark: 'USR' },
              { label: t.dashboard.onlineRate || '在线率', value: stats.totalDevices > 0 ? `${Math.round((stats.onlineDevices / stats.totalDevices) * 100)}%` : '0%', subText: `${stats.onlineDevices}/${stats.totalDevices}`, icon: <PercentageOutlined className="stat-icon-warn" />, watermark: '%' },
              { label: t.dashboard.dnsCount, value: stats.dnsRecordCount, subText: t.dashboard.dnsSubtitle, icon: <GlobalOutlined className="stat-icon-cyan" />, watermark: 'DNS' },
            ]}
          />
        </div>

        {/* Network Topology */}
        <div data-tour-id="dashboard-topology">
          <Typography.Title level={5} className="mb-4">
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
