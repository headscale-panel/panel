import { Alert, Card, Input, Button, Switch, Steps, Typography, Spin, Space, Descriptions, message, theme } from 'antd';
import { SafetyCertificateOutlined, GlobalOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, ArrowRightOutlined, SmileOutlined } from '@ant-design/icons';
import { useTranslation, useI18n, availableLocales, locales } from '@/i18n/index';
import api from '@/lib/api';
import { useState } from 'react';
import { useRequest } from 'ahooks';
import { useLocation } from 'wouter';

const { Title, Text, Paragraph } = Typography;

type SetupStep = 'connection' | 'admin' | 'done';

interface ConnectivityResult {
  name: string;
  address?: string;
  reachable: boolean;
  detail: string;
}

const stepIndex = { connection: 0, admin: 1, done: 2 };

export default function SetupWelcome() {
  const t = useTranslation();
  const { locale, setLocale } = useI18n();
  const [, setLocation] = useLocation();
  const { token: themeToken } = theme.useToken();
  const successColor = themeToken.colorSuccess;
  const errorColor = themeToken.colorError;

  const [step, setStep] = useState<SetupStep>('connection');

  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [initToken, setInitToken] = useState('');
  const [setupWindowOpen, setSetupWindowOpen] = useState(true);
  const [setupWindowDeadline, setSetupWindowDeadline] = useState('');

  const [grpcAddr, setGrpcAddr] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [enableTLS, setEnableTLS] = useState(false);
  const [connectResults, setConnectResults] = useState<ConnectivityResult[]>([]);
  const [connectPassed, setConnectPassed] = useState(false);

  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const [doneUsername, setDoneUsername] = useState('');
  const [donePassword, setDonePassword] = useState('');

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (bootstrapToken.trim()) headers['X-Setup-Bootstrap-Token'] = bootstrapToken.trim();
    if (initToken.trim()) headers['X-Setup-Init-Token'] = initToken.trim();
    return headers;
  };

  const applyStatusData = (data: any) => {
    if (data?.initialized) { setLocation('/login'); return; }
    setBootstrapConfigured(!!data?.bootstrap_configured);
    setSetupWindowOpen(data?.setup_window_open !== false);
    setSetupWindowDeadline(data?.setup_window_deadline || '');
    setInitToken(data?.init_token || '');
    if (data?.setup_window_open === false) {
      setConnectPassed(false);
    }
  };

  const { loading, refreshAsync: refreshStatus } = useRequest(
    async () => api.get('/setup/status', {
      headers: bootstrapToken.trim() ? { 'X-Setup-Bootstrap-Token': bootstrapToken.trim() } : {},
    }),
    {
      onSuccess: (data: any) => {
        applyStatusData(data);
      },
      onError: () => {
        message.error(t.setupWelcome.toastStatusLoadFailed);
      },
    },
  );

  const { runAsync: checkConnectivity, loading: checking } = useRequest(
    async () => api.post('/setup/connectivity-check', {
      headscale_grpc_addr: grpcAddr.trim(),
      api_key: apiKey.trim(),
      strict_api: true,
      grpc_allow_insecure: !enableTLS,
    }, { headers: buildHeaders() }),
    {
      manual: true,
      onSuccess: async (data: any) => {
        const checks: ConnectivityResult[] = data?.checks || [];
        setConnectResults(checks);
        const allOk = data?.all_reachable === true;
        setConnectPassed(allOk);

        if (allOk) {
          message.success(t.setupWelcome.toastConnectivitySuccess);
          try { await refreshStatus(); } catch {}
        } else {
          message.error(t.setupWelcome.toastConnectivityFailed);
        }
      },
      onError: () => {
        message.error(t.setupWelcome.toastConnectivityCheckError);
      },
    },
  );

  const { runAsync: initializeSetup, loading: initializing } = useRequest(
    async () => api.post('/setup/init', {
      headscale_grpc_addr: grpcAddr.trim(),
      api_key: apiKey.trim(),
      enable_tls: enableTLS,
      username: adminUsername.trim(),
      password: adminPassword,
      email: adminEmail.trim(),
    }, { headers: buildHeaders() }),
    {
      manual: true,
      onSuccess: (data: any) => {
        setDoneUsername(data?.user?.username || adminUsername);
        setDonePassword(data?.password_generated ? (data?.generated_password || '') : adminPassword);
        setStep('done');
        message.success(t.setupWelcome.toastInitSuccess);
      },
      onError: () => {
        message.error(t.setupWelcome.toastInitFailed);
      },
    },
  );

  const handleCheckConnection = async () => {
    if (!setupWindowOpen) { message.error(t.setupWelcome.toastSetupWindowClosed); return; }
    if (bootstrapConfigured && !bootstrapToken.trim()) { message.error(t.setupWelcome.toastBootstrapRequired); return; }
    if (!grpcAddr.trim()) { message.error(t.setupWelcome.toastGrpcRequired); return; }
    if (!apiKey.trim()) { message.error(t.setupWelcome.toastApiKeyRequired); return; }

    setConnectResults([]);
    setConnectPassed(false);
    await checkConnectivity();
  };

  const handleInitialize = async () => {
    if (!setupWindowOpen) { message.error(t.setupWelcome.toastSetupWindowClosed); return; }
    if (!adminUsername.trim()) { message.error(t.setupWelcome.toastAdminUserRequired); return; }
    if (!adminPassword.trim()) { message.error(t.setupWelcome.toastAdminPasswordRequired); return; }
    if (!initToken) { message.error(t.setupWelcome.toastInitTokenMissing); return; }

    await initializeSetup();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} tip={t.setupWelcome.loading} />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        background: themeToken.colorBgLayout,
      }}
    >
      {/* Language Switcher */}
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <Space size={4}>
          <GlobalOutlined style={{ color: themeToken.colorTextSecondary }} />
          {availableLocales.map((code) => (
            <Button key={code} type={locale === code ? 'link' : 'text'} size="small" onClick={() => setLocale(code)} style={{ fontSize: 12 }}>
              {locales[code].label}
            </Button>
          ))}
        </Space>
      </div>

      <div style={{ width: '100%', maxWidth: 460 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: themeToken.colorPrimary,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <SafetyCertificateOutlined style={{ fontSize: 28, color: themeToken.colorWhite }} />
          </div>
          <Title level={4} style={{ marginBottom: 4 }}>{t.setupWelcome.title}</Title>
          <Text type="secondary">{t.setupWelcome.subtitle}</Text>
        </div>

        {/* Step Indicator */}
        <Steps current={stepIndex[step]} size="small" style={{ marginBottom: 24 }} items={[
          { title: t.setupWelcome.connectionTitle },
          { title: t.setupWelcome.adminTitle },
          { title: '✓' },
        ]} />

        {!setupWindowOpen && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 24, textAlign: 'left' }}
            message={t.setupWelcome.windowClosedTitle}
            description={
              setupWindowDeadline
                ? t.setupWelcome.windowClosedWithDeadline.replace('{deadline}', new Date(setupWindowDeadline).toLocaleString())
                : t.setupWelcome.windowClosedNoDeadline
            }
          />
        )}

        {/* Step: Connection */}
        {step === 'connection' && (
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={5}>{t.setupWelcome.connectionTitle}</Title>
                <Text type="secondary">{t.setupWelcome.connectionDesc}</Text>
              </div>

              {bootstrapConfigured && (
                <div>
                  <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.setup.bootstrapCredential}</Text>
                  <Input.Password value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} placeholder={t.setupWelcome.bootstrapPlaceholder} />
                  <Text type="warning" style={{ fontSize: 12 }}>{t.setupWelcome.bootstrapWarning}</Text>
                </div>
              )}

              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.setupWelcome.grpcAddressLabel}</Text>
                <Input value={grpcAddr} onChange={(e) => setGrpcAddr(e.target.value)} placeholder={t.setupWelcome.grpcAddressPlaceholder} />
              </div>

              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.setupWelcome.apiKeyLabel}</Text>
                <Input.Password value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="headscale apikeys create" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <Text style={{ fontSize: 13, display: 'block' }}>{t.setupWelcome.tlsToggleLabel}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t.setupWelcome.tlsToggleHint}</Text>
                </div>
                <Switch checked={enableTLS} onChange={setEnableTLS} />
              </div>

              {connectResults.length > 0 && (
                <div style={{ borderTop: `1px solid ${themeToken.colorBorderSecondary}`, paddingTop: 12 }}>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>{t.setupWelcome.resultTitle}</Text>
                  {connectResults.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                      <Text type="secondary">{r.name} {r.address ? `(${r.address})` : ''}</Text>
                      <Space size={4}>
                        {r.reachable ? <CheckCircleOutlined style={{ color: successColor }} /> : <CloseCircleOutlined style={{ color: errorColor }} />}
                        <Text style={{ color: r.reachable ? successColor : errorColor, fontWeight: 500 }}>
                          {r.reachable ? t.setupWelcome.statusReachable : t.setupWelcome.statusUnreachable}
                        </Text>
                      </Space>
                    </div>
                  ))}
                </div>
              )}

              <Space>
                <Button type="primary" onClick={handleCheckConnection} loading={checking} style={{ flex: 1 }} disabled={!setupWindowOpen}>
                  {checking ? t.setupWelcome.checkingConnection : t.setupWelcome.checkConnection}
                </Button>
                {connectPassed && setupWindowOpen && (
                  <Button icon={<ArrowRightOutlined />} onClick={() => setStep('admin')} />
                )}
              </Space>
            </Space>
          </Card>
        )}

        {/* Step: Admin */}
        {step === 'admin' && (
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={5}>{t.setupWelcome.adminTitle}</Title>
                <Text type="secondary">{t.setupWelcome.adminDesc}</Text>
              </div>

              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.setupWelcome.adminUsernameLabel}</Text>
                <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="admin" />
              </div>

              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.setupWelcome.adminPasswordLabel}</Text>
                <Input.Password value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••••••" />
              </div>

              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.setupWelcome.adminEmailLabel}</Text>
                <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder={t.setupWelcome.adminEmailPlaceholder} />
              </div>

              {!setupWindowOpen && (
                <Alert
                  type="warning"
                  showIcon
                  message={t.setupWelcome.windowClosedTitle}
                  description={t.setupWelcome.windowClosedDesc}
                />
              )}

              <Space>
                <Button onClick={() => setStep('connection')}>{t.setup.back}</Button>
                <Button type="primary" onClick={handleInitialize} loading={initializing} style={{ flex: 1 }} disabled={!setupWindowOpen}>
                  {initializing ? t.setupWelcome.initializing : t.setupWelcome.initialize}
                </Button>
              </Space>
            </Space>
          </Card>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <Card style={{ textAlign: 'center' }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: themeToken.colorSuccessBg,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SmileOutlined style={{ fontSize: 32, color: successColor }} />
              </div>

              <div>
                <Title level={5}>{t.setupWelcome.successTitle}</Title>
                <Text type="secondary">{t.setupWelcome.successSubtitle}</Text>
              </div>

              <Descriptions bordered column={1} size="small" style={{ textAlign: 'left' }}>
                <Descriptions.Item label={t.setupWelcome.adminAccount}>{doneUsername}</Descriptions.Item>
                {donePassword && (
                  <Descriptions.Item label={t.setupWelcome.adminPassword}>
                    <Text code>{donePassword}</Text>
                  </Descriptions.Item>
                )}
              </Descriptions>

              <Button type="primary" block onClick={() => setLocation('/login')}>
                {t.setupWelcome.goToLogin}
              </Button>
            </Space>
          </Card>
        )}
      </div>
    </div>
  );
}
