import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation, useI18n, availableLocales, locales } from '@/i18n/index';
import { authAPI, publicAuthAPI } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { toast } from 'sonner';
import { Loader2, Globe, Shield, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const t = useTranslation();
  const { locale, setLocale } = useI18n();
  const { setAuth, isAuthenticated } = useAuthStore();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [oidcStatus, setOidcStatus] = useState<{ enabled: boolean; provider_name: string } | null>(null);

  useEffect(() => {
    if (isAuthenticated) setLocation('/');
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    publicAuthAPI.oidcStatus().then((data: any) => {
      if (data?.enabled) setOidcStatus(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state) handleOIDCCallback(code, state);
  }, [search]);

  const parseUserAuth = useCallback((data: any) => {
    const u = data.user;
    setAuth(data.token, {
      id: u.id,
      username: u.username,
      email: u.email || '',
      role: u.group?.name?.toLowerCase() === 'admin' ? 'admin' : 'user',
      display_name: u.display_name,
      permissions: data.permissions,
    });
  }, [setAuth]);

  const handleOIDCCallback = useCallback(async (code: string, state: string) => {
    setOidcLoading(true);
    try {
      const data: any = await authAPI.oidcCallback(code, state);
      if (data?.token && data?.user) {
        parseUserAuth(data);
        toast.success(t.login.oidcLoginSuccess);
        setLocation('/');
      } else {
        toast.error(t.login.oidcVerifyFailed);
      }
    } catch {
      toast.error(t.login.oidcLoginFailed);
    } finally {
      setOidcLoading(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [parseUserAuth, setLocation, t]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error(t.login.requiredFields);
      return;
    }
    setLoading(true);
    try {
      const data: any = await authAPI.login(username.trim(), password);
      if (data?.token && data?.user) {
        parseUserAuth(data);
        toast.success(t.login.loginSuccess);
        const params = new URLSearchParams(search);
        const returnUrl = params.get('return_url');
        returnUrl ? (window.location.href = returnUrl) : setLocation('/');
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  const handleOIDCLogin = async () => {
    setOidcLoading(true);
    try {
      const data: any = await authAPI.oidcLogin();
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        toast.error(t.login.oidcRedirectFailed);
        setOidcLoading(false);
      }
    } catch {
      toast.error(t.login.oidcConfigError);
      setOidcLoading(false);
    }
  };

  if (oidcLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">{t.login.redirecting}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Language Switcher */}
      <div className="fixed top-4 right-4 flex items-center gap-1.5">
        <Globe className="h-4 w-4 text-muted-foreground" />
        {availableLocales.map((code) => (
          <button
            key={code}
            onClick={() => setLocale(code)}
            className={`text-xs px-2 py-1 rounded transition-colors ${locale === code ? 'text-primary font-medium bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {locales[code].label}
          </button>
        ))}
      </div>

      <div className="w-full max-w-sm space-y-6">
        {/* Logo & Title */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Headscale Panel</h1>
        </div>

        {/* Login Card */}
        <Card className="p-6 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">{t.login.usernameLabel}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t.login.usernamePlaceholder}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t.login.passwordLabel}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.login.passwordPlaceholder}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t.login.loggingIn}
                </>
              ) : (
                t.login.loginBtn
              )}
            </Button>
          </form>

          {oidcStatus?.enabled && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">{t.login.or}</span>
                </div>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={handleOIDCLogin}>
                {t.login.oidcLogin.replace('{provider}', oidcStatus.provider_name || 'OIDC')}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
