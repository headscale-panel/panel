/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { ColumnsType } from 'antd/es/table';
import type { AccountNetworkBinding } from '@/api/account.types';
import type { Account, NetworkIdentity, Role } from '@/api/entities';
import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import {
  Button,
  Card,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { accountApi, networkIdentityApi, roleApi } from '@/api';
import AccountDetailDrawer from '@/components/accounts/AccountDetailDrawer';
import CreateAccountModal from '@/components/accounts/CreateAccountModal';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { useTranslation } from '@/i18n/index';
import { hasPermission, PermissionCode } from '@/lib/permissions';
import { useAuthStore } from '@/lib/store';

const { Text } = Typography;

/**
 * Panel accounts.
 *
 * This page is only about people who sign in to the panel. Their tailnet
 * identities live on the Network Identities page: an account can have none, and
 * a headscale user can have no account at all, so merging the two views is what
 * made the previous version impossible to reason about.
 */
export default function Accounts() {
  const t = useTranslation();
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [roleFilter, setRoleFilter] = useState<number | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const canCreate = hasPermission(user, PermissionCode.AccountCreate);
  const canDelete = hasPermission(user, PermissionCode.AccountDelete);

  const { data: accounts, loading, refresh } = useRequest(
    () => accountApi.list(),
    { onError: () => message.error(t.common.errors.requestFailed) },
  );

  const { data: roles } = useRequest(() => roleApi.list().catch(() => [] as Role[]));

  const { data: identities } = useRequest(
    () => networkIdentityApi.list().catch(() => [] as NetworkIdentity[]),
  );

  const { data: bindingsByAccount } = useRequest(
    async () => {
      const list = accounts ?? [];
      if (list.length === 0)
        return {} as Record<number, AccountNetworkBinding[]>;

      const pairs = await Promise.all(
        list.map(async (account) => {
          const bindings = await accountApi.networkBindings({ id: account.id }).catch(() => []);
          return [account.id, bindings] as const;
        }),
      );
      return Object.fromEntries(pairs) as Record<number, AccountNetworkBinding[]>;
    },
    { refreshDeps: [accounts] },
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (accounts ?? []).filter((account) => {
      if (statusFilter !== 'all' && account.status !== statusFilter)
        return false;
      if (roleFilter !== undefined && account.role_id !== roleFilter)
        return false;
      if (!query)
        return true;
      return [account.username, account.email, account.display_name]
        .some((field) => (field ?? '').toLowerCase().includes(query));
    });
  }, [accounts, searchQuery, statusFilter, roleFilter]);

  const activeCount = (accounts ?? []).filter((account) => account.status === 'active').length;
  const disabledCount = (accounts ?? []).length - activeCount;

  const handleDelete = (account: Account) => {
    Modal.confirm({
      title: t.panelAccounts.actions.delete,
      content: t.panelAccounts.confirm.delete.replace('{username}', account.username),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await accountApi.delete({ id: account.id });
          message.success(t.panelAccounts.toast.deleteSuccess);
          refresh();
        } catch {
          message.error(t.panelAccounts.toast.loadFailed);
        }
      },
    });
  };

  const columns: ColumnsType<Account> = [
    {
      title: t.panelAccounts.columns.username,
      dataIndex: 'username',
      key: 'username',
      render: (value: string, record) => (
        <Button type="link" className="p-0" onClick={() => setDetailId(record.id)}>
          {value}
        </Button>
      ),
    },
    {
      title: t.panelAccounts.columns.email,
      dataIndex: 'email',
      key: 'email',
      render: (value?: string) => value || '-',
    },
    {
      title: t.panelAccounts.columns.status,
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: string) =>
        value === 'active'
          ? <Tag color="success">{t.panelAccounts.statusActive}</Tag>
          : <Tag color="error">{t.panelAccounts.statusInactive}</Tag>,
    },
    {
      title: t.panelAccounts.columns.role,
      key: 'role',
      render: (_: unknown, record) => record.role?.name || '-',
    },
    {
      title: t.panelAccounts.columns.loginMethods,
      key: 'login',
      width: 160,
      render: (_: unknown, record) =>
        record.has_password
          ? <Tag color="orange">{t.panelAccounts.loginMethod.local}</Tag>
          : <Tag>{t.panelAccounts.loginMethod.oidc}</Tag>,
    },
    {
      title: t.panelAccounts.columns.networkBindingCount,
      key: 'bindings',
      width: 140,
      render: (_: unknown, record) => {
        const count = bindingsByAccount?.[record.id]?.length ?? 0;
        return count > 0 ? <Tag color="blue">{count}</Tag> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: t.panelAccounts.columns.actions,
      key: 'actions',
      width: 120,
      render: (_: unknown, record) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => setDetailId(record.id)}>
            {t.panelAccounts.actions.viewDetail}
          </Button>
          {canDelete && (
            <Button
              size="small"
              type="link"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            />
          )}
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-16px">
        <PageHeaderStatCards
          items={[
            { label: t.panelAccounts.totalAccounts, value: (accounts ?? []).length },
            { label: t.panelAccounts.activeAccounts, value: activeCount },
            { label: t.panelAccounts.disabledAccounts, value: disabledCount },
          ]}
        />

        <Card>
          <div className="flex flex-wrap gap-2 items-center justify-between mb-16px" data-tour-id="accounts-filters">
            <Space wrap>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.panelAccounts.searchPlaceholder}
                style={{ width: 240 }}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 130 }}
                options={[
                  { label: t.panelAccounts.statusAll, value: 'all' },
                  { label: t.panelAccounts.statusActive, value: 'active' },
                  { label: t.panelAccounts.statusInactive, value: 'disabled' },
                ]}
              />
              <Select
                allowClear
                value={roleFilter}
                onChange={setRoleFilter}
                placeholder={t.panelAccounts.filterRole}
                style={{ width: 170 }}
                options={(roles ?? []).map((role) => ({ label: role.name, value: role.id }))}
              />
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={refresh} />
              {canCreate && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  data-tour-id="accounts-create"
                  onClick={() => setCreateOpen(true)}
                >
                  {t.panelAccounts.newAccount}
                </Button>
              )}
            </Space>
          </div>

          {loading
            ? <div className="flex justify-center py-40px"><Spin /></div>
            : (
                <Table
                  rowKey="id"
                  dataSource={filtered}
                  columns={columns}
                  size="middle"
                  data-tour-id="accounts-table"
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                />
              )}
        </Card>
      </div>

      <CreateAccountModal
        open={createOpen}
        roles={roles ?? []}
        onCancel={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      <AccountDetailDrawer
        accountId={detailId}
        open={detailId !== null}
        roles={roles ?? []}
        identities={identities ?? []}
        onClose={() => setDetailId(null)}
        onRefreshList={refresh}
      />
    </DashboardLayout>
  );
}
