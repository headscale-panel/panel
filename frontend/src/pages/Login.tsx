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

import { EyeInvisibleOutlined, EyeTwoTone, GlobalOutlined, LoadingOutlined, LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { useRequest } from 'ahooks';
import { Button, Card, Divider, Input, message, Space, Spin, theme, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { authApi } from '@/api';
import { availableLocales, locales, useI18n, useTranslation } from '@/i18n/index';
import { consumeAuthNotice, normalizeLoginReturnUrl } from '@/lib/auth';
import { UserRole } from '@/lib/enums';
import { getDefaultRouteForUser } from '@/lib/permissions';
import { useAuthStore } from '@/lib/store';

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
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [oidcLoading, setOidcLoading] = useState(false);
  const [ssoStatus, setSsoStatus] = useState<{ enabled: boolean } | null>(null);

  useEffect(() => {
    if (isAuthenticated)
      setLocation('/');
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const notice = consumeAuthNotice();
    if (!notice)
      return;
    if (notice === 'sessionExpired') {
      message.error(t.common.errors.sessionExpired);
    }
  }, [t]);

  useRequest(
    async () => authApi.status(),
    {
      onSuccess: (data) => {
        setSsoStatus({ enabled: Boolean(data?.panel_sso) });
      },
      onError: () => {
        // A failed status probe must not break the password form.
      },
    },
  );

  const { runAsync: submitLogin, loading } = useRequest(
    async (payload: { username: string; password: string; totp_code?: string }) =>
      authApi.login(payload),
    { manual: true },
  );

  const parseUserAuth = useCallback((data: { token: string; account: any; permissions: string[] }) => {
    const account = data.account;
    const nextUser = {
      id: account.id,
      username: account.username,
      email: account.email || '',
      // Administrator status is a role flag, not a role name: roles are renameable.
      role: account.is_system_admin ? UserRole.Admin : UserRole.User,
      headscale_name: account.username,
      display_name: account.display_name,
      permissions: data.permissions,
      guide_tour_seen_at: account.guide_tour_seen ? '' : null,
      totp_enabled: account.totp_enabled ?? false,
    };
    setAuth(data.token, nextUser);
    return nextUser;
  }, [setAuth]);

  // The SSO round trip ends with the backend redirecting here and putting the
  // token in the URL fragment. Read it once, store it, then scrub the address bar
  // so a screenshot or a shared link cannot leak it.
  useEffect(() => {
    const match = /(?:^#|&)sso_token=([^&]+)/.exec(window.location.hash);
    if (!match)
      return;

    const token = decodeURIComponent(match[1]);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    authApi.me().then((me) => {
      if (!me)
        return;
      const nextUser = {
        id: me.id,
        username: me.username,
        email: me.email || '',
        role: me.is_system_admin ? UserRole.Admin : UserRole.User,
        headscale_name: me.username,
        display_name: me.display_name,
        permissions: me.permissions,
        guide_tour_seen_at: me.guide_tour_seen ? '' : null,
        totp_enabled: me.totp_enabled ?? false,
      };
      setAuth(token, nextUser);
      message.success(t.login.oidcLoginSuccess);
      setLocation(getDefaultRouteForUser(nextUser));
    }).catch(() => {
      message.error(t.login.oidcVerifyFailed);
    });
  }, [setAuth, setLocation, t]);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      message.error(t.login.requiredFields);
      return;
    }
    if (totpRequired && !totpCode.trim()) {
      message.error(t.login.totpRequired);
      return;
    }
    try {
      const data: any = await submitLogin({
        username: username.trim(),
        password,
        totp_code: totpRequired ? totpCode.trim() : undefined,
      });
      if (!data?.token || !data?.account) {
        message.error(t.login.oidcVerifyFailed);
        return;
      }

      const nextUser = parseUserAuth(data);
      message.success(t.login.loginSuccess);
      const params = new URLSearchParams(search);
      const returnUrl = normalizeLoginReturnUrl(params.get('return_url'));
      if (returnUrl) {
        window.location.assign(returnUrl);
        return;
      }
      setLocation(getDefaultRouteForUser(nextUser));
    } catch (err: any) {
      const errorMessage = String(err?.response?.data?.msg || err?.message || '').toLowerCase();
      const isTotpError = errorMessage.includes('totp');

      if (isTotpError && !totpRequired && errorMessage.includes('required')) {
        setTotpRequired(true);
      }
    }
  };

  const handleOIDCLogin = async () => {
    setOidcLoading(true);
    try {
      window.location.href = authApi.panelSSOLoginURL();
    } catch {
      message.error(t.login.oidcConfigError);
      setOidcLoading(false);
    }
  };

  if (oidcLoading) {
    return (
      <div className="auth-page" style={{ background: themeToken.colorBgLayout }}>
        <Spin indicator={<LoadingOutlined className="text-32px" spin />} tip={t.login.redirecting} />
      </div>
    );
  }

  return (
    <div className="auth-page p-4" style={{ background: themeToken.colorBgLayout }}>
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
            width: 48,
            height: 48,
            borderRadius: 12,
            background: themeToken.colorPrimary,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
          >
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

              {totpRequired && (
                <div>
                  <Text className="form-label">{t.login.totpLabel}</Text>
                  <Input
                    prefix={<SafetyCertificateOutlined />}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t.login.totpPlaceholder}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    size="large"
                    autoFocus
                  />
                </div>
              )}

              <Button type="primary" htmlType="submit" block loading={loading} size="large">
                {loading ? t.login.loggingIn : t.login.loginBtn}
              </Button>
            </Space>
          </form>

          {ssoStatus?.enabled && (
            <>
              <Divider plain className="text-12px">{t.login.or}</Divider>
              <Button block onClick={handleOIDCLogin} size="large">
                {t.login.oidcLogin.replace('{provider}', 'SSO')}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
