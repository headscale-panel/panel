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

import type { IdPState, PanelSSOSettings } from '@/api/panel-settings.types';
import {
  CheckCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import { Alert, Button, Card, Input, message, Select, Space, Spin, Switch, Tabs, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { connectionApi, idpApi, panelSSOApi, roleApi } from '@/api';
import DashboardLayout from '@/components/DashboardLayout';
import DerpManagement from '@/components/settings/DerpManagement';
import HeadscaleConfigPanel from '@/components/settings/HeadscaleConfigPanel';
import { useTranslation } from '@/i18n/index';

const SETTINGS_TOUR_TAB_EVENT = 'guide-tour:settings-tab';

const { Text } = Typography;

/* -- Helper Components -- */

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

/** Human-readable explanation for each connection state. */
const CONN_STATE_HINTS: Record<string, string> = {
  unreachable: 'The panel could not open a TCP connection. Check the address and any firewall in between.',
  tls_error: 'The TLS handshake failed. Toggle "skip verification" only for a self-signed test setup, or paste the CA certificate.',
  unauthorized: 'The API key was rejected. Mint a new one with "headscale apikeys create".',
  version_mismatch: 'This headscale is older than 0.30 and does not expose the API this panel needs.',
};

/**
 * Deployment settings.
 *
 * Four separate trust relationships, deliberately not merged:
 *
 *  - how the panel reaches headscale (connection);
 *  - how headscale authenticates its users (the panel IdP);
 *  - how people sign in to the panel (panel SSO);
 *  - the headscale config file itself, plus DERP.
 *
 * They have different failure modes, so they get different tabs and different
 * diagnostics.
 */
export default function Settings() {
  const t = useTranslation();
  const [activeTabKey, setActiveTabKey] = useState('connection');

  /* -- connection -- */
  const [apiAddr, setApiAddr] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [insecure, setInsecure] = useState(false);
  const [tlsSkipVerify, setTlsSkipVerify] = useState(false);
  const [tlsCACert, setTlsCACert] = useState('');
  const [useCACert, setUseCACert] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ state: string; detail?: string; commit?: string } | null>(null);

  const { loading: loadingConnection } = useRequest(
    () => connectionApi.get(),
    {
      onSuccess: (data) => {
        setApiAddr(data.api_addr ?? '');
        setInsecure(data.insecure);
        setTlsSkipVerify(data.tls_skip_verify ?? false);
        setTlsCACert(data.tls_ca_cert ?? '');
        setUseCACert(Boolean(data.tls_ca_cert));
        setHasApiKey(data.has_api_key);
        setIsConfigured(data.is_configured);
      },
    },
  );

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const result = await connectionApi.test({
        api_addr: apiAddr.trim() || undefined,
        api_key: apiKeyInput.trim() || undefined,
        insecure,
        tls_skip_verify: tlsSkipVerify,
        tls_ca_cert: useCACert && !tlsSkipVerify ? tlsCACert.trim() : undefined,
      });
      setTestResult(result);
      if (result.state === 'ok')
        message.success(t.settings.headscaleConnection.connectionTestDesc);
      else
        message.error(t.setupWelcome.toastConnectivityFailed);
    } catch {
      message.error(t.common.errors.requestFailed);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveConnection = async () => {
    if (!apiAddr.trim()) {
      message.error(t.setupWelcome.toastApiAddrRequired);
      return;
    }
    setSavingConnection(true);
    try {
      await connectionApi.save({
        api_addr: apiAddr.trim(),
        api_key: apiKeyInput.trim() || undefined,
        insecure,
        tls_skip_verify: tlsSkipVerify,
        tls_ca_cert: useCACert && !tlsSkipVerify ? tlsCACert.trim() : undefined,
      });
      message.success(t.settings.toast.connectionSaved);
      setApiKeyInput('');
      setShowApiKeyInput(false);
      setHasApiKey(true);
      setIsConfigured(true);
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    } finally {
      setSavingConnection(false);
    }
  };

  /* -- panel IdP -- */
  const [idpState, setIdpState] = useState<IdPState | null>(null);
  const [savingIdp, setSavingIdp] = useState(false);

  const { loading: loadingIdp, refresh: refreshIdp } = useRequest(
    () => idpApi.state(),
    { onSuccess: (data) => setIdpState(data) },
  );

  const handleToggleIdp = async (enabled: boolean) => {
    setSavingIdp(true);
    try {
      const next = await idpApi.setEnabled({ enabled });
      setIdpState((prev) => (prev ? { ...prev, ...next } : next));
      refreshIdp();
      message.success(t.settings.toast.saved);
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    } finally {
      setSavingIdp(false);
    }
  };

  /* -- panel SSO -- */
  const [ssoForm, setSsoForm] = useState<PanelSSOSettings | null>(null);
  const [ssoSecret, setSsoSecret] = useState('');
  const [savingSso, setSavingSso] = useState(false);

  const { data: roles } = useRequest(
    () => roleApi.list().catch(() => []),
  );

  useRequest(
    () => panelSSOApi.get(),
    { onSuccess: (data) => setSsoForm(data) },
  );

  const handleSaveSso = async () => {
    if (!ssoForm)
      return;
    setSavingSso(true);
    try {
      const next = await panelSSOApi.save({
        enabled: ssoForm.enabled,
        issuer: ssoForm.issuer,
        client_id: ssoForm.client_id,
        client_secret: ssoSecret || undefined,
        scopes: ssoForm.scopes ?? ['openid', 'profile', 'email'],
        email_verified_required: ssoForm.email_verified_required,
        // Sent as typed: the backend refuses an unset mode on purpose.
        provisioning: ssoForm.provisioning as 'disabled' | 'jit',
        default_role_id: ssoForm.default_role_id,
      });
      setSsoForm(next);
      setSsoSecret('');
      message.success(t.settings.toast.saved);
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    } finally {
      setSavingSso(false);
    }
  };

  /* -- headscale config file is rendered by HeadscaleConfigPanel -- */

  useEffect(() => {
    const handleTourTabSwitch = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (['connection', 'idp', 'sso', 'hsconfig', 'derp'].includes(detail))
        setActiveTabKey(detail);
    };
    window.addEventListener(SETTINGS_TOUR_TAB_EVENT, handleTourTabSwitch);
    return () => window.removeEventListener(SETTINGS_TOUR_TAB_EVENT, handleTourTabSwitch);
  }, []);

  const loading = loadingConnection || loadingIdp;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-60px"><Spin size="large" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl">
        <Tabs
          activeKey={activeTabKey}
          onChange={setActiveTabKey}
          data-tour-id="settings-tabs"
          items={[
            /* ── connection ─────────────────────────────── */
            {
              key: 'connection',
              label: t.settings.tabs.headscale,
              children: (
                <Space direction="vertical" size={16} className="w-full">
                  <SectionCard
                    title={t.settings.headscaleConnection.title}
                    description={t.settings.headscaleConnection.description}
                    actions={
                      isConfigured
                        ? <Tag icon={<CheckCircleOutlined />} color="success">{t.common.status.online}</Tag>
                        : <Tag color="error">{t.common.status.offline}</Tag>
                    }
                  >
                    <FieldRow label={t.settings.headscaleConnection.serverUrlLabel} description={t.settings.headscaleConnection.serverUrlDesc}>
                      <Input
                        value={apiAddr}
                        onChange={(e) => setApiAddr(e.target.value)}
                        placeholder="http://127.0.0.1:8080"
                      />
                    </FieldRow>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <Text className="text-13px">{t.settings.headscaleConnection.apiKeyLabel}</Text>
                        <Button size="small" type="link" onClick={() => setShowApiKeyInput((v) => !v)}>
                          {showApiKeyInput ? t.settings.headscaleConnection.hideApiKey : t.settings.headscaleConnection.changeApiKey}
                        </Button>
                      </div>
                      {hasApiKey && !showApiKeyInput
                        ? <Text type="secondary" className="text-12px">{t.settings.headscaleConnection.apiKeyConfigured}</Text>
                        : (
                            <Input.Password
                              value={apiKeyInput}
                              onChange={(e) => setApiKeyInput(e.target.value)}
                              placeholder={t.settings.headscaleConnection.apiKeyPlaceholder}
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
                    <SwitchRow
                      label={t.settings.headscaleConnection.tlsSkipVerifyLabel}
                      description={t.settings.headscaleConnection.tlsSkipVerifyDesc}
                      checked={tlsSkipVerify}
                      onCheckedChange={setTlsSkipVerify}
                    />
                    <SwitchRow
                      label={t.settings.headscaleConnection.useCaCertLabel}
                      checked={useCACert}
                      onCheckedChange={setUseCACert}
                    />
                    {useCACert && !tlsSkipVerify && (
                      <FieldRow label={t.settings.headscaleConnection.caCertLabel}>
                        <Input.TextArea
                          value={tlsCACert}
                          onChange={(e) => setTlsCACert(e.target.value)}
                          rows={4}
                          placeholder="-----BEGIN CERTIFICATE-----"
                        />
                      </FieldRow>
                    )}

                    {testResult && testResult.state !== 'ok' && (
                      <Alert
                        type="warning"
                        showIcon
                        message={testResult.state}
                        description={CONN_STATE_HINTS[testResult.state] ?? testResult.detail}
                      />
                    )}
                    {testResult?.state === 'ok' && (
                      <Alert
                        type="success"
                        showIcon
                        message={t.settings.headscaleConnection.connectionTestDesc}
                        description={testResult.commit ? `commit ${testResult.commit.slice(0, 12)}` : undefined}
                      />
                    )}

                    <div className="flex gap-2">
                      <Button onClick={handleTestConnection} loading={testingConnection}>
                        {t.settings.headscaleConnection.testConnection}
                      </Button>
                      <Button type="primary" onClick={handleSaveConnection} loading={savingConnection} icon={<SaveOutlined />}>
                        {t.settings.headscaleConnection.saveSettings}
                      </Button>
                    </div>
                  </SectionCard>
                </Space>
              ),
            },

            /* ── panel IdP ──────────────────────────────── */
            {
              key: 'idp',
              label: t.settingsExtra.idp.tabLabel,
              children: (
                <SectionCard
                  title={t.settingsExtra.idp.title}
                  description={t.settingsExtra.idp.description}
                  actions={
                    idpState?.enabled
                      ? <Tag color="success">{t.common.status.enabled}</Tag>
                      : <Tag>{t.common.status.disabled}</Tag>
                  }
                >
                  {!idpState?.configured && (
                    <Alert
                      type="warning"
                      showIcon
                      message={t.settingsExtra.idp.baseUrlRequired}
                    />
                  )}

                  <FieldRow label={t.settingsExtra.idp.issuer}>
                    <Input value={idpState?.issuer ?? ''} readOnly />
                  </FieldRow>
                  <FieldRow label={t.settingsExtra.idp.clientId}>
                    <Input value={idpState?.client_id ?? ''} readOnly />
                  </FieldRow>
                  <FieldRow
                    label={t.settingsExtra.idp.redirectUri}
                    description={t.settingsExtra.idp.redirectUriHint}
                  >
                    <Input value={idpState?.redirect_uri ?? ''} readOnly />
                  </FieldRow>

                  <SwitchRow
                    label={t.settingsExtra.idp.enableLabel}
                    description={t.settingsExtra.idp.enableHint}
                    checked={Boolean(idpState?.enabled)}
                    onCheckedChange={(v) => void handleToggleIdp(v)}
                  />
                  {savingIdp && <Spin size="small" />}

                  <Button icon={<ReloadOutlined />} onClick={refreshIdp} size="small">
                    {t.common.actions.refresh}
                  </Button>
                </SectionCard>
              ),
            },

            /* ── panel SSO ──────────────────────────────── */
            {
              key: 'sso',
              label: t.settings.tabs.oidc,
              children: (
                <SectionCard
                  title={t.settings.tabs.oidc}
                  description={t.settingsExtra.panelSso.description}
                >
                  {ssoForm && (
                    <>
                      <SwitchRow
                        label={t.common.status.enabled}
                        checked={ssoForm.enabled}
                        onCheckedChange={(v) => setSsoForm({ ...ssoForm, enabled: v })}
                      />
                      <FieldRow label={t.settingsExtra.panelSso.issuer}>
                        <Input
                          value={ssoForm.issuer}
                          onChange={(e) => setSsoForm({ ...ssoForm, issuer: e.target.value })}
                          placeholder="https://accounts.example.com"
                        />
                      </FieldRow>
                      <FieldRow label={t.settingsExtra.panelSso.clientId}>
                        <Input
                          value={ssoForm.client_id}
                          onChange={(e) => setSsoForm({ ...ssoForm, client_id: e.target.value })}
                        />
                      </FieldRow>
                      <FieldRow
                        label={t.settingsExtra.panelSso.clientSecret}
                        description={ssoForm.has_client_secret ? t.settingsExtra.panelSso.clientSecretStoredHint : undefined}
                      >
                        <Input.Password
                          value={ssoSecret}
                          onChange={(e) => setSsoSecret(e.target.value)}
                        />
                      </FieldRow>
                      <SwitchRow
                        label={t.settingsExtra.panelSso.requireVerifiedEmail}
                        description={t.settingsExtra.panelSso.requireVerifiedEmailHint}
                        checked={ssoForm.email_verified_required}
                        onCheckedChange={(v) => setSsoForm({ ...ssoForm, email_verified_required: v })}
                      />
                      <FieldRow
                        label={t.settingsExtra.panelSso.provisioning}
                        description={t.settingsExtra.panelSso.provisioningHint}
                      >
                        <Select
                          value={ssoForm.provisioning || undefined}
                          onChange={(v) => setSsoForm({ ...ssoForm, provisioning: v })}
                          placeholder={t.settingsExtra.panelSso.provisioningPlaceholder}
                          style={{ width: '100%' }}
                          options={[
                            { label: t.settingsExtra.panelSso.provisioningDisabled, value: 'disabled' },
                            { label: t.settingsExtra.panelSso.provisioningJit, value: 'jit' },
                          ]}
                        />
                      </FieldRow>
                      {ssoForm.provisioning === 'jit' && (
                        <FieldRow label={t.settingsExtra.panelSso.defaultRole}>
                          <Select
                            value={ssoForm.default_role_id || undefined}
                            onChange={(v) => setSsoForm({ ...ssoForm, default_role_id: v })}
                            style={{ width: '100%' }}
                            options={(roles ?? []).map((role) => ({ label: role.name, value: role.id }))}
                          />
                        </FieldRow>
                      )}

                      <Button type="primary" onClick={handleSaveSso} loading={savingSso} icon={<SaveOutlined />} block>
                        {t.common.actions.save}
                      </Button>
                    </>
                  )}
                </SectionCard>
              ),
            },

            /* ── headscale config file ──────────────────── */
            {
              key: 'hsconfig',
              label: t.settings.tabs.hsconfig,
              children: <HeadscaleConfigPanel message={message} />,
            },

            /* ── DERP ───────────────────────────────────── */
            {
              key: 'derp',
              label: t.settings.tabs.derp,
              children: (
                <SectionCard
                  title={t.settingsExtra.derp.title}
                  description={t.settingsExtra.derp.description}
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
