import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n, locales, useTranslation } from '@/i18n/index';
import api from '@/lib/api';
import { Loader2, Server, Shield, ArrowRight, Settings, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

interface SetupStatusResponse {
  initialized?: boolean;
  setup_window_open?: boolean;
  setup_window_deadline?: string;
  bootstrap_configured?: boolean;
}

interface SetupPreflightResponse {
  health?: {
    docker_available?: boolean;
    docker_detail?: string;
  };
  deployment?: {
    deployed?: boolean;
  };
  existing_files?: string[];
  has_existing_config?: boolean;
  bootstrap_configured?: boolean;
}

const COLOR_UNIFI_BLUE = '#006FFF';
const COLOR_BG = '#F0F4F8';

export default function SetupWelcome() {
  const t = useTranslation();
  const { locale, setLocale } = useI18n();
  const [, setLocation] = useLocation();

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [setupBootstrapToken, setSetupBootstrapToken] = useState(() => sessionStorage.getItem('setup.bootstrapToken') || '');
  const [setupWindowOpen, setSetupWindowOpen] = useState(true);
  const [setupWindowDeadline, setSetupWindowDeadline] = useState('');
  const [preflight, setPreflight] = useState<SetupPreflightResponse | null>(null);

  useEffect(() => {
    sessionStorage.setItem('setup.bootstrapToken', setupBootstrapToken.trim());
  }, [setupBootstrapToken]);

  const buildSetupHeaders = useCallback((): Record<string, string> => {
    if (!setupBootstrapToken.trim()) {
      return {};
    }
    return {
      'X-Setup-Bootstrap-Token': setupBootstrapToken.trim(),
    };
  }, [setupBootstrapToken]);

  const runQuickCheck = useCallback(async () => {
    setChecking(true);
    try {
      const status = (await api.get('/setup/status', {
        headers: buildSetupHeaders(),
      })) as SetupStatusResponse;

      if (status.initialized) {
        setLocation('/login');
        return;
      }

      setBootstrapConfigured(Boolean(status.bootstrap_configured));
      setSetupWindowOpen(Boolean(status.setup_window_open));
      setSetupWindowDeadline(String(status.setup_window_deadline || ''));

      const data = (await api.post(
        '/setup/preflight',
        {
          skip_network_checks: true,
          skip_docker: false,
        },
        {
          headers: buildSetupHeaders(),
        },
      )) as SetupPreflightResponse;

      setPreflight(data);
      if (Boolean(data.bootstrap_configured)) {
        setBootstrapConfigured(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.common.errors.operationFailed);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }, [buildSetupHeaders, setLocation, t.common.errors.operationFailed]);

  useEffect(() => {
    runQuickCheck();
  }, [runQuickCheck]);

  const hasExistingConfig = useMemo(() => {
    if (!preflight) {
      return false;
    }
    return Boolean(preflight.has_existing_config || preflight.deployment?.deployed);
  }, [preflight]);

  const proceedToWizard = () => {
    if (bootstrapConfigured && !setupBootstrapToken.trim()) {
      toast.error(t.setupWelcome.bootstrapRequired);
      return;
    }
    setLocation('/setup/wizard?profile=fresh');
  };

  const proceedWithExisting = () => {
    if (bootstrapConfigured && !setupBootstrapToken.trim()) {
      toast.error(t.setupWelcome.bootstrapRequired);
      return;
    }
    setLocation('/setup/wizard?profile=existing');
  };

  const restartFresh = () => {
    if (bootstrapConfigured && !setupBootstrapToken.trim()) {
      toast.error(t.setupWelcome.bootstrapRequired);
      return;
    }
    localStorage.removeItem('setup.wizard.draft.v1');
    setLocation('/setup/wizard?profile=fresh');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLOR_BG }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLOR_UNIFI_BLUE }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: COLOR_BG,
        backgroundImage:
          'radial-gradient(circle at 10% -10%, rgba(0,92,255,0.10), transparent 45%), radial-gradient(circle at 90% 120%, rgba(2,132,199,0.10), transparent 35%)',
      }}
    >
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <div className="flex justify-end mb-4">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white/80 backdrop-blur px-3 py-2 text-sm text-slate-600 shadow-sm transition hover:border-slate-300"
          >
            {Object.entries(locales).map(([code, meta]) => (
              <option key={code} value={code}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>

        <Card className="rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm p-8 md:p-10 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col items-center text-center">
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #005CFF, #3B82F6)', boxShadow: '0 12px 30px rgba(0,92,255,0.28)' }}
            >
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-slate-900 tracking-tight">{t.setupWelcome.title}</h1>
            <p className="mt-2 text-sm text-slate-500 max-w-md">{t.setupWelcome.subtitle}</p>
          </div>

          {!setupWindowOpen && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 flex items-start gap-2">
              <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-red-100 flex items-center justify-center">
                <span className="h-2 w-2 rounded-full bg-red-400" />
              </span>
              {t.setup.setupWindowClosed}{setupWindowDeadline ? ` (${setupWindowDeadline})` : ''}.
            </div>
          )}

          {bootstrapConfigured && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <Label className="text-slate-700 font-medium">{t.setup.bootstrapCredential}</Label>
              <Input
                className="mt-2 border-slate-200"
                placeholder="X-Setup-Bootstrap-Token"
                type="password"
                value={setupBootstrapToken}
                onChange={(e) => setSetupBootstrapToken(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-slate-400">{t.setup.bootstrapHint}</p>
            </div>
          )}

          <div className="mt-6">
            <Card className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
              <div className="flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                  preflight?.health?.docker_available
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  <Server className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-slate-800">{t.setup.docker}</span>
                  <p className="text-xs text-slate-500">
                    {preflight?.health?.docker_available ? (
                      <span className="text-emerald-600">{t.setup.healthy}</span>
                    ) : (
                      <span className="text-amber-500">{t.setup.attention}</span>
                    )}
                  </p>
                </div>
                {preflight?.health?.docker_available && (
                  <CheckCircle2 className="h-4 w-4 ml-auto text-emerald-500" />
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400 pl-[42px]">{preflight?.health?.docker_detail || '-'}</p>
            </Card>
          </div>

          {hasExistingConfig && (
            <div className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50/60 p-4">
              <p className="text-xs font-medium text-amber-700">{t.setupWelcome.existingConfigDetected}</p>
              <div className="mt-2 text-xs text-amber-600/80 font-mono">
                {(preflight?.existing_files || []).join(', ') || t.setup.noExistingFiles}
              </div>
            </div>
          )}

          <div className="mt-8 space-y-3">
            {hasExistingConfig ? (
              <>
                <Button
                  className="w-full h-12 text-sm font-semibold rounded-xl shadow-lg transition-all hover:shadow-xl"
                  style={{ backgroundColor: COLOR_UNIFI_BLUE, boxShadow: '0 10px 25px rgba(0,92,255,0.25)' }}
                  onClick={proceedWithExisting}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {t.setupWelcome.useExistingConfig}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-11 text-sm rounded-xl border-slate-200 hover:bg-slate-50"
                  onClick={restartFresh}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t.setupWelcome.restartFresh}
                </Button>
              </>
            ) : (
              <Button
                className="w-full h-12 text-sm font-semibold rounded-xl shadow-lg transition-all hover:shadow-xl"
                style={{ backgroundColor: COLOR_UNIFI_BLUE, boxShadow: '0 10px 25px rgba(0,92,255,0.25)' }}
                onClick={proceedToWizard}
              >
                {t.setupWelcome.startSetup}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}

            <Button
              variant="ghost"
              className="w-full text-sm text-slate-400 hover:text-slate-600"
              onClick={runQuickCheck}
              disabled={checking}
            >
              {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.setupWelcome.recheck}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
