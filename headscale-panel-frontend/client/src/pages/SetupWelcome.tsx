import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n, locales, useTranslation } from '@/i18n/index';
import api from '@/lib/api';
import { Loader2, Shield, ArrowRight, Settings, RotateCcw, CheckCircle2, Globe, Cpu, Network } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

interface SetupStatusResponse {
  initialized?: boolean;
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

export default function SetupWelcome() {
  const t = useTranslation();
  const { locale, setLocale } = useI18n();
  const [, setLocation] = useLocation();

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [setupBootstrapToken, setSetupBootstrapToken] = useState(() => sessionStorage.getItem('setup.bootstrapToken') || '');
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 md:px-10 md:py-5 border-b">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">Headscale Panel</span>
        </div>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          {Object.entries(locales).map(([code, meta]) => (
            <option key={code} value={code}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Hero section */}
          <div className="text-center mb-8">
            <div className="inline-flex h-16 w-16 rounded-2xl bg-primary items-center justify-center shadow-lg shadow-primary/20 mb-5">
              <Shield className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">{t.setupWelcome.title}</h1>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">{t.setupWelcome.subtitle}</p>
          </div>

          {/* Feature showcase */}
          <div className="space-y-3 mb-6">
            {[
              { icon: Globe, label: t.setup.welcomeFeature1Title, desc: t.setup.welcomeFeature1Desc },
              { icon: Cpu, label: t.setup.welcomeFeature2Title, desc: t.setup.welcomeFeature2Desc },
              { icon: Network, label: t.setup.welcomeFeature3Title, desc: t.setup.welcomeFeature3Desc },
            ].map((feat) => (
              <div key={feat.label} className="flex items-start gap-4 rounded-xl border bg-card shadow-sm p-4">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                  <feat.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{feat.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Main card */}
          <Card className="rounded-2xl shadow-lg border p-0">
            {/* Bootstrap token */}
            {bootstrapConfigured && (
              <div className="px-6 pt-6">
                <div className="rounded-lg border bg-muted/50 p-4">
                  <Label className="text-xs font-medium">{t.setup.bootstrapCredential}</Label>
                  <Input
                    className="mt-2"
                    placeholder="X-Setup-Bootstrap-Token"
                    type="password"
                    value={setupBootstrapToken}
                    onChange={(e) => setSetupBootstrapToken(e.target.value)}
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{t.setup.bootstrapHint}</p>
                </div>
              </div>
            )}

            {/* Docker status - only when available */}
            {preflight?.health?.docker_available && (
              <div className="px-6 pt-5">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 p-3.5 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">Docker</span>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {preflight?.health?.docker_detail || '-'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Existing config detected */}
            {hasExistingConfig && (
              <div className="px-6 pt-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3.5">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t.setupWelcome.existingConfigDetected}</p>
                  <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70 font-mono mt-1.5 truncate">
                    {(preflight?.existing_files || []).join(', ') || t.setup.noExistingFiles}
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="p-6 space-y-2.5">
              <Button
                className="w-full h-11 text-sm font-semibold rounded-xl"
                onClick={proceedToWizard}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                {t.setupWelcome.oneClickDeploy}
              </Button>
              <Button
                className="w-full h-10 text-sm rounded-xl"
                variant="outline"
                onClick={proceedWithExisting}
              >
                <Settings className="h-4 w-4 mr-2" />
                {t.setupWelcome.useExistingConfig}
              </Button>
              {hasExistingConfig && (
                <Button
                  className="w-full h-9 text-xs"
                  variant="ghost"
                  onClick={restartFresh}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  {t.setupWelcome.restartFresh}
                </Button>
              )}
            </div>

            {/* Recheck footer */}
            <div className="border-t px-6 py-3 flex justify-center">
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
                onClick={runQuickCheck}
                disabled={checking}
              >
                {checking && <Loader2 className="h-3 w-3 animate-spin" />}
                {t.setupWelcome.recheck}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
