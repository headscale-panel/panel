import { useEffect, useState, useCallback } from 'react';
import {
  Button,
  Descriptions,
  Divider,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  SaveOutlined,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import { panelAccountsAPI, groupsAPI } from '@/lib/api';
import type {
  PanelAccountDetail,
} from '@/api/panel-account.types';
import type { NormalizedGroup } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';
import BindingTransfer from './BindingTransfer';

const { Text } = Typography;

interface Props {
  accountId: number | null;
  open: boolean;
  onClose: () => void;
  onRefreshList: () => void;
}

export default function AccountDetailDrawer({ accountId, open, onClose, onRefreshList }: Props) {
  const t = useTranslation();
  const pa = t.panelAccounts;
  const [activeTab, setActiveTab] = useState('basic');

  // ── Edit state ────────────────────────────────────────
  const [editingBasic, setEditingBasic] = useState(false);
  const [basicForm, setBasicForm] = useState({ email: '', display_name: '', password: '', group_id: undefined as number | undefined });
  const [savingBasic, setSavingBasic] = useState(false);

  const {
    data: detail,
    loading,
    run: loadDetail,
  } = useRequest(
    () => panelAccountsAPI.getDetail(accountId!),
    {
      manual: true,
      onError: () => message.error(pa.toast.loadFailed),
    },
  );

  const { data: groupsData } = useRequest(
    () => groupsAPI.list({ all: true }),
    { cacheKey: 'drawer-groups' },
  );
  const groups: NormalizedGroup[] = (groupsData as any)?.list ?? groupsData ?? [];

  useEffect(() => {
    if (open && accountId) {
      loadDetail();
      setActiveTab('basic');
      setEditingBasic(false);
    }
  }, [open, accountId]);

  const handleBindingsUpdated = useCallback(() => {
    loadDetail();
    onRefreshList();
  }, [loadDetail, onRefreshList]);

  // ── Basic edit handlers ───────────────────────────────
  const startEditBasic = useCallback((d: PanelAccountDetail) => {
    setBasicForm({
      email: d.email || '',
      display_name: d.display_name || '',
      password: '',
      group_id: d.group?.id,
    });
    setEditingBasic(true);
  }, []);

  const handleSaveBasic = useCallback(async () => {
    if (!detail) return;
    setSavingBasic(true);
    try {
      await panelAccountsAPI.update(detail.id, {
        email: basicForm.email || undefined,
        display_name: basicForm.display_name || undefined,
        password: basicForm.password || undefined,
        group_id: basicForm.group_id,
      });
      message.success(pa.toast.updateSuccess);
      setEditingBasic(false);
      loadDetail();
      onRefreshList();
    } catch (error: any) {
      message.error(error?.message || pa.toast.loadFailed);
    } finally {
      setSavingBasic(false);
    }
  }, [detail, basicForm, pa, loadDetail, onRefreshList]);

  // ── Toggle account status ─────────────────────────────
  const handleToggleStatus = useCallback(() => {
    if (!detail) return;
    const willDisable = detail.is_active;
    const doToggle = async () => {
      try {
        await panelAccountsAPI.setStatus(detail.id, { is_active: !detail.is_active });
        message.success(willDisable ? pa.toast.disableSuccess : pa.toast.enableSuccess);
        loadDetail();
        onRefreshList();
      } catch {
        message.error(pa.toast.loadFailed);
      }
    };
    if (willDisable) {
      Modal.confirm({
        title: pa.actions.disable,
        content: pa.confirm.disable.replace('{username}', detail.username),
        onOk: doToggle,
      });
    } else {
      doToggle();
    }
  }, [detail, pa, loadDetail, onRefreshList]);

  // ── Delete account ────────────────────────────────────
  const handleDelete = useCallback(() => {
    if (!detail) return;
    Modal.confirm({
      title: pa.actions.delete,
      content: pa.confirm.delete.replace('{username}', detail.username),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await panelAccountsAPI.delete(detail.id);
          message.success(pa.toast.deleteSuccess);
          onClose();
          onRefreshList();
        } catch {
          message.error(pa.toast.loadFailed);
        }
      },
    });
  }, [detail, pa, onClose, onRefreshList]);

  // ── Tab: Basic (read-only) ────────────────────────────
  const renderBasicReadOnly = (d: PanelAccountDetail) => (
    <div>
      <div className="flex justify-end mb-8px">
        <Button size="small" icon={<EditOutlined />} onClick={() => startEditBasic(d)}>
          {pa.actions.edit}
        </Button>
      </div>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label={pa.detail.basic.username}>{d.username}</Descriptions.Item>
        <Descriptions.Item label={pa.detail.basic.displayName}>{d.display_name || '-'}</Descriptions.Item>
        <Descriptions.Item label={pa.detail.basic.email}>{d.email || '-'}</Descriptions.Item>
        <Descriptions.Item label={pa.detail.basic.status}>
          {d.is_active ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>{pa.statusActive}</Tag>
          ) : (
            <Tag color="error" icon={<CloseCircleOutlined />}>{pa.statusInactive}</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label={pa.detail.role.currentGroup}>
          {d.group ? <Tag icon={<TeamOutlined />}>{d.group.name}</Tag> : <Text type="secondary">{pa.detail.role.noGroup}</Text>}
        </Descriptions.Item>
        <Descriptions.Item label={pa.detail.basic.createdAt}>{d.created_at}</Descriptions.Item>
        <Descriptions.Item label={pa.detail.basic.updatedAt}>{d.updated_at}</Descriptions.Item>
      </Descriptions>
    </div>
  );

  // ── Tab: Basic (editing) ──────────────────────────────
  const renderBasicEditing = () => (
    <div className="flex flex-col gap-12px">
      <div>
        <Text className="block mb-4px">{pa.detail.basic.email}</Text>
        <Input
          value={basicForm.email}
          onChange={(e) => setBasicForm({ ...basicForm, email: e.target.value })}
          placeholder={pa.create.emailPlaceholder}
        />
      </div>
      <div>
        <Text className="block mb-4px">{pa.detail.basic.displayName}</Text>
        <Input
          value={basicForm.display_name}
          onChange={(e) => setBasicForm({ ...basicForm, display_name: e.target.value })}
          placeholder={pa.create.displayNamePlaceholder}
        />
      </div>
      <div>
        <Text className="block mb-4px">{pa.edit.newPasswordLabel}</Text>
        <Input.Password
          value={basicForm.password}
          onChange={(e) => setBasicForm({ ...basicForm, password: e.target.value })}
          placeholder={pa.edit.newPasswordPlaceholder}
        />
      </div>
      <div>
        <Text className="block mb-4px">{pa.detail.role.currentGroup}</Text>
        <Select
          value={basicForm.group_id}
          onChange={(v) => setBasicForm({ ...basicForm, group_id: v })}
          placeholder={pa.create.groupPlaceholder}
          allowClear
          style={{ width: '100%' }}
          options={groups.map((g) => ({ label: g.name, value: g.ID }))}
        />
      </div>
      <Space className="mt-8px">
        <Button onClick={() => setEditingBasic(false)}>{t.common.actions.cancel}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={savingBasic} onClick={handleSaveBasic}>
          {t.common.actions.save}
        </Button>
      </Space>
    </div>
  );

  const renderBasicTab = (d: PanelAccountDetail) =>
    editingBasic ? renderBasicEditing() : renderBasicReadOnly(d);

  // ── Tab: Login Identities ──────────────────────────────
  const renderLoginTab = (d: PanelAccountDetail) => {
    const li = d.login_identities;
    if (!li) return <Text type="secondary">-</Text>;
    return (
      <div className="flex flex-col gap-16px">
        {/* Account status toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Text strong>{pa.detail.login.accountStatus}</Text>
            <div><Text type="secondary" className="text-12px">{pa.detail.login.accountStatusDesc}</Text></div>
          </div>
          <Switch
            checked={d.is_active}
            onChange={handleToggleStatus}
            checkedChildren={pa.statusActive}
            unCheckedChildren={pa.statusInactive}
          />
        </div>
        <Divider className="my-4px" />
        {/* Local */}
        <div>
          <Text strong>{pa.detail.login.localPassword}</Text>
          <Descriptions column={1} size="small" className="mt-8px" bordered>
            <Descriptions.Item label={pa.detail.login.localEnabled}>
              {li.local?.enabled ? (
                <Tag color="success">{pa.detail.login.localEnabled}</Tag>
              ) : (
                <Tag>{pa.detail.login.localDisabled}</Tag>
              )}
            </Descriptions.Item>
            {li.local?.enabled && (
              <>
                <Descriptions.Item label={pa.detail.login.hasPassword}>
                  {li.local.has_password ? pa.detail.login.hasPassword : pa.detail.login.noPassword}
                </Descriptions.Item>
                <Descriptions.Item label="TOTP">
                  <div className="flex items-center justify-between">
                    <span>{li.local.totp_enabled ? pa.detail.login.totpEnabled : pa.detail.login.totpDisabled}</span>
                    {li.local.totp_enabled && (
                      <Button
                        size="small"
                        danger
                        onClick={() => {
                          Modal.confirm({
                            title: pa.detail.login.resetTotp,
                            content: pa.detail.login.resetTotpConfirm,
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                await panelAccountsAPI.resetTOTP(d.id);
                                message.success(pa.detail.login.resetTotpSuccess);
                                loadDetail();
                              } catch {
                                message.error(pa.toast.loadFailed);
                              }
                            },
                          });
                        }}
                      >
                        {pa.detail.login.resetTotp}
                      </Button>
                    )}
                  </div>
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        </div>
        {/* OIDC */}
        <div>
          <Text strong>{pa.detail.login.oidcLogin}</Text>
          <Descriptions column={1} size="small" className="mt-8px" bordered>
            <Descriptions.Item label={pa.detail.login.oidcBound}>
              {li.oidc?.bound ? (
                <Tag color="success">{pa.detail.login.oidcBound}</Tag>
              ) : (
                <Tag>{pa.detail.login.oidcNotBound}</Tag>
              )}
            </Descriptions.Item>
            {li.oidc?.bound && (
              <>
                <Descriptions.Item label={pa.detail.login.oidcProvider}>
                  {li.oidc.provider || '-'}
                </Descriptions.Item>
                <Descriptions.Item label={pa.detail.login.oidcProviderId}>
                  {li.oidc.provider_id || '-'}
                </Descriptions.Item>
                <Descriptions.Item label={pa.detail.login.oidcEmail}>
                  {li.oidc.email || '-'}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        </div>
      </div>
    );
  };

  // ── Tab: Network Bindings ──────────────────────────────
  const renderBindingTab = (d: PanelAccountDetail) => (
    <BindingTransfer
      accountId={d.id}
      bindings={d.network_bindings ?? []}
      onUpdated={handleBindingsUpdated}
    />
  );

  const tabs = detail
    ? [
        { key: 'basic', label: pa.detail.tabs.basic, children: renderBasicTab(detail) },
        { key: 'loginIdentities', label: pa.detail.tabs.loginIdentities, children: renderLoginTab(detail) },
        { key: 'networkBindings', label: pa.detail.tabs.networkBindings, children: renderBindingTab(detail) },
      ]
    : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={detail ? `${pa.detail.title} - ${detail.username}` : pa.detail.title}
      width={640}
      destroyOnClose
      footer={
        detail ? (
          <div className="flex justify-between">
            <Button
              icon={detail.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
              onClick={handleToggleStatus}
            >
              {detail.is_active ? pa.actions.disable : pa.actions.enable}
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
              {pa.actions.delete}
            </Button>
          </div>
        ) : null
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-64px">
          <Spin indicator={<LoadingOutlined spin />} />
        </div>
      ) : detail ? (
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
      ) : null}
    </Drawer>
  );
}
