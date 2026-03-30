import {
  CheckCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DatabaseOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LoadingOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { Button, Card, Input, Space, Spin, Switch, Tabs, Tag, Typography, message, theme } from 'antd';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { panelSettingsAPI } from '@/lib/api';
import api from '@/lib/api';
import { loadConnectionSettingsData, loadOIDCSettingsData } from '@/lib/page-data';
import {
  defaultOIDCFormValues,
  type OIDCFormValues,
} from '@/lib/normalizers';
import { useState, useEffect, useCallback, useMemo } from 'react';

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
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      {value.map((item, i) => (
        <Space.Compact key={i} style={{ width: '100%' }}>
          <Input
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={placeholder}
            style={{ flex: 1 }}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 15 }}>{title}</Text>
          {description && <div><Text type="secondary" style={{ fontSize: 13 }}>{description}</Text></div>}
        </div>
        {actions}
      </div>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
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
      <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{label}</Text>
      {children}
      {description && <Text type="secondary" style={{ fontSize: 12 }}>{description}</Text>}
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <div>
        <Text style={{ fontSize: 13 }}>{label}</Text>
        {description && <div><Text type="secondary" style={{ fontSize: 12 }}>{description}</Text></div>}
      </div>
      <Switch checked={checked} onChange={onCheckedChange} />
    </div>
  );
}

/* -- Main Component -- */

export default function Settings() {
  const t = useTranslation();
  const { token } = theme.useToken();

  const [grpcAddr, setGrpcAddr] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [insecure, setInsecure] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const [oidcForm, setOidcForm] = useState<OIDCFormValues>(defaultOIDCFormValues);
  const [useBuiltinOidc, setUseBuiltinOidc] = useState(false);
  const [builtinOidcLoading, setBuiltinOidcLoading] = useState(false);

  const [loadingConnection, setLoadingConnection] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingGrpc, setSavingGrpc] = useState(false);
  const [savingOidc, setSavingOidc] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [previewCopied, setPreviewCopied] = useState(false);

  const loadConnectionSettings = useCallback(async () => {
    setLoadingConnection(true);
    try {
      const data = await loadConnectionSettingsData();
      setGrpcAddr(data.grpc_addr);
      setInsecure(data.insecure);
      setHasApiKey(data.has_api_key);
      setIsConnected(data.is_connected);
      setApiKeyInput('');
      setShowApiKeyInput(false);
    } catch {
      message.error(t.common.errors.requestFailed);
    } finally {
      setLoadingConnection(false);
    }
  }, [t]);

  const loadHeadscaleConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { oidcForm } = await loadOIDCSettingsData();
      setOidcForm(oidcForm);
    } catch {
      // Config may not exist yet
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConnectionSettings();
    loadHeadscaleConfig();
  }, [loadConnectionSettings, loadHeadscaleConfig]);

  const oidcYamlPreview = useMemo(() => {
    if (!oidcForm.enabled) return '';
    const lines: string[] = ['oidc:'];
    lines.push('  only_start_if_oidc_is_available: ' + oidcForm.only_start_if_oidc_is_available);
    lines.push('  issuer: "' + (oidcForm.issuer || 'https://sso.example.com') + '"');
    lines.push('  client_id: "' + (oidcForm.client_id || 'headscale') + '"');
    if (oidcForm.client_secret_path) {
      lines.push('  client_secret_path: "' + oidcForm.client_secret_path + '"');
    } else {
      const secret = oidcForm.client_secret === '******' ? '<your-secret>' : (oidcForm.client_secret || '<your-secret>');
      lines.push('  client_secret: "' + secret + '"');
    }
    if (oidcForm.scope.length > 0) {
      lines.push('  scope: [' + oidcForm.scope.filter(Boolean).map(s => '"' + s + '"').join(', ') + ']');
    }
    if (oidcForm.expiry) {
      lines.push('  expiry: "' + oidcForm.expiry + '"');
    }
    lines.push('  email_verified_required: ' + oidcForm.email_verified_required);
    lines.push('  strip_email_domain: ' + oidcForm.strip_email_domain);
    lines.push('  use_expiry_from_token: ' + oidcForm.use_expiry_from_token);
    if (oidcForm.allowed_domains.filter(Boolean).length > 0) {
      lines.push('  allowed_domains:');
      oidcForm.allowed_domains.filter(Boolean).forEach(d => lines.push('    - "' + d + '"'));
    }
    if (oidcForm.allowed_users.filter(Boolean).length > 0) {
      lines.push('  allowed_users:');
      oidcForm.allowed_users.filter(Boolean).forEach(u => lines.push('    - "' + u + '"'));
    }
    if (oidcForm.allowed_groups.filter(Boolean).length > 0) {
      lines.push('  allowed_groups:');
      oidcForm.allowed_groups.filter(Boolean).forEach(g => lines.push('    - "' + g + '"'));
    }
    lines.push('  pkce:');
    lines.push('    enabled: ' + oidcForm.pkce_enabled);
    lines.push('    method: ' + (oidcForm.pkce_method || 'S256'));
    return lines.join('\n');
  }, [oidcForm]);

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
      await panelSettingsAPI.saveConnection({
        grpc_addr: grpcAddr.trim(),
        api_key: apiKeyInput.trim() || undefined,
        insecure,
      });
      message.success(t.settings.toast.connectionSaved);
      setApiKeyInput('');
      setShowApiKeyInput(false);
      loadConnectionSettings();
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
        const data: any = await panelSettingsAPI.enableBuiltinOIDC();
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

  const handleSyncData = async () => {
    setSyncing(true);
    try {
      await panelSettingsAPI.syncData();
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
      await panelSettingsAPI.saveOIDCSettings(oidcForm);
      message.success(t.settings.toast.oidcSettingsSaved);
    } catch {
      message.error(t.common.errors.requestFailed);
    } finally {
      setSavingOidc(false);
    }
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(oidcYamlPreview);
    setPreviewCopied(true);
    message.success(t.settings.oidcConfig.previewCopied);
    setTimeout(() => setPreviewCopied(false), 2000);
  };

  const loading = loadingConnection || loadingConfig;

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{t.settings.title}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{t.settings.description}</Text>
        </div>

        <Tabs
          defaultActiveKey="grpc"
          items={[
            {
              key: 'grpc',
              label: t.settings.tabs.headscale,
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 13 }}>{t.settings.headscaleConnection.apiKeyLabel}</Text>
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
                      <Text type="secondary" style={{ fontSize: 12 }}>{t.settings.headscaleConnection.apiKeyDesc}</Text>
                    </div>

                    <SwitchRow
                      label={t.settings.headscaleConnection.skipTlsLabel}
                      description={t.settings.headscaleConnection.skipTlsDesc}
                      checked={insecure}
                      onCheckedChange={setInsecure}
                    />

                    <Space style={{ paddingTop: 8 }}>
                      <Button onClick={handleTestConnection} loading={testingConnection}>
                        {t.settings.headscaleConnection.testConnection}
                      </Button>
                      <Button type="primary" onClick={handleSaveGrpc} loading={savingGrpc} icon={<SaveOutlined />}>
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
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
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
                          <Text style={{ fontSize: 13 }}>{t.settings.oidcConfig.useBuiltinOidc}</Text>
                          <div><Text type="secondary" style={{ fontSize: 12 }}>{t.settings.oidcConfig.useBuiltinOidcDesc}</Text></div>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <Card>
                        <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 16 }}>{t.settings.oidcConfig.settingsTitle}</Text>
                        <Space direction="vertical" style={{ width: '100%' }} size={16}>
                          <FieldRow label={t.settings.oidcConfig.issuerLabel}>
                            <Input value={oidcForm.issuer} onChange={(e) => setOidcForm(prev => ({ ...prev, issuer: e.target.value }))} placeholder="https://sso.example.com" />
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
                            <Button type="primary" block onClick={handleSaveOidc} loading={savingOidc} icon={<SaveOutlined />}>
                              {t.settings.oidcConfig.saveOidcSettings}
                            </Button>
                          </div>
                        </Space>
                      </Card>

                      <Card style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <Text strong style={{ fontSize: 15 }}>{t.settings.oidcConfig.previewTitle}</Text>
                          <Button type="text" size="small" icon={previewCopied ? <CheckOutlined /> : <CopyOutlined />} onClick={handleCopyPreview}>
                            {previewCopied ? t.settings.oidcConfig.previewCopied : t.settings.oidcConfig.copyPreview}
                          </Button>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>{t.settings.oidcConfig.previewDesc}</Text>
                        <pre style={{
                          background: token.colorBgLayout,
                          borderRadius: token.borderRadius,
                          padding: 16,
                          fontSize: 12,
                          fontFamily: 'monospace',
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
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
