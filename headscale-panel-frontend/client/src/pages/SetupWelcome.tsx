import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation, useI18n, availableLocales, locales } from '@/i18n/index';
import api from '@/lib/api';
import { Shield, Globe, Loader2, CheckCircle2, XCircle, ArrowRight, PartyPopper } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

type SetupStep = 'connection' | 'admin' | 'done';

interface ConnectivityResult {
  name: string;
  address?: string;
  reachable: boolean;
  detail: string;
}

function StepDot({ active, completed, label }: { active: boolean; completed: boolean; label: string }) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all';
  if (completed) return <div className={`${base} bg-primary text-primary-foreground`}>{label}</div>;
  if (active) return <div className={`${base} bg-primary text-primary-foreground ring-4 ring-primary/20`}>{label}</div>;
  return <div className={`${base} bg-muted text-muted-foreground`}>{label}</div>;
}

export default function SetupWelcome() {
  const t = useTranslation();
  const { locale, setLocale } = useI18n();
  const [, setLocation] = useLocation();

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<SetupStep>('connection');

  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [initToken, setInitToken] = useState('');

  const [grpcAddr, setGrpcAddr] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [enableTLS, setEnableTLS] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connectResults, setConnectResults] = useState<ConnectivityResult[]>([]);
  const [connectPassed, setConnectPassed] = useState(false);

  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [initializing, setInitializing] = useState(false);

  const [doneUsername, setDoneUsername] = useState('');
  const [donePassword, setDonePassword] = useState('');

  useEffect(() => { loadStatus(); }, []);

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (bootstrapToken.trim()) headers['X-Setup-Bootstrap-Token'] = bootstrapToken.trim();
    if (initToken.trim()) headers['X-Setup-Init-Token'] = initToken.trim();
    return headers;
  };

  const loadStatus = async () => {
    try {
      const data: any = await api.get('/setup/status', {
        headers: bootstrapToken.trim() ? { 'X-Setup-Bootstrap-Token': bootstrapToken.trim() } : {},
      });
      if (data?.initialized) { setLocation('/login'); return; }
      setBootstrapConfigured(!!data?.bootstrap_configured);
      if (data?.init_token) setInitToken(data.init_token);
    } catch {
      toast.error(t.setupWelcome.toastStatusLoadFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckConnection = async () => {
    if (bootstrapConfigured && !bootstrapToken.trim()) {
      toast.error(t.setupWelcome.toastBootstrapRequired); return;
    }
    if (!grpcAddr.trim()) { toast.error(t.setupWelcome.toastGrpcRequired); return; }
    if (!apiKey.trim()) { toast.error(t.setupWelcome.toastApiKeyRequired); return; }

    setChecking(true);
    setConnectResults([]);
    setConnectPassed(false);

    try {
      const data: any = await api.post('/setup/connectivity-check', {
        headscale_grpc_addr: grpcAddr.trim(),
        api_key: apiKey.trim(),
        strict_api: true,
        grpc_allow_insecure: !enableTLS,
      }, { headers: buildHeaders() });

      const checks: ConnectivityResult[] = data?.checks || [];
      setConnectResults(checks);

      const allOk = data?.all_reachable === true;
      setConnectPassed(allOk);

      if (allOk) {
        toast.success(t.setupWelcome.toastConnectivitySuccess);
        try {
          const status: any = await api.get('/setup/status', {
            headers: bootstrapToken.trim() ? { 'X-Setup-Bootstrap-Token': bootstrapToken.trim() } : {},
          });
          if (status?.init_token) setInitToken(status.init_token);
        } catch {}
      } else {
        toast.error(t.setupWelcome.toastConnectivityFailed);
      }
    } catch {
      toast.error(t.setupWelcome.toastConnectivityCheckError);
    } finally {
      setChecking(false);
    }
  };

  const handleInitialize = async () => {
    if (!adminUsername.trim()) { toast.error(t.setupWelcome.toastAdminUserRequired); return; }
    if (!adminPassword.trim()) { toast.error(t.setupWelcome.toastAdminPasswordRequired); return; }
    if (!initToken) { toast.error(t.setupWelcome.toastInitTokenMissing); return; }

    setInitializing(true);
    try {
      const data: any = await api.post('/setup/init', {
        headscale_grpc_addr: grpcAddr.trim(),
        api_key: apiKey.trim(),
        enable_tls: enableTLS,
        username: adminUsername.trim(),
        password: adminPassword,
        email: adminEmail.trim(),
      }, { headers: buildHeaders() });

      setDoneUsername(data?.user?.username || adminUsername);
      setDonePassword(data?.password_generated ? (data?.generated_password || '') : adminPassword);
      setStep('done');
      toast.success(t.setupWelcome.toastInitSuccess);
    } catch {
      toast.error(t.setupWelcome.toastInitFailed);
    } finally {
      setInitializing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">{t.setupWelcome.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
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

      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{t.setupWelcome.title}</h1>
          <p className="text-sm text-muted-foreground">{t.setupWelcome.subtitle}</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2">
          <StepDot active={step === 'connection'} completed={step === 'admin' || step === 'done'} label="1" />
          <div className={`w-12 h-0.5 ${step !== 'connection' ? 'bg-primary' : 'bg-border'}`} />
          <StepDot active={step === 'admin'} completed={step === 'done'} label="2" />
          <div className={`w-12 h-0.5 ${step === 'done' ? 'bg-primary' : 'bg-border'}`} />
          <StepDot active={step === 'done'} completed={false} label="✓" />
        </div>

        {/* Step: Connection */}
        {step === 'connection' && (
          <Card className="p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t.setupWelcome.connectionTitle}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t.setupWelcome.connectionDesc}</p>
            </div>

            {bootstrapConfigured && (
              <div className="space-y-1.5">
                <Label>{t.setup.bootstrapCredential}</Label>
                <Input
                  value={bootstrapToken}
                  onChange={(e) => setBootstrapToken(e.target.value)}
                  placeholder={t.setupWelcome.bootstrapPlaceholder}
                  type="password"
                />
                <p className="text-xs text-amber-600 dark:text-amber-400">{t.setupWelcome.bootstrapWarning}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t.setupWelcome.grpcAddressLabel}</Label>
              <Input
                value={grpcAddr}
                onChange={(e) => setGrpcAddr(e.target.value)}
                placeholder={t.setupWelcome.grpcAddressPlaceholder}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t.setupWelcome.apiKeyLabel}</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="headscale apikeys create"
                type="password"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">{t.setupWelcome.tlsToggleLabel}</Label>
                <p className="text-xs text-muted-foreground">{t.setupWelcome.tlsToggleHint}</p>
              </div>
              <Switch checked={enableTLS} onCheckedChange={setEnableTLS} />
            </div>

            {connectResults.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-sm font-medium">{t.setupWelcome.resultTitle}</Label>
                {connectResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5">
                    <span className="text-muted-foreground">{r.name} {r.address ? `(${r.address})` : ''}</span>
                    <span className={`flex items-center gap-1 font-medium ${r.reachable ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                      {r.reachable ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {r.reachable ? t.setupWelcome.statusReachable : t.setupWelcome.statusUnreachable}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleCheckConnection} disabled={checking}>
                {checking ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.setupWelcome.checkingConnection}</>
                ) : (
                  t.setupWelcome.checkConnection
                )}
              </Button>
              {connectPassed && (
                <Button variant="outline" onClick={() => setStep('admin')}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Step: Admin */}
        {step === 'admin' && (
          <Card className="p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t.setupWelcome.adminTitle}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t.setupWelcome.adminDesc}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t.setupWelcome.adminUsernameLabel}</Label>
              <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="admin" />
            </div>

            <div className="space-y-1.5">
              <Label>{t.setupWelcome.adminPasswordLabel}</Label>
              <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••••••" />
            </div>

            <div className="space-y-1.5">
              <Label>{t.setupWelcome.adminEmailLabel}</Label>
              <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder={t.setupWelcome.adminEmailPlaceholder} />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep('connection')}>{t.setup.back}</Button>
              <Button className="flex-1" onClick={handleInitialize} disabled={initializing}>
                {initializing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.setupWelcome.initializing}</>
                ) : (
                  t.setupWelcome.initialize
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <Card className="p-6 shadow-sm space-y-5 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <PartyPopper className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t.setupWelcome.successTitle}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t.setupWelcome.successSubtitle}</p>
            </div>

            <div className="bg-muted rounded-lg p-4 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.setupWelcome.adminAccount}</span>
                <span className="font-medium text-foreground">{doneUsername}</span>
              </div>
              {donePassword && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t.setupWelcome.tempPassword}</span>
                  <span className="font-mono text-foreground">{donePassword}</span>
                </div>
              )}
            </div>

            <Button className="w-full" onClick={() => setLocation('/login')}>
              {t.setupWelcome.goToLogin}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
