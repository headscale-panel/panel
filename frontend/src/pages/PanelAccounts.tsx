import { useMemo, useState } from 'react';
import {
  Button,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { panelAccountsAPI, groupsAPI } from '@/lib/api';
import type { PanelAccountListItem } from '@/api/panel-account.types';
import type { NormalizedGroup } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';
import AccountDetailDrawer from '@/components/panel-accounts/AccountDetailDrawer';
import CreateAccountModal from '@/components/panel-accounts/CreateAccountModal';

const { Title, Text } = Typography;

export default function PanelAccounts() {
  const t = useTranslation();
  const { token: themeToken } = theme.useToken();
  const pa = t.panelAccounts;

  // ── Filters ────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [groupFilter, setGroupFilter] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── Modals / Drawer ─────────────────────────────────────
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // ── Data loading ───────────────────────────────────────
  const {
    data: listData,
    loading: listLoading,
    run: loadList,
  } = useRequest(
    () =>
      panelAccountsAPI.list({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        group_id: groupFilter,
      }),
    {
      refreshDeps: [page, pageSize, search, statusFilter, groupFilter],
      debounceWait: 300,
      onError: () => message.error(pa.toast.loadFailed),
    },
  );

  const { data: groupsData } = useRequest(
    () => groupsAPI.list({ all: true }),
    { cacheKey: 'panel-account-groups' },
  );

  const groups: NormalizedGroup[] = useMemo(
    () => (groupsData as any)?.list ?? groupsData ?? [],
    [groupsData],
  );

  const list = listData?.list ?? [];
  const total = listData?.total ?? 0;

  const activeCount = useMemo(() => list.filter((a) => a.is_active).length, [list]);
  const disabledCount = useMemo(() => list.filter((a) => !a.is_active).length, [list]);

  // ── Table columns ──────────────────────────────────────
  const columns: ColumnsType<PanelAccountListItem> = [
    {
      title: pa.columns.username,
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: pa.columns.email,
      dataIndex: 'email',
      key: 'email',
      render: (v: string) => v || '-',
    },
    {
      title: pa.columns.status,
      dataIndex: 'is_active',
      key: 'status',
      width: 100,
      render: (active: boolean) =>
        active ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            {pa.statusActive}
          </Tag>
        ) : (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            {pa.statusInactive}
          </Tag>
        ),
    },
    {
      title: pa.columns.role,
      key: 'role',
      width: 140,
      render: (_: unknown, record: PanelAccountListItem) =>
        record.group ? (
          <Tag icon={<TeamOutlined />}>{record.group.name}</Tag>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: pa.columns.loginMethods,
      key: 'loginMethods',
      width: 180,
      render: (_: unknown, record: PanelAccountListItem) =>
        record.login_methods?.length ? (
          <Space size={4} wrap>
            {record.login_methods.map((m) => (
              <Tag key={m}>
                {(pa.loginMethod as Record<string, string>)[m] ?? m}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">{pa.loginMethod.none}</Text>
        ),
    },
    {
      title: pa.columns.networkBindingCount,
      dataIndex: 'network_binding_count',
      key: 'network_binding_count',
      width: 120,
      align: 'center',
      render: (count: number) => count ?? 0,
    },
    {
      title: pa.columns.actions,
      key: 'actions',
      width: 80,
      render: (_: unknown, record: PanelAccountListItem) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setDetailId(record.id)}
        >
          {pa.actions.viewDetail}
        </Button>
      ),
    },
  ];

  // ── Stat cards ─────────────────────────────────────────
  const statCards = [
    {
      label: pa.totalAccounts,
      value: total,
      icon: <UserOutlined style={{ fontSize: 28, opacity: 0.15 }} />,
    },
    {
      label: pa.activeAccounts,
      value: activeCount,
      icon: <CheckCircleOutlined style={{ fontSize: 28, opacity: 0.15 }} />,
      valueColor: themeToken.colorSuccess,
    },
    {
      label: pa.disabledAccounts,
      value: disabledCount,
      icon: <CloseCircleOutlined style={{ fontSize: 28, opacity: 0.15 }} />,
      valueColor: themeToken.colorError,
    },
  ];

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-16px">
        <div>
          <Title level={4} className="!mb-0">
            {pa.title}
          </Title>
          <Text type="secondary">{pa.description}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadList} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} data-tour-id="panel-accounts-create">
            {pa.newAccount}
          </Button>
        </Space>
      </div>

      {/* Stat cards */}
      <PageHeaderStatCards items={statCards} />

      {/* Filters */}
      <div className="flex items-center gap-12px mt-16px mb-12px flex-wrap" data-tour-id="panel-accounts-filters">
        <Input
          prefix={<SearchOutlined />}
          placeholder={pa.searchPlaceholder}
          allowClear
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ width: 260 }}
        />
        <Select
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          style={{ width: 130 }}
          options={[
            { label: pa.statusAll, value: '' },
            { label: pa.statusActive, value: 'active' },
            { label: pa.statusInactive, value: 'inactive' },
          ]}
        />
        <Select
          value={groupFilter}
          onChange={(v) => {
            setGroupFilter(v);
            setPage(1);
          }}
          allowClear
          placeholder={pa.filterRole}
          style={{ width: 160 }}
          options={groups.map((g) => ({ label: g.name, value: g.ID }))}
        />
      </div>

      {/* Table */}
      <div data-tour-id="panel-accounts-table">
        <Table<PanelAccountListItem>
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={listLoading}
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </div>

      {/* Detail Drawer */}
      <AccountDetailDrawer
        accountId={detailId}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        onRefreshList={loadList}
      />

      {/* Create Modal */}
      <CreateAccountModal
        open={createOpen}
        groups={groups}
        onCancel={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          loadList();
        }}
      />
    </DashboardLayout>
  );
}
