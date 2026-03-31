import { useEffect, useState, useCallback } from 'react';
import { useSearch } from 'wouter';
import { Button, Card, Input, Select, Switch, Table, Tag, Typography, Statistic, Tooltip, message, theme } from 'antd';
import { ReloadOutlined, SearchOutlined, LaptopOutlined, CheckCircleOutlined, CloseCircleOutlined, GlobalOutlined, NodeIndexOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DashboardLayout from '@/components/DashboardLayout';
import { routesAPI } from '@/lib/api';
import { useTranslation } from '@/i18n/index';

const { Title, Text } = Typography;

interface Route {
  id: string;
  machine_id: number;
  machine_name: string;
  user_name: string;
  destination: string;
  enabled: boolean;
  advertised: boolean;
  is_exit_node: boolean;
}

const isExitNode = (destination: string) => {
  return destination === '::/0' || destination === '0.0.0.0/0';
};

export default function Routes() {
  const t = useTranslation();
  const search = useSearch();
  const { token: themeToken } = theme.useToken();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(search);
    return params.get('user') || '';
  });
  const [filterDevice, setFilterDevice] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const routeListRes: any = await routesAPI.list({ page: 1, pageSize: 1000 });
      if (routeListRes?.list) {
        setRoutes(routeListRes.list);
      } else if (Array.isArray(routeListRes)) {
        setRoutes(routeListRes);
      }
    } catch (error) {
      console.error('Failed to load routes:', error);
      message.error(t.routes.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (route: Route) => {
    try {
      if (route.enabled) {
        await routesAPI.disable(route.machine_id, route.destination);
      } else {
        await routesAPI.enable(route.machine_id, route.destination);
      }
      const isExit = isExitNode(route.destination);
      message.success(isExit ? (route.enabled ? t.routes.exitNodeDisabled : t.routes.exitNodeEnabled) : (route.enabled ? t.routes.routeDisabled : t.routes.routeEnabled));
      loadData();
    } catch (error: any) {
      message.error(error.message || t.common.errors.operationFailed);
    }
  };

  const devices = Array.from(new Set(routes.map(r => r.machine_name))).sort();

  const filteredRoutes = routes.filter(route => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = (
        route.destination.toLowerCase().includes(q) ||
        route.machine_name.toLowerCase().includes(q) ||
        (route.user_name && route.user_name.toLowerCase().includes(q))
      );
      if (!matchesSearch) return false;
    }
    if (filterDevice !== 'all' && route.machine_name !== filterDevice) return false;
    if (filterStatus === 'enabled' && !route.enabled) return false;
    if (filterStatus === 'disabled' && route.enabled) return false;
    return true;
  });

  const stats = {
    total: routes.length,
    enabled: routes.filter(r => r.enabled).length,
    disabled: routes.filter(r => !r.enabled).length,
    exitNodes: Math.floor(routes.filter(r => isExitNode(r.destination)).length / 2),
  };

  const columns: ColumnsType<Route> = [
    {
      title: t.routes.routePrefix,
      dataIndex: 'destination',
      key: 'destination',
      render: (dest: string) => (
        <Tag style={{ fontFamily: 'monospace' }}>{dest}</Tag>
      ),
    },
    {
      title: t.routes.publishUser,
      dataIndex: 'user_name',
      key: 'user_name',
      render: (name: string) => (
        <span><UserOutlined style={{ marginRight: 6, color: themeToken.colorTextSecondary }} />{name || '-'}</span>
      ),
    },
    {
      title: t.routes.device,
      dataIndex: 'machine_name',
      key: 'machine_name',
      render: (name: string) => (
        <span><LaptopOutlined style={{ marginRight: 6, color: themeToken.colorTextSecondary }} />{name}</span>
      ),
    },
    {
      title: t.routes.status,
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => enabled
        ? <Tag icon={<CheckCircleOutlined />} color="success">{t.routes.enabled}</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="default">{t.routes.disabled}</Tag>,
    },
    {
      title: t.routes.actions,
      key: 'actions',
      align: 'right',
      render: (_: any, route: Route) => (
        <Switch checked={route.enabled} onChange={() => handleToggle(route)} size="small" />
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{t.routes.title}</Title>
            <Text type="secondary">{t.routes.description}</Text>
          </div>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={loadData} loading={loading}>
            {t.common.actions.refresh}
          </Button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          <Card hoverable><Statistic title={t.routes.totalRoutes} value={stats.total} prefix={<NodeIndexOutlined />} /></Card>
          <Card hoverable><Statistic title={t.routes.enabled} value={stats.enabled} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card>
          <Card hoverable><Statistic title={t.routes.disabled} value={stats.disabled} prefix={<CloseCircleOutlined />} /></Card>
          <Card hoverable><Statistic title="Exit Nodes" value={stats.exitNodes} valueStyle={{ color: '#722ed1' }} prefix={<GlobalOutlined />} /></Card>
        </div>

        {/* Table Card */}
        <Card>
          {/* Filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <Input
              placeholder={t.routes.searchPlaceholder}
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
              allowClear
            />
            <Select value={filterDevice} onChange={setFilterDevice} style={{ width: 180 }}
              options={[
                { value: 'all', label: t.routes.allDevices },
                ...devices.map(d => ({ value: d, label: d })),
              ]}
            />
            <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 150 }}
              options={[
                { value: 'all', label: t.routes.allStatus },
                { value: 'enabled', label: t.routes.enabled },
                { value: 'disabled', label: t.routes.disabled },
              ]}
            />
          </div>

          <Table
            columns={columns}
            dataSource={filteredRoutes}
            rowKey="id"
            loading={loading}
            pagination={false}
            locale={{
              emptyText: routes.length === 0 ? t.routes.noRoutes : t.routes.noMatch,
            }}
          />
        </Card>
      </div>
    </DashboardLayout>
  );
}
