import {
  CheckCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Card, Input, Modal, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, message, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { panelSettingsApi, groupApi, headscaleConfigApi } from '@/api';
import api from '@/lib/request';
import type { HeadscaleConfig } from '@/api/headscale-config.types';
import { loadConnectionSettingsData, loadOIDCSettingsData } from '@/lib/page-data';
import { useRequest } from 'ahooks';
import {
  defaultOIDCFormValues,
  type OIDCFormValues,
} from '@/lib/normalizers';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import DerpManagement from '@/components/settings/DerpManagement';

const SETTINGS_TOUR_TAB_EVENT = 'guide-tour:settings-tab';

const { Title, Text } = Typography;

/* -- Helper Components -- */

function ArrayEditor({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const addItem = () => onChange([...value, '']);
  const removeItem = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const updateItem = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };

  return (
    <Space direction="vertical" className="w-full" size={8}>
      {value.map((item, i) => (
        <Space.Compact key={i} className="w-full">
          <Input
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button icon={<CloseOutlined />} onClick={() => removeItem(i)} />
        </Space.Compact>
      ))}
      <Button icon={<PlusOutlined />} size="small" onClick={addItem}>{placeholder || 'Add'}</Button>
    </Space>
  );
}

function SectionCard({ title, description, children, actions }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex justify-between items-start mb-4">
        <div>
          <Text strong className="text-15px">{title}</Text>
          {description && <div><Text type="secondary" className="text-13px">{description}</Text></div>}
        </div>
        {actions}
      </div>
      <Space direction="vertical" className="w-full" size={16}>
        {children}
      </Space>
    </Card>
  );
}

function FieldRow({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Text className="form-label">{label}</Text>
      {children}
      {description && <Text type="secondary" className="text-12px">{description}</Text>}
    </div>
  );
}

function SwitchRow({ label, description, checked, onCheckedChange }: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="form-setting-row">
      <div>
        <Text className="text-13px">{label}</Text>
        {description && <div><Text type="secondary" className="text-12px">{description}</Text></div>}
      </div>
      <Switch checked={checked} onChange={onCheckedChange} />
    </div>
  );
}

/* -- Main Component -- */

export default function Settings() {
  const t = useTranslation();
  const { token } = theme.useToken();
  const [connectionInitialized, setConnectionInitialized] = useState(false);
  const [configInitialized, setConfigInitialized] = useState(false);

  const [grpcAddr, setGrpcAddr] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [insecure, setInsecure] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const [oidcForm, setOidcForm] = useState<OIDCFormValues>(defaultOIDCFormValues);
  const [useBuiltinOidc, setUseBuiltinOidc] = useState(false);
  const [builtinOidcLoading, setBuiltinOidcLoading] = useState(false);

  const [previewCopied, setPreviewCopied] = useState(false);
  const [oidcYamlPreview, setOidcYamlPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [savingGrpc, setSavingGrpc] = useState(false);
  const [savingOidc, setSavingOidc] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState('grpc');

  // ── Headscale config state ──────────────────────────
  const [hsConfig, setHsConfig] = useState<HeadscaleConfig>({});
  const [savingHsConfig, setSavingHsConfig] = useState(false);

  const { loading: loadingHsConfig, refresh: refreshHsConfig } = useRequest(
    async () => headscaleConfigApi.get(),
    {
      onSuccess: (data) => setHsConfig(data ?? {}),
      onError: () => message.error(t.common.errors.requestFailed),
    },
  );

  const handleSaveHsConfig = async () => {
    setSavingHsConfig(true);
    try {
      await headscaleConfigApi.update(hsConfig);
      message.success(t.settings.hsconfig.saveSuccess);
    } catch (err: any) {
      message.error(err?.message || t.common.errors.requestFailed);
    } finally {
      setSavingHsConfig(false);
    }
  };

  // ── Group management state ───────────────────────────
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [groupForm, setGroupForm] = useState({ name: '', permission_ids: [] as number[] });
  const [savingGroup, setSavingGroup] = useState(false);

  const { data: groupsRawData, loading: loadingGroups, refresh: refreshGroups } = useRequest(
    () => groupApi.list({ all: true }),
    { onError: () => message.error(t.settings.groups.loadFailed) },
  );
  const groupRows: any[] = useMemo(() => (groupsRawData as any)?.list ?? groupsRawData ?? [], [groupsRawData]);

  const { data: allPermsData } = useRequest(
    () => groupApi.getPermissions(),
    { cacheKey: 'all-permissions' },
  );
  const allPermissions: { id: number; code: string; name: string }[] = useMemo(() => {
    const raw = Array.isArray(allPermsData) ? allPermsData : (allPermsData as any)?.list ?? [];
    return raw.map((p: any) => ({ id: p.ID ?? p.id, code: p.code, name: p.name || p.code }));
  }, [allPermsData]);

  const openCreateGroup = useCallback(() => {
    setEditingGroup(null);
    setGroupForm({ name: '', permission_ids: [] });
    setGroupModalOpen(true);
  }, []);

  const openEditGroup = useCallback((g: any) => {
    setEditingGroup(g);
    const perms = g.permissions ?? g.Permissions ?? [];
    setGroupForm({
      name: g.name ?? g.Name ?? '',
      permission_ids: perms.map((p: any) => p.ID ?? p.id),
    });
    setGroupModalOpen(true);
  }, []);

  const handleSaveGroup = useCallback(async () => {
    if (!groupForm.name.trim()) return;
    setSavingGroup(true);
    try {
      const gid = editingGroup?.ID ?? editingGroup?.id;
      if (editingGroup && gid) {
        await groupApi.update({ id: gid, name: groupForm.name.trim(), permission_ids: groupForm.permission_ids });
        message.success(t.settings.groups.updateSuccess);
      } else {
        await groupApi.create({ name: groupForm.name.trim(), permission_ids: groupForm.permission_ids });
        message.success(t.settings.groups.createSuccess);
      }
      setGroupModalOpen(false);
      refreshGroups();
    } catch (error: any) {
      message.error(error?.message || t.settings.groups.loadFailed);
    } finally {
      setSavingGroup(false);
    }
  }, [editingGroup, groupForm, t, refreshGroups]);

  const handleDeleteGroup = useCallback((g: any) => {
    const gid = g.ID ?? g.id;
    const gname = g.name ?? g.Name ?? '';
    Modal.confirm({
      title: t.settings.groups.deleteGroup,
      content: t.settings.groups.confirmDelete.replace('{name}', gname),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await groupApi.delete({ id: gid });
          message.success(t.settings.groups.deleteSuccess);
          refreshGroups();
        } catch (error: any) {
          message.error(error?.message || t.settings.groups.loadFailed);
        }
      },
    });
  }, [t, refreshGroups]);

  const groupColumns: ColumnsType<any> = [
    { title: t.settings.groups.groupName, key: 'name', render: (_: unknown, r: any) => <Tag icon={<TeamOutlined />}>{r.name ?? r.Name}</Tag> },
    { title: t.settings.groups.permissionCount, key: 'permCount', width: 100, align: 'center' as const, render: (_: unknown, r: any) => (r.permissions ?? r.Permissions ?? []).length },
    {
      title: t.settings.groups.actions,
      key: 'actions',
      width: 160,
      render: (_: unknown, r: any) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditGroup(r)}>{t.settings.groups.editGroup}</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteGroup(r)}>{t.settings.groups.deleteGroup}</Button>
        </Space>
      ),
    },
  ];

  const { loading: loadingConnection, refresh: refreshConnectionSettings } = useRequest(
    async () => loadConnectionSettingsData(),
    {
      onSuccess: (data) => {
        setConnectionInitialized(true);
        setGrpcAddr(data.grpc_addr);
        setInsecure(data.insecure);
        setHasApiKey(data.has_api_key);
        setIsConnected(data.is_connected);
        setApiKeyInput('');
        setShowApiKeyInput(false);
      },
      onError: () => {
        setConnectionInitialized(true);
        message.error(t.common.errors.requestFailed);
      },
    },
  );

  const { loading: loadingConfig } = useRequest(
    async () => loadOIDCSettingsData(),
    {
      onSuccess: (data) => {
        setConfigInitialized(true);
        setOidcForm(data.oidcForm);
      },
      onError: () => {
        setConfigInitialized(true);
        // Config may not exist yet
      },
    },
  );

  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (!oidcForm.enabled) {
      setOidcYamlPreview('');
      return;
    }
    previewTimerRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const mergedConfig = {
          ...hsConfig,
          oidc: {
            only_start_if_oidc_is_available: oidcForm.only_start_if_oidc_is_available,
            issuer: oidcForm.issuer,
            client_id: oidcForm.client_id,
            client_secret: oidcForm.client_secret,
            client_secret_path: oidcForm.client_secret_path,
            scope: oidcForm.scope.filter(Boolean),
            email_verified_required: oidcForm.email_verified_required,
            allowed_domains: oidcForm.allowed_domains.filter(Boolean),
            allowed_users: oidcForm.allowed_users.filter(Boolean),
            allowed_groups: oidcForm.allowed_groups.filter(Boolean),
            strip_email_domain: oidcForm.strip_email_domain,
            expiry: oidcForm.expiry,
            use_expiry_from_token: oidcForm.use_expiry_from_token,
            pkce: { enabled: oidcForm.pkce_enabled, method: oidcForm.pkce_method },
          },
        };
        const res = await headscaleConfigApi.preview(mergedConfig);
        setOidcYamlPreview((res as any)?.yaml ?? '');
      } catch {
        // silently ignore preview errors
      } finally {
        setPreviewLoading(false);
      }
    }, 500);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [oidcForm, hsConfig]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const effectiveAddr = grpcAddr.trim() || undefined;
      const effectiveKey = apiKeyInput.trim() || undefined;
      const data: any = await api.post('/setup/connectivity-check', {
        headscale_grpc_addr: effectiveAddr,
        api_key: effectiveKey,
        strict_api: !!effectiveKey,
        grpc_allow_insecure: insecure,
      });
      const allOk = data?.all_reachable === true;
      if (allOk) {
        message.success(t.settings.headscaleConnection.connectionTestDesc);
      } else {
        message.error(t.setupWelcome.toastConnectivityFailed);
      }
    } catch {
      message.error(t.common.errors.requestFailed);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveGrpc = async () => {
    if (!grpcAddr.trim()) {
      message.error(t.setupWelcome.toastGrpcRequired);
      return;
    }
    setSavingGrpc(true);
    try {
      await panelSettingsApi.saveConnection({
        grpc_addr: grpcAddr.trim(),
        api_key: apiKeyInput.trim() || undefined,
        insecure,
      });
      message.success(t.settings.toast.connectionSaved);
      setApiKeyInput('');
      setShowApiKeyInput(false);
      refreshConnectionSettings();
    } catch {
      message.error(t.common.errors.requestFailed);
    } finally {
      setSavingGrpc(false);
    }
  };

  const handleToggleBuiltinOidc = async (enabled: boolean) => {
    setUseBuiltinOidc(enabled);
    if (enabled) {
      setBuiltinOidcLoading(true);
      try {
        const data: any = await panelSettingsApi.enableBuiltinOIDC();
        if (data) {
          setOidcForm(prev => ({
            ...prev,
            enabled: true,
            issuer: data.issuer || '',
            client_id: data.client_id || '',
            client_secret: data.client_secret || '',
            scope: data.scope || ['openid', 'profile', 'email'],
          }));
          message.success(t.settings.toast.builtinOidcEnabled);
        }
      } catch {
        message.error(t.common.errors.requestFailed);
        setUseBuiltinOidc(false);
      } finally {
        setBuiltinOidcLoading(false);
      }
    }
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(oidcYamlPreview);
    setPreviewCopied(true);
    message.success(t.settings.oidcConfig.previewCopied);
    setTimeout(() => setPreviewCopied(false), 2000);
  };

  const handleSyncData = async () => {
    setSyncing(true);
    try {
      await panelSettingsApi.syncData();
      message.success(t.settings.toast.syncSuccess);
    } catch {
      message.error(t.settings.toast.syncFailed);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveOidc = async () => {
    setSavingOidc(true);
    try {
      await panelSettingsApi.saveOIDCSettings(oidcForm);
      message.success(t.settings.toast.oidcSettingsSaved);
    } catch {
      message.error(t.common.errors.requestFailed);
    } finally {
      setSavingOidc(false);
    }
  };

  useEffect(() => {
    const handleTourTabSwitch = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'grpc' || detail === 'oidc' || detail === 'groups') {
        setActiveTabKey(detail);
      }
    };

    window.addEventListener(SETTINGS_TOUR_TAB_EVENT, handleTourTabSwitch);
    return () => {
      window.removeEventListener(SETTINGS_TOUR_TAB_EVENT, handleTourTabSwitch);
    };
  }, []);

  const loading = loadingConnection || loadingConfig;
  const initialLoading = !connectionInitialized || !configInitialized;

  if (initialLoading && loading) {
    return (
      <DashboardLayout>
        <div className="centered-loading">
          <Spin indicator={<LoadingOutlined className="text-32px" />} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div>
          <Title level={4} className="m-0">{t.settings.title}</Title>
          <Text type="secondary" className="text-13px">{t.settings.description}</Text>
        </div>

        <Tabs
          activeKey={activeTabKey}
          onChange={setActiveTabKey}
          data-tour-id="settings-tabs"
          items={[
            {
              key: 'grpc',
              label: t.settings.tabs.headscale,
              children: (
                <Space direction="vertical" size={16} className="w-full">
                  <SectionCard
                    title={t.settings.headscaleConnection.title}
                    description={t.settings.headscaleConnection.description}
                    actions={
                      isConnected
                        ? <Tag icon={<CheckCircleOutlined />} color="success">{t.common.status.online}</Tag>
                        : <Tag color="error">{t.common.status.offline}</Tag>
                    }
                  >
                    <FieldRow label={t.settings.headscaleConnection.serverUrlLabel} description={t.settings.headscaleConnection.serverUrlDesc}>
                      <Input value={grpcAddr} onChange={(e) => setGrpcAddr(e.target.value)} placeholder="127.0.0.1:50443" />
                    </FieldRow>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <Text className="text-13px">{t.settings.headscaleConnection.apiKeyLabel}</Text>
                        <Space size={8}>
                          {hasApiKey && !showApiKeyInput && (
                            <Tag icon={<SafetyCertificateOutlined />} color="blue">{t.settings.headscaleConnection.apiKeyConfigured}</Tag>
                          )}
                          <Button type="text" size="small" icon={showApiKeyInput ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => setShowApiKeyInput(!showApiKeyInput)}>
                            {showApiKeyInput ? t.settings.headscaleConnection.hideApiKey : t.settings.headscaleConnection.changeApiKey}
                          </Button>
                        </Space>
                      </div>
                      {showApiKeyInput && (
                        <Input.Password
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          placeholder={hasApiKey ? t.settings.headscaleConnection.apiKeyKeepPlaceholder : t.settings.headscaleConnection.apiKeyPlaceholder}
                        />
                      )}
                      <Text type="secondary" className="text-12px">{t.settings.headscaleConnection.apiKeyDesc}</Text>
                    </div>

                    <SwitchRow
                      label={t.settings.headscaleConnection.skipTlsLabel}
                      description={t.settings.headscaleConnection.skipTlsDesc}
                      checked={insecure}
                      onCheckedChange={setInsecure}
                    />

                    <Space className="pt-2">
                      <Button onClick={handleTestConnection} loading={testingConnection}>
                        {t.settings.headscaleConnection.testConnection}
                      </Button>
                      <Button
                        type="primary"
                        onClick={handleSaveGrpc}
                        loading={savingGrpc}
                        icon={<SaveOutlined />}
                        data-tour-id="settings-grpc-save"
                      >
                        {t.settings.headscaleConnection.saveSettings}
                      </Button>
                    </Space>
                  </SectionCard>

                  <SectionCard title={t.settings.dataSync.title} description={t.settings.dataSync.description}>
                    <Button onClick={handleSyncData} loading={syncing} icon={<DatabaseOutlined />}>
                      {t.settings.dataSync.syncButton}
                    </Button>
                  </SectionCard>
                </Space>
              ),
            },
            {
              key: 'oidc',
              label: t.settings.tabs.oidc,
              children: (
                <Space direction="vertical" size={16} className="w-full">
                  <SectionCard title={t.settings.oidcConfig.title} description={t.settings.oidcConfig.description}>
                    <SwitchRow
                      label={t.settings.oidcConfig.enableOidc}
                      description={t.settings.oidcConfig.enableOidcDesc}
                      checked={oidcForm.enabled}
                      onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, enabled: v }))}
                    />
                    {oidcForm.enabled && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}`, marginTop: 8 }}>
                        <div>
                          <Text className="text-13px">{t.settings.oidcConfig.useBuiltinOidc}</Text>
                          <div><Text type="secondary" className="text-12px">{t.settings.oidcConfig.useBuiltinOidcDesc}</Text></div>
                        </div>
                        <Button
                          type={useBuiltinOidc ? 'primary' : 'default'}
                          size="small"
                          onClick={() => handleToggleBuiltinOidc(!useBuiltinOidc)}
                          loading={builtinOidcLoading}
                          icon={<SafetyCertificateOutlined />}
                        >
                          {useBuiltinOidc ? t.settings.oidcConfig.builtinOidcActive : t.settings.oidcConfig.enableBuiltinBtn}
                        </Button>
                      </div>
                    )}
                  </SectionCard>

                  {oidcForm.enabled && (
                    <div className="grid-2col">
                      <Card>
                        <Text strong className="section-title-block">{t.settings.oidcConfig.settingsTitle}</Text>
                        <Space direction="vertical" className="w-full" size={16}>
                          <FieldRow label={t.settings.oidcConfig.issuerLabel}>
                            <Input value={oidcForm.issuer} onChange={(e) => setOidcForm(prev => ({ ...prev, issuer: e.target.value }))} placeholder="https://auth.example.com" />
                          </FieldRow>
                          <FieldRow label={t.settings.oidcConfig.clientIdLabel}>
                            <Input value={oidcForm.client_id} onChange={(e) => setOidcForm(prev => ({ ...prev, client_id: e.target.value }))} placeholder="headscale" />
                          </FieldRow>
                          <FieldRow label={t.settings.oidcConfig.clientSecretLabel}>
                            <Input.Password value={oidcForm.client_secret} onChange={(e) => setOidcForm(prev => ({ ...prev, client_secret: e.target.value }))} placeholder="--------" />
                          </FieldRow>
                          <FieldRow label={t.settings.oidcConfig.clientSecretPathLabel} description={t.settings.oidcConfig.clientSecretPathDesc}>
                            <Input value={oidcForm.client_secret_path} onChange={(e) => setOidcForm(prev => ({ ...prev, client_secret_path: e.target.value }))} placeholder="/path/to/client_secret" />
                          </FieldRow>
                          <FieldRow label={t.settings.oidcConfig.scopeLabel} description={t.settings.oidcConfig.scopeDesc}>
                            <ArrayEditor value={oidcForm.scope} onChange={(v) => setOidcForm(prev => ({ ...prev, scope: v }))} placeholder="openid" />
                          </FieldRow>
                          <FieldRow label={t.settings.oidcConfig.expiryLabel} description={t.settings.oidcConfig.expiryDesc}>
                            <Input value={oidcForm.expiry} onChange={(e) => setOidcForm(prev => ({ ...prev, expiry: e.target.value }))} placeholder="180d" />
                          </FieldRow>

                          <SwitchRow label={t.settings.oidcConfig.onlyStartIfAvailable} checked={oidcForm.only_start_if_oidc_is_available} onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, only_start_if_oidc_is_available: v }))} />
                          <SwitchRow label={t.settings.oidcConfig.emailVerifiedRequired} checked={oidcForm.email_verified_required} onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, email_verified_required: v }))} />
                          <SwitchRow label={t.settings.oidcConfig.stripEmailDomain} checked={oidcForm.strip_email_domain} onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, strip_email_domain: v }))} />
                          <SwitchRow label={t.settings.oidcConfig.useExpiryFromToken} checked={oidcForm.use_expiry_from_token} onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, use_expiry_from_token: v }))} />
                          <SwitchRow label={t.settings.oidcConfig.pkceEnabled} description={t.settings.oidcConfig.pkceDesc} checked={oidcForm.pkce_enabled} onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, pkce_enabled: v }))} />

                          {oidcForm.pkce_enabled && (
                            <FieldRow label={t.settings.oidcConfig.pkceMethod}>
                              <Input value={oidcForm.pkce_method} onChange={(e) => setOidcForm(prev => ({ ...prev, pkce_method: e.target.value }))} placeholder="S256" />
                            </FieldRow>
                          )}

                          <FieldRow label={t.settings.oidcConfig.allowedDomainsLabel} description={t.settings.oidcConfig.allowedDomainsDesc}>
                            <ArrayEditor value={oidcForm.allowed_domains} onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_domains: v }))} placeholder="example.com" />
                          </FieldRow>
                          <FieldRow label={t.settings.oidcConfig.allowedUsersLabel} description={t.settings.oidcConfig.allowedUsersDesc}>
                            <ArrayEditor value={oidcForm.allowed_users} onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_users: v }))} placeholder="user@example.com" />
                          </FieldRow>
                          <FieldRow label={t.settings.oidcConfig.allowedGroupsLabel} description={t.settings.oidcConfig.allowedGroupsDesc}>
                            <ArrayEditor value={oidcForm.allowed_groups} onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_groups: v }))} placeholder="group-name" />
                          </FieldRow>

                          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16 }}>
                            <Button
                              type="primary"
                              block
                              onClick={handleSaveOidc}
                              loading={savingOidc}
                              icon={<SaveOutlined />}
                              data-tour-id="settings-oidc-save"
                            >
                              {t.settings.oidcConfig.saveOidcSettings}
                            </Button>
                          </div>
                        </Space>
                      </Card>

                      <Card style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
                        <div className="flex justify-between items-center mb-4">
                          <Space size={8}>
                            <Text strong className="text-15px">{t.settings.oidcConfig.previewTitle}</Text>
                            {previewLoading && <Spin indicator={<LoadingOutlined />} size="small" />}
                          </Space>
                          <Button type="text" size="small" icon={previewCopied ? <CheckOutlined /> : <CopyOutlined />} onClick={handleCopyPreview}>
                            {previewCopied ? t.settings.oidcConfig.previewCopied : t.settings.oidcConfig.copyPreview}
                          </Button>
                        </div>
                        <Text type="secondary" className="text-12px block mb-3">{t.settings.oidcConfig.previewDesc}</Text>
                        <pre style={{
                          background: token.colorBgLayout,
                          borderRadius: token.borderRadius,
                          padding: 16,
                          fontSize: 12,
                          fontFamily: 'var(--font-mono)',
                          maxHeight: 600,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {oidcYamlPreview || t.settings.oidcConfig.previewEmpty}
                        </pre>
                      </Card>
                    </div>
                  )}
                </Space>
              ),
            },
            {
              key: 'groups',
              label: t.settings.tabs.groups,
              children: (
                <Space direction="vertical" size={16} className="w-full">
                  <SectionCard
                    title={t.settings.groups.title}
                    description={t.settings.groups.description}
                    actions={
                      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreateGroup}>
                        {t.settings.groups.addGroup}
                      </Button>
                    }
                  >
                    <Table
                      rowKey={(r: any) => r.ID ?? r.id}
                      columns={groupColumns}
                      dataSource={groupRows}
                      loading={loadingGroups}
                      size="small"
                      pagination={false}
                      locale={{ emptyText: t.settings.groups.noGroups }}
                    />
                  </SectionCard>

                  {/* Group create/edit modal */}
                  <Modal
                    open={groupModalOpen}
                    title={editingGroup ? t.settings.groups.editGroup : t.settings.groups.addGroup}
                    onCancel={() => setGroupModalOpen(false)}
                    onOk={handleSaveGroup}
                    confirmLoading={savingGroup}
                    width={520}
                    destroyOnHidden
                  >
                    <Space direction="vertical" className="w-full" size={12}>
                      <FieldRow label={t.settings.groups.groupNameLabel}>
                        <Input
                          value={groupForm.name}
                          onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                          placeholder={t.settings.groups.groupNamePlaceholder}
                        />
                      </FieldRow>
                      <FieldRow label={t.settings.groups.permissionsLabel}>
                        <Select
                          mode="multiple"
                          value={groupForm.permission_ids}
                          onChange={(v) => setGroupForm({ ...groupForm, permission_ids: v })}
                          placeholder={t.settings.groups.permissionsPlaceholder}
                          style={{ width: '100%' }}
                          options={allPermissions.map((p) => ({ label: p.name || p.code, value: p.id }))}
                          filterOption={(input, option) =>
                            (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
                          }
                          maxTagCount="responsive"
                        />
                      </FieldRow>
                    </Space>
                  </Modal>
                </Space>
              ),
            },
            {
              key: 'hsconfig',
              label: t.settings.tabs.hsconfig,
              children: (
                <Space direction="vertical" size={16} className="w-full">
                  <SectionCard
                    title={t.settings.hsconfig.title}
                    description={t.settings.hsconfig.description}
                    actions={
                      <Button icon={<ReloadOutlined spin={loadingHsConfig} />} onClick={refreshHsConfig} />
                    }
                  >
                    <FieldRow label={t.settings.hsconfig.serverUrl}>
                      <Input value={hsConfig.server_url ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, server_url: e.target.value }))} placeholder="https://vpn.example.com" />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.listenAddr}>
                      <Input value={hsConfig.listen_addr ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, listen_addr: e.target.value }))} placeholder="0.0.0.0:8080" />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.metricsListenAddr}>
                      <Input value={hsConfig.metrics_listen_addr ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, metrics_listen_addr: e.target.value }))} placeholder="0.0.0.0:9090" />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.grpcListenAddr}>
                      <Input value={hsConfig.grpc_listen_addr ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, grpc_listen_addr: e.target.value }))} placeholder="0.0.0.0:50443" />
                    </FieldRow>
                    <SwitchRow label={t.settings.hsconfig.grpcAllowInsecure} checked={hsConfig.grpc_allow_insecure ?? false} onCheckedChange={(v) => setHsConfig(p => ({ ...p, grpc_allow_insecure: v }))} />
                    <FieldRow label={t.settings.hsconfig.privateKeyPath}>
                      <Input value={hsConfig.private_key_path ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, private_key_path: e.target.value }))} placeholder="/var/lib/headscale/private.key" />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.noisePrivateKeyPath}>
                      <Input value={hsConfig.noise?.private_key_path ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, noise: { ...p.noise, private_key_path: e.target.value } }))} placeholder="/var/lib/headscale/noise_private.key" />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.prefixesV4}>
                      <Input value={hsConfig.prefixes?.v4 ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, prefixes: { ...p.prefixes, v4: e.target.value } }))} placeholder="100.100.0.0/16" />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.prefixesAllocation}>
                      <Select value={hsConfig.prefixes?.allocation ?? 'sequential'} onChange={(v) => setHsConfig(p => ({ ...p, prefixes: { ...p.prefixes, allocation: v } }))} style={{ width: '100%' }} options={[{ label: 'sequential', value: 'sequential' }, { label: 'random', value: 'random' }]} />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.derpPaths}>
                      <ArrayEditor value={hsConfig.derp?.paths ?? []} onChange={(v) => setHsConfig(p => ({ ...p, derp: { ...p.derp, paths: v } }))} placeholder={t.settings.hsconfig.derpPathPlaceholder} />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.dbSqlitePath}>
                      <Input value={hsConfig.database?.sqlite?.path ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, database: { ...p.database, sqlite: { ...p.database?.sqlite, path: e.target.value } } }))} placeholder="/var/lib/headscale/db.sqlite" />
                    </FieldRow>
                    <SwitchRow label={t.settings.hsconfig.dbSqliteWal} checked={hsConfig.database?.sqlite?.write_ahead_log ?? true} onCheckedChange={(v) => setHsConfig(p => ({ ...p, database: { ...p.database, sqlite: { ...p.database?.sqlite, write_ahead_log: v } } }))} />
                    <FieldRow label={t.settings.hsconfig.dnsBaseDomain}>
                      <Input value={hsConfig.dns?.base_domain ?? ''} onChange={(e) => setHsConfig(p => ({ ...p, dns: { ...p.dns, base_domain: e.target.value } }))} placeholder="leviatan.vpn" />
                    </FieldRow>
                    <SwitchRow label={t.settings.hsconfig.dnsMagicDns} checked={hsConfig.dns?.magic_dns ?? true} onCheckedChange={(v) => setHsConfig(p => ({ ...p, dns: { ...p.dns, magic_dns: v } }))} />
                    <SwitchRow label={t.settings.hsconfig.dnsOverrideLocalDns} checked={hsConfig.dns?.override_local_dns ?? true} onCheckedChange={(v) => setHsConfig(p => ({ ...p, dns: { ...p.dns, override_local_dns: v } }))} />
                    <FieldRow label={t.settings.hsconfig.dnsNameservers}>
                      <ArrayEditor value={hsConfig.dns?.nameservers?.global ?? []} onChange={(v) => setHsConfig(p => ({ ...p, dns: { ...p.dns, nameservers: { ...p.dns?.nameservers, global: v } } }))} placeholder={t.settings.hsconfig.dnsNameserverPlaceholder} />
                    </FieldRow>
                    <FieldRow label={t.settings.hsconfig.policyMode}>
                      <Select value={hsConfig.policy?.mode ?? 'database'} onChange={(v) => setHsConfig(p => ({ ...p, policy: { mode: v } }))} style={{ width: '100%' }} options={[{ label: 'database', value: 'database' }, { label: 'file', value: 'file' }]} />
                    </FieldRow>
                    <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16 }}>
                      <Button type="primary" block onClick={handleSaveHsConfig} loading={savingHsConfig} icon={<SaveOutlined />}>
                        {t.settings.hsconfig.saveButton}
                      </Button>
                    </div>
                  </SectionCard>
                </Space>
              ),
            },
            {
              key: 'derp',
              label: t.settings.tabs.derp,
              children: (
                <SectionCard
                  title="DERP Map Management"
                  description="Configure custom DERP relay servers. Changes trigger a Headscale restart when DinD mode is enabled."
                >
                  <DerpManagement />
                </SectionCard>
              ),
            },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
