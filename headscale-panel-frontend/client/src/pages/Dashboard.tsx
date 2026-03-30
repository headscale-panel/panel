import DashboardLayout from '@/components/DashboardLayout';
import NetworkTopology from '@/components/NetworkTopology';
import StatCard from '@/components/StatCard';
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
import { useEffect, useState, useCallback } from 'react';
import { Button, Tag, Typography, message } from 'antd';
import { ReloadOutlined, WifiOutlined, GlobalOutlined, TeamOutlined, DashboardOutlined } from '@ant-design/icons';

export default function Dashboard() {
  const t = useTranslation();
  const [loading, setLoading] = useState(true);
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

  const loadData = useCallback(async (showToast = false) => {
    try {
      if (showToast) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

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

      setStats({
        onlineDevices,
        totalDevices,
        totalUsers,
        dnsRecordCount,
      });

      setTopologyData({ users, devices, acl, policy });

      if (showToast) {
        message.success(t.dashboard.dataRefreshed);
      }
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      if (showToast) {
        message.error(t.dashboard.loadFailed + (error.message || t.common.errors.unknownError));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(() => {
      loadData();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadData]);

  const handleRefresh = () => {
    loadData(true);
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          <StatCard
            title={t.dashboard.onlineDevices}
            value={stats.onlineDevices}
            icon={DashboardOutlined}
            subtitle={t.dashboard.totalDevices.replace('{count}', String(stats.totalDevices))}
          />
          <StatCard
            title={t.dashboard.totalUsers}
            value={stats.totalUsers}
            icon={TeamOutlined}
            subtitle={t.dashboard.activeUsers}
          />
          <StatCard
            title={t.dashboard.dnsCount}
            value={stats.dnsRecordCount}
            icon={GlobalOutlined}
            subtitle={t.dashboard.dnsSubtitle}
          />
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
