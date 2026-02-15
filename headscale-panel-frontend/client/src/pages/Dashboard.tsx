import DashboardLayout from '@/components/DashboardLayout';
import NetworkTopology from '@/components/NetworkTopology';
import StatCard from '@/components/StatCard';
import { dashboardAPI, devicesAPI, usersAPI } from '@/lib/api';
import { useTranslation } from '@/i18n/index';
import { useWebSocketConnection, useDeviceStatusUpdates, useMetricsUpdates } from '@/hooks/useWebSocket';
import { Activity, Users, Wifi, WifiOff, RefreshCw, Globe } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

interface DashboardStats {
  onlineDevices: number;
  totalDevices: number;
  totalUsers: number;
  dnsRecordCount: number;
}

interface TopologyData {
  users: Array<{
    id: string;
    name: string;
    deviceCount: number;
  }>;
  devices: Array<{
    id: string;
    name: string;
    user: string;
    online: boolean;
    ipAddresses: string[];
    lastSeen: string;
  }>;
  acl: Array<{
    src: string;
    dst: string;
    action: 'accept' | 'deny';
  }>;
  policy?: {
    groups?: Record<string, string[]>;
    hosts?: Record<string, string>;
  };
}

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
  const [topologyData, setTopologyData] = useState<TopologyData | null>(null);

  const { isConnected, reconnect } = useWebSocketConnection();
  
  // Real-time device status updates
  const deviceStatuses = useDeviceStatusUpdates((update) => {
    // Update stats when device status changes
    setStats((prev) => {
      const onlineChange = update.online ? 1 : -1;
      return {
        ...prev,
        onlineDevices: Math.max(0, prev.onlineDevices + onlineChange),
      };
    });
    
    setTopologyData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        devices: prev.devices.map((d) =>
          d.id === update.machineId
            ? { ...d, online: update.online, lastSeen: update.lastSeen, ipAddresses: update.ipAddresses }
            : d
        ),
      };
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
      let devices: TopologyData['devices'] = [];
      let users: TopologyData['users'] = [];
      let acl: TopologyData['acl'] = [];
      let policy: TopologyData['policy'] = undefined;
      let totalUsers = 0;
      let dnsRecordCount = 0;

      // Extract overview data if available
      if (overviewRes.status === 'fulfilled' && overviewRes.value) {
        const ov = overviewRes.value as any;
        dnsRecordCount = ov.dns_record_count || 0;
      }

      // Prefer topology API data (has correct string IDs and proper structure)
      if (topologyRes.status === 'fulfilled' && topologyRes.value) {
        const topologyDataRes = topologyRes.value as any;
        
        // Use topology users data (IDs are already strings)
        if (topologyDataRes.users && Array.isArray(topologyDataRes.users)) {
          users = topologyDataRes.users.map((u: any) => ({
            id: String(u.id),
            name: u.name,
            deviceCount: u.deviceCount || 0,
          }));
          totalUsers = users.length;
        }
        
        // Use topology devices data (IDs are already strings)
        if (topologyDataRes.devices && Array.isArray(topologyDataRes.devices)) {
          devices = topologyDataRes.devices.map((d: any) => ({
            id: String(d.id),
            name: d.name || 'Unknown',
            user: d.user || 'unknown',
            online: d.online || false,
            ipAddresses: d.ipAddresses || [],
            lastSeen: d.lastSeen || new Date().toISOString(),
          }));
          totalDevices = devices.length;
          onlineDevices = devices.filter((d) => d.online).length;
        }
        
        // Use topology ACL data
        acl = topologyDataRes.acl || [];
        
        // Use policy data for advanced ACL parsing
        policy = topologyDataRes.policy || undefined;
      } else {
        // Fallback: build from separate API responses
        if (devicesRes.status === 'fulfilled' && devicesRes.value) {
          const devicesData = devicesRes.value as any;
          const deviceList = devicesData.machines || devicesData.list || devicesData || [];
          totalDevices = Array.isArray(deviceList) ? deviceList.length : 0;
          onlineDevices = Array.isArray(deviceList) 
            ? deviceList.filter((d: any) => d.online).length 
            : 0;
          devices = Array.isArray(deviceList) 
            ? deviceList.map((d: any) => ({
                id: String(d.id || d.machineId),
                name: d.name || d.givenName || 'Unknown',
                user: d.user?.name || d.userName || 'unknown',
                online: d.online || false,
                ipAddresses: d.ipAddresses || [],
                lastSeen: d.lastSeen || new Date().toISOString(),
              }))
            : [];
        }

        if (usersRes.status === 'fulfilled' && usersRes.value) {
          const usersData = usersRes.value as any;
          const userList = usersData.users || usersData.list || usersData || [];
          totalUsers = Array.isArray(userList) ? userList.length : 0;
          users = Array.isArray(userList)
            ? userList.map((u: any) => ({
                id: String(u.id || u.name),
                name: u.name || u.username || 'Unknown',
                deviceCount: devices.filter((d) => d.user === (u.name || u.username)).length,
              }))
            : [];
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
        toast.success(t.dashboard.dataRefreshed);
      }
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      if (showToast) {
        toast.error(t.dashboard.loadFailed + (error.message || t.common.errors.unknownError));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
      <div className="space-y-6">
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-start"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.dashboard.title}</h1>
            <p className="text-muted-foreground mt-1">
              {t.dashboard.description}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* WebSocket Status */}
            <Badge 
              variant={isConnected ? 'default' : 'secondary'}
              className={`gap-1.5 ${isConnected ? 'bg-green-500/10 text-green-600 border-green-200' : 'bg-gray-100 text-gray-500'}`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  {t.dashboard.realtime}
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  {t.common.status.offline}
                </>
              )}
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {t.dashboard.refresh}
            </Button>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <StatCard
            title={t.dashboard.onlineDevices}
            value={stats.onlineDevices}
            icon={Activity}
            subtitle={t.dashboard.totalDevices.replace('{count}', String(stats.totalDevices))}
          />
          <StatCard 
            title={t.dashboard.totalUsers} 
            value={stats.totalUsers} 
            icon={Users}
            subtitle={t.dashboard.activeUsers}
          />
          <StatCard
            title={t.dashboard.dnsCount}
            value={stats.dnsRecordCount}
            icon={Globe}
            subtitle={t.dashboard.dnsSubtitle}
          />
        </motion.div>

        {/* Network Topology */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {t.dashboard.networkTopology}
          </h2>
          <NetworkTopology
            data={topologyData} 
            deviceStatuses={deviceStatuses}
          />
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
