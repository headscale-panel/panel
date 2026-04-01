import { Card, Input, Button, Typography, Divider, Spin, Space, theme } from 'antd';
import { UserOutlined, LockOutlined, EyeInvisibleOutlined, EyeTwoTone, GlobalOutlined, SafetyCertificateOutlined, LoadingOutlined } from '@ant-design/icons';
import { useTranslation, useI18n, availableLocales, locales } from '@/i18n/index';
import { authAPI, publicAuthAPI } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { UserRole } from '@/lib/enums';
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { message } from 'antd';
import { useRequest } from 'ahooks';
import { consumeAuthNotice, normalizeLoginReturnUrl } from '@/lib/auth';
import { getDefaultRouteForUser } from '@/lib/permissions';

const { Title, Text } = Typography;

export default function Login() {
  const t = useTranslation();
  const { locale, setLocale } = useI18n();
  const { setAuth, isAuthenticated } = useAuthStore();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { token: themeToken } = theme.useToken();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [oidcLoading, setOidcLoading] = useState(false);
  const [oidcStatus, setOidcStatus] = useState<{ enabled: boolean; provider_name: string } | null>(null);

  useEffect(() => {
    if (isAuthenticated) setLocation('/');
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const notice = consumeAuthNotice();
    if (!notice) return;
    if (notice === 'sessionExpired') {
      message.error(t.common.errors.sessionExpired);
    }
  }, [t]);

  useRequest(
    async () => publicAuthAPI.oidcStatus(),
    {
      onSuccess: (data: any) => {
        if (data?.enabled) setOidcStatus(data);
      },
      onError: () => {
        // Ignore status load failure on login page to avoid noisy UX.
      },
    },
  );

  const { runAsync: submitLogin, loading } = useRequest(
    async (payload: { username: string; password: string }) =>
      authAPI.login(payload.username, payload.password),
    { manual: true },
  );

  useEffect(() => {
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state) handleOIDCCallback(code, state);
  }, [search]);

  const parseUserAuth = useCallback((data: any) => {
    const u = data.user;
    const nextUser = {
      id: u.id,
      username: u.username,
      email: u.email || '',
      role: u.role === UserRole.Admin || u.group?.name?.toLowerCase() === UserRole.Admin ? UserRole.Admin : UserRole.User,
      headscale_name: u.headscale_name || u.username,
      display_name: u.display_name,
      permissions: data.permissions,
    };
    setAuth(data.token, nextUser);
    return nextUser;
  }, [setAuth]);

  const handleOIDCCallback = useCallback(async (code: string, state: string) => {
    setOidcLoading(true);
    try {
      const data: any = await authAPI.oidcCallback(code, state);
      if (data?.token && data?.user) {
        const nextUser = parseUserAuth(data);
        message.success(t.login.oidcLoginSuccess);
        setLocation(getDefaultRouteForUser(nextUser));
      } else {
        message.error(t.login.oidcVerifyFailed);
      }
    } catch {
      message.error(t.login.oidcLoginFailed);
    } finally {
      setOidcLoading(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [parseUserAuth, setLocation, t]);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      message.error(t.login.requiredFields);
      return;
    }
    try {
      const data: any = await submitLogin({ username: username.trim(), password });
      if (data?.token && data?.user) {
        const nextUser = parseUserAuth(data);
        message.success(t.login.loginSuccess);
        const params = new URLSearchParams(search);
        const returnUrl = normalizeLoginReturnUrl(params.get('return_url'));
        returnUrl ? window.location.assign(returnUrl) : setLocation(getDefaultRouteForUser(nextUser));
      }
    } catch {
      // handled by interceptor
    }
  };

  const handleOIDCLogin = async () => {
    setOidcLoading(true);
    try {
      const data: any = await authAPI.oidcLogin();
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        message.error(t.login.oidcRedirectFailed);
        setOidcLoading(false);
      }
    } catch {
      message.error(t.login.oidcConfigError);
      setOidcLoading(false);
    }
  };

  if (oidcLoading) {
    return (
      <div className="auth-page">
        <Spin indicator={<LoadingOutlined className="text-32px" spin />} tip={t.login.redirecting} />
      </div>
    );
  }

  return (
    <div className="auth-page p-4">
      {/* Language Switcher */}
      <div className="lang-switcher">
        <Space size={4}>
          <GlobalOutlined style={{ color: themeToken.colorTextSecondary }} />
          {availableLocales.map((code) => (
            <Button
              key={code}
              type={locale === code ? 'link' : 'text'}
              size="small"
              onClick={() => setLocale(code)}
              className="text-12px"
            >
              {locales[code].label}
            </Button>
          ))}
        </Space>
      </div>

      <div className="w-full max-w-95">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: themeToken.colorPrimary,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <SafetyCertificateOutlined className="text-28px text-white" />
          </div>
          <Title level={4} className="mb-0">Headscale Panel</Title>
        </div>

        {/* Login Card */}
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <Space direction="vertical" size="middle" className="w-full">
              <div>
                <Text className="form-label">{t.login.usernameLabel}</Text>
                <Input
                  prefix={<UserOutlined />}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t.login.usernamePlaceholder}
                  autoComplete="username"
                  autoFocus
                  size="large"
                />
              </div>

              <div>
                <Text className="form-label">{t.login.passwordLabel}</Text>
                <Input.Password
                  prefix={<LockOutlined />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.login.passwordPlaceholder}
                  autoComplete="current-password"
                  size="large"
                  iconRender={(visible) => visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />}
                />
              </div>

              <Button type="primary" htmlType="submit" block loading={loading} size="large">
                {loading ? t.login.loggingIn : t.login.loginBtn}
              </Button>
            </Space>
          </form>

          {oidcStatus?.enabled && (
            <>
              <Divider plain className="text-12px">{t.login.or}</Divider>
              <Button block onClick={handleOIDCLogin} size="large">
                {t.login.oidcLogin.replace('{provider}', oidcStatus.provider_name || 'OIDC')}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
