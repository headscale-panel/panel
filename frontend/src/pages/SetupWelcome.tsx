import { Alert, Card, Input, Button, Switch, Steps, Typography, Spin, Space, Descriptions, message, theme } from 'antd';
import { SafetyCertificateOutlined, GlobalOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, ArrowRightOutlined, SmileOutlined } from '@ant-design/icons';
import { useTranslation, useI18n, availableLocales, locales } from '@/i18n/index';
import { setupApi } from '@/api';
import { setSetupTokens } from '@/lib/request';
import { useState } from 'react';
import { useRequest } from 'ahooks';
import { useLocation } from 'wouter';

const { Title, Text, Paragraph } = Typography;

enum SetupStep {
  Connection = 'connection',
  Admin = 'admin',
  Done = 'done',
}

interface ConnectivityResult {
  name: string;
  address?: string;
  reachable: boolean;
  detail: string;
}

const stepIndex = { [SetupStep.Connection]: 0, [SetupStep.Admin]: 1, [SetupStep.Done]: 2 };

export default function SetupWelcome() {
  const t = useTranslation();
  const { locale, setLocale } = useI18n();
  const [, setLocation] = useLocation();
  const { token: themeToken } = theme.useToken();
  const successColor = themeToken.colorSuccess;
  const errorColor = themeToken.colorError;

  const [step, setStep] = useState<SetupStep>(SetupStep.Connection);

  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [initToken, setInitToken] = useState('');
  const [setupWindowOpen, setSetupWindowOpen] = useState(true);
  const [setupWindowDeadline, setSetupWindowDeadline] = useState('');

  const [grpcAddr, setGrpcAddr] = useState('127.0.0.1:50443');
  const [apiKey, setApiKey] = useState('');
  const [enableTLS, setEnableTLS] = useState(false);
  const [connectResults, setConnectResults] = useState<ConnectivityResult[]>([]);
  const [connectPassed, setConnectPassed] = useState(false);

  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const [doneUsername, setDoneUsername] = useState('');
  const [donePassword, setDonePassword] = useState('');

  const syncSetupTokens = () => {
    setSetupTokens({
      bootstrapToken: bootstrapToken.trim(),
      initToken: initToken.trim(),
    });
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
    async () => {
      syncSetupTokens();
      return setupApi.getStatus();
    },
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
    async () => {
      syncSetupTokens();
      return setupApi.connectivityCheck({
        headscale_grpc_addr: grpcAddr.trim(),
        api_key: apiKey.trim(),
        strict_api: true,
        grpc_allow_insecure: !enableTLS,
      });
    },
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
    async () => {
      syncSetupTokens();
      return setupApi.init({
        headscale_grpc_addr: grpcAddr.trim(),
        api_key: apiKey.trim(),
        enable_tls: enableTLS,
        username: adminUsername.trim(),
        password: adminPassword,
        email: adminEmail.trim(),
      });
    },
    {
      manual: true,
      onSuccess: (data: any) => {
        setDoneUsername(data?.user?.username || adminUsername);
        setDonePassword(data?.password_generated ? (data?.generated_password || '') : adminPassword);
        setStep(SetupStep.Done);
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

  return (
    <>
      <Spin spinning={loading} indicator={<LoadingOutlined className="text-32px" spin />} tip={t.setupWelcome.loading} fullscreen />
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
      <div className="lang-switcher">
        <Space size={4}>
          <GlobalOutlined style={{ color: themeToken.colorTextSecondary }} />
          {availableLocales.map((code) => (
            <Button key={code} type={locale === code ? 'link' : 'text'} size="small" onClick={() => setLocale(code)} className="text-12px">
              {locales[code].label}
            </Button>
          ))}
        </Space>
      </div>

      <div className="w-full max-w-115">
        {/* Header */}
        <div className="text-center mb-6">
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: themeToken.colorPrimary,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <SafetyCertificateOutlined style={{ fontSize: 28, color: themeToken.colorWhite }} />
          </div>
          <Title level={4} className="mb-1">{t.setupWelcome.title}</Title>
          <Text type="secondary">{t.setupWelcome.subtitle}</Text>
        </div>

        {/* Step Indicator */}
        <Steps current={stepIndex[step]} size="small" className="mb-6" items={[
          { title: t.setupWelcome.connectionTitle },
          { title: t.setupWelcome.adminTitle },
          { title: '✓' },
        ]} />

        {!setupWindowOpen && (
          <Alert
            type="warning"
            showIcon
            className="mb-6 text-left"
            message={t.setupWelcome.windowClosedTitle}
            description={
              setupWindowDeadline
                ? t.setupWelcome.windowClosedWithDeadline.replace('{deadline}', new Date(setupWindowDeadline).toLocaleString())
                : t.setupWelcome.windowClosedNoDeadline
            }
          />
        )}

        {/* Step: Connection */}
        {step === SetupStep.Connection && (
          <Card>
            <Space direction="vertical" size="middle" className="w-full">
              <div>
                <Title level={5}>{t.setupWelcome.connectionTitle}</Title>
                <Text type="secondary">{t.setupWelcome.connectionDesc}</Text>
              </div>

              {bootstrapConfigured && (
                <div>
                  <Text className="form-label">{t.setup.bootstrapCredential}</Text>
                  <Input.Password value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} placeholder={t.setupWelcome.bootstrapPlaceholder} />
                  <Text type="warning" className="text-12px">{t.setupWelcome.bootstrapWarning}</Text>
                </div>
              )}

              <div>
                <Text className="form-label">{t.setupWelcome.grpcAddressLabel}</Text>
                <Input value={grpcAddr} onChange={(e) => setGrpcAddr(e.target.value)} placeholder={t.setupWelcome.grpcAddressPlaceholder} />
              </div>

              <div>
                <Text className="form-label">{t.setupWelcome.apiKeyLabel}</Text>
                <Input.Password value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="headscale apikeys create" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Text className="text-13px block">{t.setupWelcome.tlsToggleLabel}</Text>
                  <Text type="secondary" className="text-12px">{t.setupWelcome.tlsToggleHint}</Text>
                </div>
                <Switch checked={enableTLS} onChange={setEnableTLS} />
              </div>

              {connectResults.length > 0 && (
                <div style={{ borderTop: `1px solid ${themeToken.colorBorderSecondary}`, paddingTop: 12 }}>
                  <Text strong className="text-13px block mb-2">{t.setupWelcome.resultTitle}</Text>
                  {connectResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
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
                <Button type="primary" onClick={handleCheckConnection} loading={checking} className="flex-1" disabled={!setupWindowOpen}>
                  {checking ? t.setupWelcome.checkingConnection : t.setupWelcome.checkConnection}
                </Button>
                {connectPassed && setupWindowOpen && (
                  <Button icon={<ArrowRightOutlined />} onClick={() => setStep(SetupStep.Admin)} />
                )}
              </Space>
            </Space>
          </Card>
        )}

        {/* Step: Admin */}
        {step === SetupStep.Admin && (
          <Card>
            <Space direction="vertical" size="middle" className="w-full">
              <div>
                <Title level={5}>{t.setupWelcome.adminTitle}</Title>
                <Text type="secondary">{t.setupWelcome.adminDesc}</Text>
              </div>

              <div>
                <Text className="form-label">{t.setupWelcome.adminUsernameLabel}</Text>
                <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="admin" />
              </div>

              <div>
                <Text className="form-label">{t.setupWelcome.adminPasswordLabel}</Text>
                <Input.Password value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••••••" />
              </div>

              <div>
                <Text className="form-label">{t.setupWelcome.adminEmailLabel}</Text>
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
                <Button onClick={() => setStep(SetupStep.Connection)}>{t.setup.back}</Button>
                <Button type="primary" onClick={handleInitialize} loading={initializing} className="flex-1" disabled={!setupWindowOpen}>
                  {initializing ? t.setupWelcome.initializing : t.setupWelcome.initialize}
                </Button>
              </Space>
            </Space>
          </Card>
        )}

        {/* Step: Done */}
        {step === SetupStep.Done && (
          <Card className="text-center">
            <Space direction="vertical" size="large" className="w-full">
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

              <Descriptions bordered column={1} size="small" className="text-left">
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
    </>
  );
}
