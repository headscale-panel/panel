import { useState } from 'react';
import { useRequest } from 'ahooks';
import { useSearch } from 'wouter';
import { Button, Card, Input, Select, Switch, Table, Tag, Typography, Tooltip, message, theme } from 'antd';
import { ReloadOutlined, SearchOutlined, LaptopOutlined, CheckCircleOutlined, CloseCircleOutlined, GlobalOutlined, NodeIndexOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
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
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(search);
    return params.get('user') || '';
  });
  const [filterDevice, setFilterDevice] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { data: listData, loading, refresh } = useRequest(
    async () => routesAPI.list({ all: true }),
    {
      onError: (error: any) => {
        message.error(t.routes.loadFailed);
      },
    },
  );

  const routes: Route[] = (Array.isArray(listData) ? listData : listData?.list || []) as any;

  const handleToggle = async (route: Route) => {
    try {
      if (route.enabled) {
        await routesAPI.disable(route.machine_id, route.destination);
      } else {
        await routesAPI.enable(route.machine_id, route.destination);
      }
      const isExit = isExitNode(route.destination);
      message.success(isExit ? (route.enabled ? t.routes.exitNodeDisabled : t.routes.exitNodeEnabled) : (route.enabled ? t.routes.routeDisabled : t.routes.routeEnabled));
      refresh();
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
        <Tag className="mono-text">{dest}</Tag>
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
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="page-header-row">
          <div>
            <Title level={4} className="m-0">{t.routes.title}</Title>
            <Text type="secondary">{t.routes.description}</Text>
          </div>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={refresh} loading={loading}>
            {t.common.actions.refresh}
          </Button>
        </div>

        {/* Stats */}
        <PageHeaderStatCards
          minCardWidth={200}
          gap={16}
          items={[
            { label: t.routes.totalRoutes, value: stats.total, icon: <NodeIndexOutlined className="stat-icon-primary" />, watermark: 'ALL' },
            { label: t.routes.enabled, value: stats.enabled, icon: <CheckCircleOutlined className="stat-icon-success" />, watermark: 'ON' },
            { label: t.routes.disabled, value: stats.disabled, icon: <CloseCircleOutlined className="stat-icon-muted" />, watermark: 'OFF' },
            { label: 'Exit Nodes', value: stats.exitNodes, icon: <GlobalOutlined className="stat-icon-accent" />, watermark: 'EXIT' },
          ]}
        />

        {/* Table Card */}
        <Card data-tour-id="routes-table">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4" data-tour-id="routes-filters">
            <Input
              placeholder={t.routes.searchPlaceholder}
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-200px max-w-90"
              allowClear
            />
            <Select value={filterDevice} onChange={setFilterDevice} className="w-45"
              options={[
                { value: 'all', label: t.routes.allDevices },
                ...devices.map(d => ({ value: d, label: d })),
              ]}
            />
            <Select value={filterStatus} onChange={setFilterStatus} className="w-150px"
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
            pagination={{
              defaultPageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (t) => `${t} records`,
            }}
            locale={{
              emptyText: routes.length === 0 ? t.routes.noRoutes : t.routes.noMatch,
            }}
          />
        </Card>
      </div>
    </DashboardLayout>
  );
}
