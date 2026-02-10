import { useState, useEffect } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/lib/store';
import { authAPI, publicAuthAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { Loader2, Eye, EyeOff, Shield } from 'lucide-react';
import { useTranslation } from '@/i18n/index';

interface OIDCStatus {
  enabled: boolean;
  builtin: boolean;
  provider_name: string;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const setAuth = useAuthStore((state) => state.setAuth);
  const t = useTranslation();

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [oidcStatus, setOidcStatus] = useState<OIDCStatus | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });

  // Check OIDC availability on mount
  useEffect(() => {
    const checkOIDCStatus = async () => {
      try {
        const response: any = await publicAuthAPI.oidcStatus();
        setOidcStatus(response);
      } catch {
        // OIDC not available, silently ignore
        setOidcStatus({ enabled: false, builtin: false, provider_name: '' });
      }
    };
    checkOIDCStatus();
  }, []);

  // Handle OIDC callback
  useEffect(() => {
    const params = new URLSearchParams(search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      toast.error(t.login.oidcLoginFailed + (params.get('error_description') || error));
      return;
    }

    if (code && state) {
      handleOIDCCallback(code, state);
    }
  }, [search]);

  const handleOIDCCallback = async (code: string, state: string) => {
    try {
      setOidcLoading(true);
      const response: any = await authAPI.oidcCallback(code, state);
      setAuth(response.token, response.user);
      toast.success(t.login.oidcLoginSuccess);
      const params = new URLSearchParams(search);
      const returnUrl = params.get('return_url');
      setLocation(returnUrl || '/');
    } catch (error: any) {
      toast.error(t.login.oidcLoginFailed + (error.message || t.login.oidcVerifyFailed));
    } finally {
      setOidcLoading(false);
    }
  };

  const handleOIDCLogin = async () => {
    try {
      setOidcLoading(true);
      const response: any = await authAPI.oidcLogin();
      if (response.redirect_url) {
        window.location.href = response.redirect_url;
      } else {
        toast.error(t.login.oidcRedirectFailed);
        setOidcLoading(false);
      }
    } catch (error: any) {
      toast.error(t.login.oidcLoginFailed + (error.message || t.login.oidcConfigError));
      setOidcLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username || !formData.password) {
      toast.error(t.login.requiredFields);
      return;
    }

    try {
      setLoading(true);
      const response: any = await authAPI.login(formData.username, formData.password);
      const user = { ...response.user, permissions: response.permissions };
      setAuth(response.token, user);
      toast.success(t.login.loginSuccess);
      const params = new URLSearchParams(search);
      const returnUrl = params.get('return_url');
      setLocation(returnUrl || '/');
    } catch (error: any) {
      toast.error(t.login.loginFailed + (error.message || t.login.checkCredentials));
    } finally {
      setLoading(false);
    }
  };

  const showOIDC = oidcStatus?.enabled === true && oidcStatus?.builtin === false;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f8] dark:bg-gray-950 px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[420px]"
      >
        <Card className="rounded-2xl shadow-lg border-0 p-8 bg-white dark:bg-gray-900">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-[#0559C9] rounded-xl flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Headscale Panel
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Sign in to your account
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-700 dark:text-gray-300">
                {t.login.usernameLabel}
              </Label>
              <Input
                id="username"
                type="text"
                placeholder={t.login.usernamePlaceholder}
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                disabled={loading}
                className="h-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-[#0559C9] focus:ring-[#0559C9]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700 dark:text-gray-300">
                {t.login.passwordLabel}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t.login.passwordPlaceholder}
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  disabled={loading}
                  className="h-10 pr-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-[#0559C9] focus:ring-[#0559C9]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer select-none"
                >
                  {t.login.rememberMe}
                </label>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-[#0559C9] hover:bg-[#044ca3] text-white font-medium"
              disabled={loading || oidcLoading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.login.loggingIn}
                </>
              ) : (
                t.login.loginBtn
              )}
            </Button>
          </form>

          {/* OIDC Login - conditional */}
          {showOIDC && (
            <>
              <div className="relative my-6">
                <Separator className="bg-gray-200 dark:bg-gray-700" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 px-3 text-xs text-gray-400 dark:text-gray-500">
                  {t.login.or}
                </span>
              </div>

              <Button
                variant="outline"
                className="w-full h-10 gap-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={handleOIDCLogin}
                disabled={loading || oidcLoading}
              >
                {oidcLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.login.redirecting}
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    {t.login.oidcLogin.replace('{provider}', oidcStatus?.provider_name || 'OIDC')}
                  </>
                )}
              </Button>
            </>
          )}

          {/* Register Link */}
          <div className="mt-6 text-center text-sm">
            <span className="text-gray-500 dark:text-gray-400">{t.login.noAccount}</span>
            <Link href="/register">
              <span className="text-[#0559C9] hover:text-[#044ca3] ml-1 cursor-pointer font-medium">
                {t.login.registerNow}
              </span>
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
