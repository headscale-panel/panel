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
import type { Device, NetworkIdentity } from '@/api/entities';
import {
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagsOutlined,
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
  Tooltip,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { accountApi, deviceApi, networkIdentityApi } from '@/api';
import DashboardLayout from '@/components/DashboardLayout';
import AddDeviceModal from '@/components/devices/AddDeviceModal';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { useTranslation } from '@/i18n/index';
import { hasPermission, PermissionCode } from '@/lib/permissions';
import { useAuthStore } from '@/lib/store';

const { Text } = Typography;

enum OriginFilterValue {
  All = 'all',
  Manual = 'manual',
  PanelIdP = 'panel_idp',
  ExternalIdP = 'external_idp',
}

enum BindingFilterValue {
  All = 'all',
  Bound = 'bound',
  Unbound = 'unbound',
}

/**
 * Network identities: how the tailnet sees a person.
 *
 * Two upstream facts shape this page and are surfaced rather than hidden:
 *
 *  - headscale reports tagged devices under a synthetic `tagged-devices` owner
 *    with no row in the user list. Applying a tag transfers ownership there, so
 *    tagged devices get their own bucket instead of a dangling username.
 *  - an identity may have no panel account (`manual` origin) or one bound to it.
 *    Both are normal states; neither is an error.
 */
export default function NetworkIdentities() {
  const t = useTranslation();
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<string>(OriginFilterValue.All);
  const [bindingFilter, setBindingFilter] = useState<BindingFilterValue>(BindingFilterValue.All);
  const [renaming, setRenaming] = useState<NetworkIdentity | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deviceOwner, setDeviceOwner] = useState<NetworkIdentity | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const canManageIdentities = hasPermission(user, PermissionCode.NetworkIdentityUpdate);
  const canDeleteIdentities = hasPermission(user, PermissionCode.NetworkIdentityDelete);
  const canCreateIdentities = hasPermission(user, PermissionCode.NetworkIdentityCreate);
  const canManageBindings = hasPermission(user, PermissionCode.NetworkBindingManage);
  const canCreateDevices = hasPermission(user, PermissionCode.NetworkDeviceCreate)
    || hasPermission(user, PermissionCode.NetworkDeviceCreateSelf);

  const { data: identities, loading, refresh } = useRequest(
    () => networkIdentityApi.list(),
    { onError: () => message.error(t.common.errors.requestFailed) },
  );

  const { data: devices } = useRequest(
    () => deviceApi.list().catch(() => [] as Device[]),
  );

  const { data: accounts } = useRequest(
    () => accountApi.list().catch(() => []),
  );

  const accountNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const account of accounts ?? [])
      map.set(account.id, account.username);
    return map;
  }, [accounts]);

  const devicesByOwner = useMemo(() => {
    const map = new Map<number, Device[]>();
    for (const device of devices ?? []) {
      const bucket = map.get(device.owner_hs_user_id) ?? [];
      bucket.push(device);
      map.set(device.owner_hs_user_id, bucket);
    }
    return map;
  }, [devices]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (identities ?? []).filter((identity) => {
      if (originFilter !== OriginFilterValue.All && identity.origin !== originFilter)
        return false;
      if (bindingFilter === BindingFilterValue.Bound && !identity.account_id)
        return false;
      if (bindingFilter === BindingFilterValue.Unbound && identity.account_id)
        return false;
      if (!query)
        return true;
      return [identity.name, identity.display_name, identity.email, identity.policy_username]
        .some((field) => (field ?? '').toLowerCase().includes(query));
    });
  }, [identities, searchQuery, originFilter, bindingFilter]);

  const taggedCount = (identities ?? []).filter((identity) => identity.tagged).length;
  const boundCount = (identities ?? []).filter((identity) => Boolean(identity.account_id)).length;

  const handleReconcile = async () => {
    try {
      const result = await networkIdentityApi.reconcile();
      message.success(
        t.networkIdentities.toast.reconcileSuccess.replace('{count}', String(result.bound?.length ?? 0)),
      );
      refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    }
  };

  const handleRename = async () => {
    if (!renaming)
      return;
    try {
      await networkIdentityApi.rename({ hsUserId: renaming.hs_user_id, name: renameValue.trim() });
      message.success(t.networkIdentities.toast.renameSuccess);
      setRenaming(null);
      refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    }
  };

  const handleDelete = (identity: NetworkIdentity) => {
    Modal.confirm({
      title: t.networkIdentities.modals.deleteTitle,
      content: identity.policy_username,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await networkIdentityApi.delete({ hsUserId: identity.hs_user_id });
          message.success(t.networkIdentities.toast.deleteSuccess);
          refresh();
        } catch (error: unknown) {
          // The backend refuses while devices are still attached and says so.
          message.error((error as Error)?.message || t.common.errors.requestFailed);
        }
      },
    });
  };

  const handleUnbind = async (identity: NetworkIdentity) => {
    try {
      await networkIdentityApi.unbind({ hsUserId: identity.hs_user_id });
      message.success(t.networkIdentities.toast.unbindSuccess);
      refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    }
  };

  const formatOriginLabel = (origin: string) => {
    switch (origin) {
      case OriginFilterValue.Manual:
        return t.networkIdentities.origins.manual;
      case OriginFilterValue.PanelIdP:
        return t.networkIdentities.origins.panelIdp;
      case OriginFilterValue.ExternalIdP:
        return t.networkIdentities.origins.externalIdp;
      default:
        return t.networkIdentities.origins.unknown;
    }
  };

  const columns: ColumnsType<NetworkIdentity> = [
    {
      title: t.networkIdentities.columns.name,
      key: 'name',
      render: (_: unknown, record) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Text strong>{record.name || t.networkIdentities.badges.unnamed}</Text>
            {record.tagged && <Tag color="purple">{t.networkIdentities.badges.tagged}</Tag>}
          </Space>
          {record.policy_username && record.policy_username !== record.name && (
            <Text type="secondary" className="text-12px">{record.policy_username}</Text>
          )}
        </Space>
      ),
    },
    {
      title: t.networkIdentities.columns.origin,
      dataIndex: 'origin',
      key: 'origin',
      width: 140,
      render: (value: string) => {
        const color = value === OriginFilterValue.PanelIdP
          ? 'green'
          : value === OriginFilterValue.ExternalIdP
            ? 'blue'
            : 'default';
        return <Tag color={color}>{formatOriginLabel(value)}</Tag>;
      },
    },
    {
      title: t.networkIdentities.columns.account,
      key: 'account',
      render: (_: unknown, record) =>
        record.account_id
          ? (
              <Space size={4}>
                <LinkOutlined />
                <Text>{accountNameById.get(record.account_id) ?? `#${record.account_id}`}</Text>
                {record.is_primary && <Tag color="gold">{t.networkIdentities.badges.primary}</Tag>}
              </Space>
            )
          : <Text type="secondary">{t.networkIdentities.badges.unbound}</Text>,
    },
    {
      title: t.networkIdentities.columns.devices,
      key: 'devices',
      width: 120,
      render: (_: unknown, record) =>
        record.device_count > 0
          ? (
              <Tag color="blue">
                {record.device_online}
                /
                {record.device_count}
              </Tag>
            )
          : <Text type="secondary">0</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_: unknown, record) => (
        <Space size={2}>
          {canCreateDevices && !record.tagged && (
            <Tooltip title={t.devices.addDeviceTitle}>
              <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => setDeviceOwner(record)} />
            </Tooltip>
          )}
          {canManageIdentities && (
            <Tooltip title={t.networkIdentities.modals.renameTitle}>
              <Button
                size="small"
                type="link"
                icon={<EditOutlined />}
                onClick={() => {
                  setRenaming(record);
                  setRenameValue(record.name);
                }}
              />
            </Tooltip>
          )}
          {canManageBindings && record.account_id && (
            <Tooltip title={t.networkIdentities.actions.unbind}>
              <Button size="small" type="link" icon={<TagsOutlined />} onClick={() => void handleUnbind(record)} />
            </Tooltip>
          )}
          {canDeleteIdentities && !record.tagged && (
            <Tooltip title={t.networkIdentities.modals.deleteTitle}>
              <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
            </Tooltip>
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
            { label: t.networkIdentities.stats.total, value: (identities ?? []).length },
            { label: t.networkIdentities.stats.bound, value: boundCount },
            { label: t.networkIdentities.stats.taggedOwner, value: taggedCount },
          ]}
        />

        <Card>
          <div className="flex flex-wrap gap-2 items-center justify-between mb-16px">
            <Space wrap>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.networkIdentities.filters.searchPlaceholder}
                style={{ width: 240 }}
              />
              <Select
                value={originFilter}
                onChange={setOriginFilter}
                style={{ width: 160 }}
                options={[
                  { label: t.networkIdentities.filters.allOrigins, value: OriginFilterValue.All },
                  { label: t.networkIdentities.origins.manual, value: OriginFilterValue.Manual },
                  { label: t.networkIdentities.origins.panelIdp, value: OriginFilterValue.PanelIdP },
                  { label: t.networkIdentities.origins.externalIdp, value: OriginFilterValue.ExternalIdP },
                ]}
              />
              <Select
                value={bindingFilter}
                onChange={setBindingFilter}
                style={{ width: 150 }}
                options={[
                  { label: t.networkIdentities.filters.allBindings, value: BindingFilterValue.All },
                  { label: t.networkIdentities.filters.bound, value: BindingFilterValue.Bound },
                  { label: t.networkIdentities.filters.unbound, value: BindingFilterValue.Unbound },
                ]}
              />
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={refresh} />
              <Tooltip title={t.networkIdentities.actions.reconcileTooltip}>
                <Button onClick={handleReconcile}>{t.networkIdentities.actions.reconcile}</Button>
              </Tooltip>
              {canCreateIdentities && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setNewName('');
                    setCreating(true);
                  }}
                >
                  {t.networkIdentities.actions.newIdentity}
                </Button>
              )}
            </Space>
          </div>

          {loading
            ? <div className="flex justify-center py-40px"><Spin /></div>
            : (
                <Table
                  rowKey="hs_user_id"
                  dataSource={filtered}
                  columns={columns}
                  size="middle"
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  expandable={{
                    expandedRowRender: (record) => {
                      const owned = devicesByOwner.get(record.hs_user_id) ?? [];
                      if (owned.length === 0)
                        return <Text type="secondary">{t.networkIdentities.noDevices}</Text>;
                      return (
                        <Space wrap>
                          {owned.map((device) => (
                            <Tag key={device.id} color={device.online ? 'green' : 'default'}>
                              {device.given_name || device.name}
                            </Tag>
                          ))}
                        </Space>
                      );
                    },
                  }}
                />
              )}
        </Card>
      </div>

      <Modal
        open={creating}
        title={t.networkIdentities.modals.createTitle}
        onCancel={() => setCreating(false)}
        onOk={async () => {
          const name = newName.trim();
          if (!name) {
            message.error(t.networkIdentities.toast.nameRequired);
            return;
          }
          try {
            await networkIdentityApi.create({ name });
            setCreating(false);
            refresh();
          } catch (error: unknown) {
            message.error((error as Error)?.message || t.common.errors.requestFailed);
          }
        }}
      >
        <Text type="secondary" className="block mb-8px">
          {t.networkIdentities.modals.createHint}
        </Text>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t.networkIdentities.modals.namePlaceholder}
        />
      </Modal>

      <Modal
        open={renaming !== null}
        title={t.networkIdentities.modals.renameTitle}
        onCancel={() => setRenaming(null)}
        onOk={() => void handleRename()}
      >
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
      </Modal>

      <AddDeviceModal
        open={deviceOwner !== null}
        ownerId={deviceOwner?.hs_user_id ?? 0}
        ownerName={deviceOwner?.display_name || deviceOwner?.name || ''}
        canCreatePreAuthKey={hasPermission(user, PermissionCode.NetworkKeyCreate) || hasPermission(user, PermissionCode.NetworkKeyCreateSelf)}
        canRegisterNode={hasPermission(user, PermissionCode.NetworkDeviceCreate) || hasPermission(user, PermissionCode.NetworkDeviceCreateSelf)}
        onCancel={() => setDeviceOwner(null)}
        onSuccess={() => {
          setDeviceOwner(null);
          refresh();
        }}
      />
    </DashboardLayout>
  );
}
