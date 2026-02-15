import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n, locales } from '@/i18n/index';
import api from '@/lib/api';
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

interface SetupStatusResponse {
  initialized?: boolean;
  bootstrap_configured?: boolean;
  init_token?: string;
}

interface ConnectivityCheck {
  name: string;
  address?: string;
  reachable?: boolean;
  detail?: string;
}

interface ConnectivityResponse {
  checks?: ConnectivityCheck[];
  all_reachable?: boolean;
}

interface InitResponse {
  user?: {
    id?: number;
    username?: string;
    email?: string;
  };
  generated_password?: string;
  password_generated?: boolean;
}

export default function SetupWelcome() {
  const { locale, setLocale, t } = useI18n();
  const [, setLocation] = useLocation();
  const setupText = t.setupWelcome;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);

  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState(() => sessionStorage.getItem('setup.bootstrapToken') || '');
  const [initToken, setInitToken] = useState('');

  const [grpcAddr, setGrpcAddr] = useState('127.0.0.1:28081');
  const [apiKey, setApiKey] = useState('');
  const [enableTLS, setEnableTLS] = useState(false);

  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const [connectivity, setConnectivity] = useState<ConnectivityResponse | null>(null);
  const [initResult, setInitResult] = useState<InitResponse | null>(null);

  useEffect(() => {
    sessionStorage.setItem('setup.bootstrapToken', bootstrapToken.trim());
  }, [bootstrapToken]);

  const setupHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (bootstrapToken.trim()) {
      headers['X-Setup-Bootstrap-Token'] = bootstrapToken.trim();
    }
    return headers;
  }, [bootstrapToken]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const status = (await api.get('/setup/status', { headers: setupHeaders })) as SetupStatusResponse;
      if (status.initialized) {
        setLocation('/login');
        return;
      }
      setBootstrapConfigured(Boolean(status.bootstrap_configured));
      setInitToken(status.init_token || '');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : setupText.toastStatusLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [setLocation, setupHeaders, setupText.toastStatusLoadFailed]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const validateBaseFields = () => {
    if (bootstrapConfigured && !bootstrapToken.trim()) {
      toast.error(setupText.toastBootstrapRequired);
      return false;
    }
    if (!grpcAddr.trim()) {
      toast.error(setupText.toastGrpcRequired);
      return false;
    }
    if (!apiKey.trim()) {
      toast.error(setupText.toastApiKeyRequired);
      return false;
    }
    return true;
  };

  const checkConnectivity = async () => {
    if (!validateBaseFields()) {
      return;
    }

    setChecking(true);
    try {
      const resp = (await api.post(
        '/setup/connectivity-check',
        {
          headscale_grpc_addr: grpcAddr.trim(),
          api_key: apiKey.trim(),
          strict_api: true,
          grpc_allow_insecure: !enableTLS,
        },
        { headers: setupHeaders },
      )) as ConnectivityResponse;
      setConnectivity(resp);

      if (resp.all_reachable) {
        toast.success(setupText.toastConnectivitySuccess);
      } else {
        toast.error(setupText.toastConnectivityFailed);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : setupText.toastConnectivityCheckError);
    } finally {
      setChecking(false);
    }
  };

  const initialize = async () => {
    if (!validateBaseFields()) {
      return;
    }
    if (!adminUsername.trim()) {
      toast.error(setupText.toastAdminUserRequired);
      return;
    }
    if (!adminPassword.trim()) {
      toast.error(setupText.toastAdminPasswordRequired);
      return;
    }
    if (!initToken) {
      toast.error(setupText.toastInitTokenMissing);
      return;
    }

    setSubmitting(true);
    try {
      const headers = {
        ...setupHeaders,
        'X-Setup-Init-Token': initToken,
      };

      const resp = (await api.post(
        '/setup/init',
        {
          headscale_grpc_addr: grpcAddr.trim(),
          api_key: apiKey.trim(),
          enable_tls: enableTLS,
          username: adminUsername.trim(),
          password: adminPassword,
          email: adminEmail.trim(),
        },
        { headers },
      )) as InitResponse;

      setInitResult(resp);
      toast.success(setupText.toastInitSuccess);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : setupText.toastInitFailed);
      await loadStatus();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f8ff]">
        <div className="flex items-center gap-3 rounded-2xl border border-[#d7e4f4] bg-white px-6 py-4 shadow-[0_10px_30px_rgba(6,62,130,0.08)]">
          <Loader2 className="h-6 w-6 animate-spin text-[#0559C9]" />
          <p className="text-sm text-[#1f3a5c]">{setupText.loading}</p>
        </div>
      </div>
    );
  }

  if (initResult) {
    return (
      <div className="min-h-screen bg-[#f3f8ff] flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-lg border-[#d7e4f4] bg-white text-[#122a46] p-6 rounded-2xl shadow-[0_16px_36px_rgba(8,73,148,0.12)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{setupText.successTitle}</h1>
              <p className="text-xs text-[#5d7695] mt-1">{setupText.successSubtitle}</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-[#d9e5f4] bg-[#f8fbff] p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-[#5d7695]">{setupText.adminAccount}</span>
              <span>{initResult.user?.username || adminUsername}</span>
            </div>
            {initResult.password_generated && initResult.generated_password ? (
              <div className="flex justify-between">
                <span className="text-[#5d7695]">{setupText.tempPassword}</span>
                <span className="font-mono">{initResult.generated_password}</span>
              </div>
            ) : null}
          </div>

          <Button
            className="w-full mt-5 h-11 rounded-xl bg-[#0559C9] hover:bg-[#044ca7] text-white"
            onClick={() => setLocation('/login')}
          >
            {setupText.goToLogin}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f8ff] text-[#122a46]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(120,175,255,0.28),transparent_38%),radial-gradient(circle_at_100%_10%,rgba(58,133,240,0.15),transparent_30%),radial-gradient(circle_at_55%_100%,rgba(5,89,201,0.12),transparent_35%)]" />

      <div className="relative border-b border-[#d7e4f4]/80 backdrop-blur-sm bg-white/75">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#0559C9]/10 border border-[#0559C9]/20 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-[#0559C9]" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">{setupText.title}</p>
              <p className="text-xs text-[#5d7695]">{setupText.subtitle}</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#5d7695]">
            <Globe2 className="h-4 w-4" />
            {setupText.language}
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="rounded-lg border border-[#cadcf0] bg-white px-3 py-1.5 text-xs text-[#264161] focus:outline-none focus:ring-2 focus:ring-[#0559C9]/25"
            >
              {Object.entries(locales).map(([code, meta]) => (
                <option key={code} value={code}>
                  {meta.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-2xl border border-[#d7e6f7] bg-white/95 p-6 shadow-[0_14px_30px_rgba(8,73,148,0.08)]">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#0559C9]/10 flex items-center justify-center shrink-0">
                <ScanSearch className="h-5 w-5 text-[#0559C9]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{setupText.guideTitle}</h2>
                <p className="text-sm text-[#5d7695] mt-1">{setupText.guideDesc}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="rounded-xl border border-[#d8e4f3] bg-[#f7fbff] px-4 py-3">
                <p className="font-medium text-[#1d3a5f]">{setupText.guideStep1Title}</p>
                <p className="mt-1 text-xs text-[#5d7695]">{setupText.guideStep1Desc}</p>
              </div>
              <div className="rounded-xl border border-[#d8e4f3] bg-[#f7fbff] px-4 py-3">
                <p className="font-medium text-[#1d3a5f]">{setupText.guideStep2Title}</p>
                <p className="mt-1 text-xs text-[#5d7695]">{setupText.guideStep2Desc}</p>
              </div>
              <div className="rounded-xl border border-[#d8e4f3] bg-[#f7fbff] px-4 py-3">
                <p className="font-medium text-[#1d3a5f]">{setupText.guideStep3Title}</p>
                <p className="mt-1 text-xs text-[#5d7695]">{setupText.guideStep3Desc}</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#d7e6f7] bg-[#f6fbff] px-4 py-3">
              <p className="text-sm font-medium text-[#1d3a5f]">{setupText.securityTitle}</p>
              <p className="text-xs text-[#5d7695] mt-1">{setupText.securityDesc}</p>
            </div>
          </Card>

          <div className="grid gap-6">
            <Card className="rounded-2xl border border-[#d7e6f7] bg-white/95 p-6 shadow-[0_14px_30px_rgba(8,73,148,0.08)]">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#0559C9]/10 flex items-center justify-center shrink-0">
                  <Wifi className="h-5 w-5 text-[#0559C9]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{setupText.connectionTitle}</h2>
                  <p className="text-sm text-[#5d7695] mt-1">{setupText.connectionDesc}</p>
                </div>
              </div>

              {bootstrapConfigured && (
                <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-xs text-amber-800">{setupText.bootstrapWarning}</p>
                  <Input
                    className="mt-2 h-10 border-amber-200 bg-white"
                    placeholder={setupText.bootstrapPlaceholder}
                    type="password"
                    value={bootstrapToken}
                    onChange={(e) => setBootstrapToken(e.target.value)}
                  />
                </div>
              )}

              <div className="mt-5 space-y-4">
                <div>
                  <Label className="text-[#3a5678]">{setupText.grpcAddressLabel}</Label>
                  <Input
                    className="mt-1.5 h-11 border-[#cedef1] bg-[#fbfdff] focus:border-[#0559C9] focus:ring-[#0559C9]/20"
                    placeholder={setupText.grpcAddressPlaceholder}
                    value={grpcAddr}
                    onChange={(e) => setGrpcAddr(e.target.value)}
                  />
                </div>

                <div>
                  <Label className="text-[#3a5678]">{setupText.apiKeyLabel}</Label>
                  <div className="relative mt-1.5">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7191b3]" />
                    <Input
                      className="h-11 pl-9 border-[#cedef1] bg-[#fbfdff] focus:border-[#0559C9] focus:ring-[#0559C9]/20"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-[#d7e6f7] bg-[#f8fbff] px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1d3a5f]">{setupText.tlsToggleLabel}</p>
                    <p className="text-xs text-[#5d7695] mt-0.5">{setupText.tlsToggleHint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableTLS((v) => !v)}
                    className={`w-12 h-7 rounded-full transition-colors relative ${enableTLS ? 'bg-[#0559C9]' : 'bg-[#bfcee2]'}`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${enableTLS ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </div>
              </div>

              <Button
                className="w-full mt-5 h-11 rounded-xl bg-[#0559C9] hover:bg-[#044ca7] text-white font-semibold"
                onClick={checkConnectivity}
                disabled={checking}
              >
                {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {checking ? setupText.checkingConnection : setupText.checkConnection}
              </Button>
            </Card>

            <Card className="rounded-2xl border border-[#d7e6f7] bg-white/95 p-6 shadow-[0_14px_30px_rgba(8,73,148,0.08)]">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#0559C9]/10 flex items-center justify-center shrink-0">
                  <UserRound className="h-5 w-5 text-[#0559C9]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{setupText.adminTitle}</h2>
                  <p className="text-sm text-[#5d7695] mt-1">{setupText.adminDesc}</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <Label className="text-[#3a5678]">{setupText.adminUsernameLabel}</Label>
                  <Input
                    className="mt-1.5 h-11 border-[#cedef1] bg-[#fbfdff] focus:border-[#0559C9] focus:ring-[#0559C9]/20"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                  />
                </div>

                <div>
                  <Label className="text-[#3a5678]">{setupText.adminPasswordLabel}</Label>
                  <div className="relative mt-1.5">
                    <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7191b3]" />
                    <Input
                      className="h-11 pl-9 border-[#cedef1] bg-[#fbfdff] focus:border-[#0559C9] focus:ring-[#0559C9]/20"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[#3a5678]">{setupText.adminEmailLabel}</Label>
                  <Input
                    className="mt-1.5 h-11 border-[#cedef1] bg-[#fbfdff] focus:border-[#0559C9] focus:ring-[#0559C9]/20"
                    placeholder={setupText.adminEmailPlaceholder}
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                  />
                </div>
              </div>

              <Button
                className="w-full mt-5 h-11 rounded-xl bg-[#1d72de] hover:bg-[#175db4] text-white"
                onClick={initialize}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {submitting ? setupText.initializing : setupText.initialize}
              </Button>

              {connectivity?.checks?.length ? (
                <div className="mt-5 rounded-xl border border-[#d7e6f7] bg-[#f8fbff] p-4">
                  <p className="text-xs font-medium text-[#3a5678]">{setupText.resultTitle}</p>
                  <div className="mt-3 space-y-2">
                    {connectivity.checks.map((item) => (
                      <div key={item.name} className="flex items-start justify-between gap-3 rounded-lg border border-[#e4eef9] bg-white p-2.5 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-[#1d3a5f]">{item.name}</p>
                          <p className="text-[#6d87a4] truncate">
                            {item.address || setupText.noDataPlaceholder} / {item.detail || setupText.noDataPlaceholder}
                          </p>
                        </div>
                        {item.reachable ? (
                          <div className="inline-flex items-center gap-1 text-emerald-600 shrink-0">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{setupText.statusReachable}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-amber-600 shrink-0">
                            <TriangleAlert className="h-4 w-4" />
                            <span>{setupText.statusUnreachable}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
