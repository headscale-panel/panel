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

import type { AccountIdentity, AccountNetworkBinding } from '@/api/account.types';
import type { Account, NetworkIdentity, Role } from '@/api/entities';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import {
  Button,
  Descriptions,
  Divider,
  Drawer,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useState } from 'react';
import { accountApi } from '@/api';
import { useTranslation } from '@/i18n/index';
import BindingTransfer from './BindingTransfer';

const { Text } = Typography;

interface Props {
  accountId: number | null;
  open: boolean;
  roles: Role[];
  identities: NetworkIdentity[];
  onClose: () => void;
  onRefreshList: () => void;
}

/**
 * Detail view for one panel account.
 *
 * The four tabs map onto the four things an account actually has: profile fields,
 * a role, credentials, and zero or more tailnet identities. Keeping credentials
 * and tailnet identities on separate tabs is the point — a password reset and an
 * identity binding are unrelated operations with different owners.
 */
export default function AccountDetailDrawer({
  accountId,
  open,
  roles,
  identities,
  onClose,
  onRefreshList,
}: Props) {
  const t = useTranslation();
  const pa = t.panelAccounts;
  const [activeTab, setActiveTab] = useState('basic');

  const [editingBasic, setEditingBasic] = useState(false);
  const [basicForm, setBasicForm] = useState<{
    email: string;
    display_name: string;
    role_id: number | undefined;
  }>({ email: '', display_name: '', role_id: undefined });
  const [savingBasic, setSavingBasic] = useState(false);

  const {
    data: detail,
    loading,
    run: loadDetail,
  } = useRequest(
    async () => {
      if (!accountId)
        return null;
      return accountApi.get({ id: accountId });
    },
    { refreshDeps: [accountId, open], ready: !!accountId && open },
  );

  const { data: bindings, run: loadBindings } = useRequest(
    async () => {
      if (!accountId)
        return [] as AccountNetworkBinding[];
      return accountApi.networkBindings({ id: accountId });
    },
    { refreshDeps: [accountId, open], ready: !!accountId && open },
  );

  const { data: ssoIdentities, run: loadIdentities } = useRequest(
    async () => {
      if (!accountId)
        return [] as AccountIdentity[];
      return accountApi.identities({ id: accountId });
    },
    { refreshDeps: [accountId, open], ready: !!accountId && open },
  );

  const refreshAll = useCallback(() => {
    loadDetail();
    loadBindings();
    loadIdentities();
    onRefreshList();
  }, [loadDetail, loadBindings, loadIdentities, onRefreshList]);

  const startEditBasic = useCallback((account: Account) => {
    setBasicForm({
      email: account.email || '',
      display_name: account.display_name || '',
      role_id: account.role_id,
    });
    setEditingBasic(true);
  }, []);

  const handleSaveBasic = useCallback(async () => {
    if (!detail)
      return;
    setSavingBasic(true);
    try {
      await accountApi.update({
        id: detail.id,
        email: basicForm.email || undefined,
        display_name: basicForm.display_name || undefined,
        role_id: basicForm.role_id,
      });
      message.success(pa.toast.updateSuccess);
      setEditingBasic(false);
      refreshAll();
    } catch (error: unknown) {
      message.error((error as Error)?.message || pa.toast.loadFailed);
    } finally {
      setSavingBasic(false);
    }
  }, [detail, basicForm, pa, refreshAll]);

  const handleToggleStatus = useCallback(() => {
    if (!detail)
      return;
    const disable = detail.status === 'active';
    const apply = async () => {
      try {
        await accountApi.setStatus({
          id: detail.id,
          status: disable ? 'disabled' : 'active',
        });
        message.success(disable ? pa.toast.disableSuccess : pa.toast.enableSuccess);
        refreshAll();
      } catch {
        message.error(pa.toast.loadFailed);
      }
    };

    if (disable) {
      Modal.confirm({
        title: pa.actions.disable,
        content: pa.confirm.disable.replace('{username}', detail.username),
        onOk: apply,
      });
      return;
    }
    void apply();
  }, [detail, pa, refreshAll]);

  const handleDelete = useCallback(() => {
    if (!detail)
      return;
    Modal.confirm({
      title: pa.actions.delete,
      content: pa.confirm.delete.replace('{username}', detail.username),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await accountApi.delete({ id: detail.id });
          message.success(pa.toast.deleteSuccess);
          onClose();
          onRefreshList();
        } catch {
          message.error(pa.toast.loadFailed);
        }
      },
    });
  }, [detail, pa, onClose, onRefreshList]);

  const handleUnlinkIdentity = useCallback(
    (identityId: number) => {
      if (!detail)
        return;
      Modal.confirm({
        title: pa.detail.login.oidcLogin,
        content: pa.detail.login.oidcNotBound,
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await accountApi.unlinkIdentity({ id: detail.id, identityId });
            message.success(pa.toast.updateSuccess);
            refreshAll();
          } catch (error: unknown) {
            message.error((error as Error)?.message || pa.toast.loadFailed);
          }
        },
      });
    },
    [detail, pa, refreshAll],
  );

  const renderBasic = (account: Account) => (
    <div>
      <div className="flex justify-end mb-12px">
        {editingBasic
          ? (
              <Space>
                <Button size="small" onClick={() => setEditingBasic(false)}>
                  {pa.detail.binding.cancelEdit}
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={savingBasic}
                  onClick={() => void handleSaveBasic()}
                >
                  {pa.detail.binding.saveBindings}
                </Button>
              </Space>
            )
          : (
              <Button size="small" icon={<EditOutlined />} onClick={() => startEditBasic(account)}>
                {pa.actions.edit}
              </Button>
            )}
      </div>

      {editingBasic
        ? (
            <Space direction="vertical" className="w-full" size={12}>
              <div>
                <Text className="block mb-4px">{pa.detail.basic.displayName}</Text>
                <Input
                  value={basicForm.display_name}
                  onChange={(e) => setBasicForm({ ...basicForm, display_name: e.target.value })}
                />
              </div>
              <div>
                <Text className="block mb-4px">{pa.detail.basic.email}</Text>
                <Input
                  value={basicForm.email}
                  onChange={(e) => setBasicForm({ ...basicForm, email: e.target.value })}
                />
              </div>
              <div>
                <Text className="block mb-4px">{pa.detail.role.currentGroup}</Text>
                <Select
                  value={basicForm.role_id}
                  onChange={(value) => setBasicForm({ ...basicForm, role_id: value })}
                  style={{ width: '100%' }}
                  options={roles.map((role) => ({ label: role.name, value: role.id }))}
                />
              </div>
            </Space>
          )
        : (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={pa.detail.basic.username}>{account.username}</Descriptions.Item>
              <Descriptions.Item label={pa.detail.basic.displayName}>
                {account.display_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={pa.detail.basic.email}>{account.email || '-'}</Descriptions.Item>
              <Descriptions.Item label={pa.detail.basic.status}>
                {account.status === 'active'
                  ? <Tag icon={<CheckCircleOutlined />} color="success">{pa.statusActive}</Tag>
                  : <Tag icon={<CloseCircleOutlined />} color="error">{pa.statusInactive}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label={pa.detail.basic.createdAt}>
                {account.created_at ? new Date(account.created_at).toLocaleString() : '-'}
              </Descriptions.Item>
            </Descriptions>
          )}
    </div>
  );

  const renderRole = (account: Account) => {
    const permissions = account.role?.permissions ?? [];
    return (
      <div>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={pa.detail.role.currentGroup}>
            {account.role?.name || pa.detail.role.noGroup}
          </Descriptions.Item>
        </Descriptions>
        <Divider />
        <Text strong>{pa.detail.role.permissions}</Text>
        {account.role?.is_system_admin
          ? <div className="mt-2"><Tag color="gold">*:*:*</Tag></div>
          : permissions.length === 0
            ? <div className="mt-2"><Text type="secondary">{pa.detail.role.noPermissions}</Text></div>
            : (
                <div className="mt-2 flex flex-wrap gap-1">
                  {permissions.map((perm) => (
                    <Tag key={perm.id}>{perm.code}</Tag>
                  ))}
                </div>
              )}
      </div>
    );
  };

  const renderLogin = (account: Account) => (
    <div>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={pa.detail.login.localPassword}>
          {account.must_change_password
            ? <Tag color="orange">{pa.detail.login.localEnabled}</Tag>
            : account.totp_enabled
              ? <Tag color="blue">{pa.detail.login.totpEnabled}</Tag>
              : <Tag>{pa.detail.login.totpDisabled}</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label={pa.detail.login.accountStatus}>
          <Button size="small" onClick={handleToggleStatus}>
            {account.status === 'active' ? pa.actions.disable : pa.actions.enable}
          </Button>
        </Descriptions.Item>
      </Descriptions>

      <Divider />
      <Text strong>{pa.detail.login.oidcLogin}</Text>
      {(ssoIdentities ?? []).length === 0
        ? <div className="mt-2"><Text type="secondary">{pa.detail.login.oidcNotBound}</Text></div>
        : (
            <Space direction="vertical" className="w-full mt-2" size={8}>
              {(ssoIdentities ?? []).map((identity) => (
                <div key={identity.id} className="flex items-center justify-between gap-2">
                  <div>
                    <Text className="text-13px">{identity.issuer}</Text>
                    <Text type="secondary" className="block text-12px">
                      {identity.email_at_link || identity.subject}
                    </Text>
                  </div>
                  <Button size="small" danger type="link" onClick={() => handleUnlinkIdentity(identity.id)}>
                    {pa.actions.delete}
                  </Button>
                </div>
              ))}
            </Space>
          )}

      <Divider />
      <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
        {pa.actions.delete}
      </Button>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      title={pa.detail.title}
      destroyOnHidden
    >
      {loading || !detail
        ? <div className="flex justify-center py-40px"><Spin /></div>
        : (
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                { key: 'basic', label: pa.detail.tabs.basic, children: renderBasic(detail) },
                { key: 'role', label: pa.detail.tabs.rolePermissions, children: renderRole(detail) },
                { key: 'login', label: pa.detail.tabs.loginIdentities, children: renderLogin(detail) },
                {
                  key: 'bindings',
                  label: pa.detail.tabs.networkBindings,
                  children: (
                    <BindingTransfer
                      accountId={detail.id}
                      bindings={bindings ?? []}
                      identities={identities}
                      onUpdated={refreshAll}
                    />
                  ),
                },
              ]}
            />
          )}
    </Drawer>
  );
}
