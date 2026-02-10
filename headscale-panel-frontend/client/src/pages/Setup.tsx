import { useTranslation } from '@/i18n/index';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import api from '@/lib/api';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Globe,
  Loader2,
  PlayCircle,
  Server,
  Shield,
  Terminal,
  Users,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

type Step = 'welcome' | 'admin' | 'headscale' | 'derper' | 'done';

/* ───── Headscale config ───── */
interface HeadscaleConfig {
  containerName: string;
  httpPort: string;
  grpcPort: string;
  configPath: string;
  dataPath: string;
  timezone: string;
}
const defaultHeadscale: HeadscaleConfig = {
  containerName: 'headscale-server',
  httpPort: '28080',
  grpcPort: '28081',
  configPath: './headscale/config',
  dataPath: './headscale/data',
  timezone: 'Asia/Shanghai',
};

/* ───── Derper config ───── */
interface DerperConfig {
  containerName: string;
  derpDomain: string;
  derpPort: string;
  stunPort: string;
  certMode: string;
  verifyClients: boolean;
  timezone: string;
}
const defaultDerper: DerperConfig = {
  containerName: 'headscale-derp',
  derpDomain: 'derp1.example.com',
  derpPort: '26060',
  stunPort: '33478',
  certMode: 'letsencrypt',
  verifyClients: false,
  timezone: 'Asia/Shanghai',
};

/* ───── Deploy progress line ───── */
interface ProgressLine {
  step: string;
  message: string;
  error?: string;
}

type DeployStatus = 'idle' | 'deploying' | 'success' | 'error';

/* ───── docker run command preview ───── */
function buildHeadscaleCmd(cfg: HeadscaleConfig): string {
  return `docker run -d \\
  --name ${cfg.containerName} \\
  --network private \\
  -v ${cfg.configPath}:/etc/headscale \\
  -v ${cfg.dataPath}:/var/lib/headscale \\
  -v ./headscale/run:/var/run/headscale \\
  -v /usr/share/zoneinfo/${cfg.timezone}:/etc/localtime:ro \\
  -p ${cfg.httpPort}:8080 \\
  -p ${cfg.grpcPort}:50443 \\
  --restart unless-stopped \\
  headscale/headscale:stable serve`;
}

function buildDerperCmd(cfg: DerperConfig): string {
  return `docker run -d \\
  --name ${cfg.containerName} \\
  --network private \\
  -e DERP_DOMAIN=${cfg.derpDomain} \\
  -e DERP_ADDR=:6060 \\
  -e DERP_CERT_MODE=${cfg.certMode} \\
  -e DERP_VERIFY_CLIENTS=${cfg.verifyClients} \\
  -p ${cfg.derpPort}:6060 \\
  -p ${cfg.stunPort}:3478/udp \\
  -v /var/run/tailscale:/var/run/tailscale \\
  -v /usr/share/zoneinfo/${cfg.timezone}:/etc/localtime:ro \\
  --restart unless-stopped \\
  fredliang/derper`;
}

/* ───── Shared sub-components ───── */
function ConfigField({ label, value, onChange, placeholder, hint, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs font-medium">{label}</Label>
      <Input className="mt-1 font-mono text-sm" placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function CommandPreview({ code, onCopy }: { code: string; onCopy: (t: string) => void }) {
  return (
    <div className="relative group">
      <pre className="bg-zinc-950 text-zinc-100 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed border border-zinc-800">
        {code}
      </pre>
      <Button variant="ghost" size="sm"
        className="absolute top-2 right-2 text-zinc-400 hover:text-white hover:bg-zinc-800"
        onClick={() => onCopy(code)}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function DeployLog({ lines, status }: { lines: ProgressLine[]; status: DeployStatus }) {
  return (
    <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4 max-h-60 overflow-y-auto font-mono text-xs space-y-1.5">
      {lines.map((line, i) => (
        <div key={i} className="flex items-start gap-2">
          {line.error ? (
            <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
          ) : line.step === 'done' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-zinc-500 mt-0.5 shrink-0" />
          )}
          <span className={line.error ? 'text-red-400' : line.step === 'done' ? 'text-green-400' : 'text-zinc-300'}>
            {line.message}
          </span>
        </div>
      ))}
      {status === 'deploying' && (
        <div className="flex items-center gap-2 text-blue-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
}

/* ───── Main Setup Component ───── */
export default function Setup() {
  const t = useTranslation();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', password: '', email: '' });

  const [hsCfg, setHsCfg] = useState<HeadscaleConfig>(defaultHeadscale);
  const [dpCfg, setDpCfg] = useState<DerperConfig>(defaultDerper);
  const [showAdvHS, setShowAdvHS] = useState(false);
  const [showAdvDP, setShowAdvDP] = useState(false);

  // Deploy state
  const [hsDeployStatus, setHsDeployStatus] = useState<DeployStatus>('idle');
  const [hsDeployLog, setHsDeployLog] = useState<ProgressLine[]>([]);
  const [dpDeployStatus, setDpDeployStatus] = useState<DeployStatus>('idle');
  const [dpDeployLog, setDpDeployLog] = useState<ProgressLine[]>([]);

  const hsCmd = useMemo(() => buildHeadscaleCmd(hsCfg), [hsCfg]);
  const dpCmd = useMemo(() => buildDerperCmd(dpCfg), [dpCfg]);

  useEffect(() => {
    api.get('/setup/status').then((data: any) => {
      if (data?.initialized) {
        setLocation('/login');
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [setLocation]);

  const handleCreateAdmin = async () => {
    if (!adminForm.username || !adminForm.password) {
      toast.error(t.users.requiredFields);
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/setup/init', adminForm);
      toast.success(t.setup.adminCreated);
      setStep('headscale');
    } catch (e: any) {
      toast.error(e.message || t.common.errors.operationFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const deployContainer = useCallback(async (
    type: 'headscale' | 'derper',
    setStatus: (s: DeployStatus) => void,
    setLog: React.Dispatch<React.SetStateAction<ProgressLine[]>>,
  ) => {
    let req: any;
    if (type === 'headscale') {
      req = {
        image: 'headscale/headscale:stable',
        container_name: hsCfg.containerName,
        ports: {
          [hsCfg.httpPort]: '8080',
          [hsCfg.grpcPort]: '50443',
        },
        volumes: {
          [hsCfg.configPath]: '/etc/headscale',
          [hsCfg.dataPath]: '/var/lib/headscale',
          './headscale/run': '/var/run/headscale',
          [`/usr/share/zoneinfo/${hsCfg.timezone}`]: '/etc/localtime',
        },
        command: ['serve'],
        network_name: 'private',
        restart_policy: 'unless-stopped',
      };
    } else {
      req = {
        image: 'fredliang/derper',
        container_name: dpCfg.containerName,
        ports: {
          [dpCfg.derpPort]: '6060',
          [`${dpCfg.stunPort}/udp`]: '3478',
        },
        volumes: {
          '/var/run/tailscale': '/var/run/tailscale',
          [`/usr/share/zoneinfo/${dpCfg.timezone}`]: '/etc/localtime',
        },
        env: {
          DERP_DOMAIN: dpCfg.derpDomain,
          DERP_ADDR: ':6060',
          DERP_CERT_MODE: dpCfg.certMode,
          DERP_VERIFY_CLIENTS: String(dpCfg.verifyClients),
        },
        network_name: 'private',
        restart_policy: 'unless-stopped',
      };
    }

    setStatus('deploying');
    setLog([{ step: 'start', message: `${t.setup.deployStarting} ${req.image} ...` }]);

    try {
      const data = await api.post('/setup/deploy', req) as any;
      const progress: ProgressLine[] = data?.progress || [];
      setLog((prev) => [...prev, ...progress]);
      setStatus('success');
      toast.success(t.setup.deploySuccess);
    } catch (e: any) {
      setLog((prev) => [...prev, { step: 'error', message: e.message || 'Deploy failed', error: e.message }]);
      setStatus('error');
      toast.error(t.setup.deployFailed);
    }
  }, [hsCfg, dpCfg, t]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t.topology.copiedToClipboard);
  }, [t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const steps: { key: Step; label: string; icon: typeof Users }[] = [
    { key: 'welcome', label: t.setup.stepWelcome, icon: Activity },
    { key: 'admin', label: t.setup.stepAdmin, icon: Users },
    { key: 'headscale', label: t.setup.stepHeadscale, icon: Server },
    { key: 'derper', label: t.setup.stepDerper, icon: Globe },
    { key: 'done', label: t.setup.stepDone, icon: Check },
  ];

  const currentIndex = steps.findIndex((s) => s.key === step);
  const updateHS = (patch: Partial<HeadscaleConfig>) => setHsCfg((p) => ({ ...p, ...patch }));
  const updateDP = (patch: Partial<DerperConfig>) => setDpCfg((p) => ({ ...p, ...patch }));

  const isHsDeploying = hsDeployStatus === 'deploying';
  const isDpDeploying = dpDeployStatus === 'deploying';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-3xl space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Headscale Panel</h1>
          </div>
          <p className="text-muted-foreground">{t.setup.subtitle}</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1 sm:gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === currentIndex;
            const isDone = i < currentIndex;
            return (
              <div key={s.key} className="flex items-center gap-1 sm:gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    isDone ? 'bg-primary text-primary-foreground shadow-md'
                      : isActive ? 'bg-primary/20 text-primary border-2 border-primary shadow-sm'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-6 sm:w-10 h-0.5 mb-4 transition-colors ${i < currentIndex ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="p-6 md:p-8">
          {/* ─── Welcome ─── */}
          {step === 'welcome' && (
            <div className="text-center space-y-6">
              <Server className="h-16 w-16 mx-auto text-primary" />
              <h2 className="text-2xl font-bold">{t.setup.welcomeTitle}</h2>
              <p className="text-muted-foreground max-w-md mx-auto">{t.setup.welcomeDesc}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center text-sm text-muted-foreground">
                <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" />{t.setup.stepAdmin}</Badge>
                <ArrowRight className="h-3 w-3 hidden sm:block" />
                <Badge variant="secondary" className="gap-1"><Server className="h-3 w-3" />Headscale</Badge>
                <ArrowRight className="h-3 w-3 hidden sm:block" />
                <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" />DERP</Badge>
              </div>
              <Button size="lg" onClick={() => setStep('admin')}>
                {t.setup.getStarted}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ─── Admin ─── */}
          {step === 'admin' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />{t.setup.createAdmin}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t.setup.createAdminDesc}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>{t.users.usernameLabel}</Label>
                  <Input className="mt-1" placeholder={t.users.usernamePlaceholder} value={adminForm.username}
                    onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} autoFocus />
                </div>
                <div>
                  <Label>{t.users.passwordLabel}</Label>
                  <Input className="mt-1" type="password" placeholder={t.users.passwordPlaceholder} value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
                </div>
                <div>
                  <Label>{t.users.emailLabel}</Label>
                  <Input className="mt-1" type="email" placeholder="admin@example.com" value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('welcome')}>
                  <ArrowLeft className="h-4 w-4 mr-1" />{t.setup.back}
                </Button>
                <Button onClick={handleCreateAdmin} disabled={submitting} className="flex-1">
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {submitting ? t.common.status.loading : t.setup.createAndContinue}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── Headscale Docker ─── */}
          {step === 'headscale' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Server className="h-5 w-5 text-primary" />{t.setup.headscaleTitle}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t.setup.headscaleDesc}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ConfigField label={t.setup.hsContainerName} value={hsCfg.containerName}
                  onChange={(v) => updateHS({ containerName: v })} placeholder="headscale-server" disabled={isHsDeploying} />
                <ConfigField label={t.setup.hsHttpPort} value={hsCfg.httpPort}
                  onChange={(v) => updateHS({ httpPort: v })} placeholder="28080" hint={t.setup.hsHttpPortHint} disabled={isHsDeploying} />
                <ConfigField label={t.setup.hsGrpcPort} value={hsCfg.grpcPort}
                  onChange={(v) => updateHS({ grpcPort: v })} placeholder="28081" hint={t.setup.hsGrpcPortHint} disabled={isHsDeploying} />
                <ConfigField label={t.setup.timezone} value={hsCfg.timezone}
                  onChange={(v) => updateHS({ timezone: v })} placeholder="Asia/Shanghai" disabled={isHsDeploying} />
              </div>

              {/* Advanced */}
              <div>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  onClick={() => setShowAdvHS(!showAdvHS)}>
                  {showAdvHS ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {t.setup.advancedOptions}
                </button>
                {showAdvHS && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                    <ConfigField label={t.setup.hsConfigPath} value={hsCfg.configPath}
                      onChange={(v) => updateHS({ configPath: v })} placeholder="./headscale/config" disabled={isHsDeploying} />
                    <ConfigField label={t.setup.hsDataPath} value={hsCfg.dataPath}
                      onChange={(v) => updateHS({ dataPath: v })} placeholder="./headscale/data" disabled={isHsDeploying} />
                  </div>
                )}
              </div>

              <Separator />

              {/* Command preview */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t.setup.commandPreview}</span>
                </div>
                <CommandPreview code={hsCmd} onCopy={copyToClipboard} />
              </div>

              {/* Deploy button & log */}
              {hsDeployStatus === 'idle' && (
                <Button className="w-full" size="lg"
                  onClick={() => deployContainer('headscale', setHsDeployStatus, setHsDeployLog)}>
                  <PlayCircle className="h-4 w-4 mr-2" />{t.setup.deployNow}
                </Button>
              )}

              {(hsDeployStatus === 'deploying' || hsDeployStatus === 'success' || hsDeployStatus === 'error') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t.setup.deployProgress}</span>
                    {hsDeployStatus === 'success' && <Badge className="bg-green-500">{t.setup.deploySuccess}</Badge>}
                    {hsDeployStatus === 'error' && <Badge variant="destructive">{t.setup.deployFailed}</Badge>}
                    {hsDeployStatus === 'deploying' && <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1" />{t.setup.deploying}</Badge>}
                  </div>
                  <DeployLog lines={hsDeployLog} status={hsDeployStatus} />
                  {hsDeployStatus === 'error' && (
                    <Button variant="outline" size="sm"
                      onClick={() => { setHsDeployStatus('idle'); setHsDeployLog([]); }}>
                      {t.setup.retryDeploy}
                    </Button>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('admin')} disabled={isHsDeploying}>
                  <ArrowLeft className="h-4 w-4 mr-1" />{t.setup.back}
                </Button>
                <Button className="flex-1" onClick={() => setStep('derper')}
                  disabled={isHsDeploying}>
                  {hsDeployStatus === 'idle' ? t.setup.skipStep : t.setup.next}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── DERP Docker ─── */}
          {step === 'derper' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />{t.setup.derperTitle}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t.setup.derperDesc}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ConfigField label={t.setup.dpContainerName} value={dpCfg.containerName}
                  onChange={(v) => updateDP({ containerName: v })} placeholder="headscale-derp" disabled={isDpDeploying} />
                <ConfigField label={t.setup.dpDomain} value={dpCfg.derpDomain}
                  onChange={(v) => updateDP({ derpDomain: v })} placeholder="derp1.example.com" hint={t.setup.dpDomainHint} disabled={isDpDeploying} />
                <ConfigField label={t.setup.dpDerpPort} value={dpCfg.derpPort}
                  onChange={(v) => updateDP({ derpPort: v })} placeholder="26060" hint={t.setup.dpDerpPortHint} disabled={isDpDeploying} />
                <ConfigField label={t.setup.dpStunPort} value={dpCfg.stunPort}
                  onChange={(v) => updateDP({ stunPort: v })} placeholder="33478" hint={t.setup.dpStunPortHint} disabled={isDpDeploying} />
              </div>

              {/* Advanced */}
              <div>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  onClick={() => setShowAdvDP(!showAdvDP)}>
                  {showAdvDP ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {t.setup.advancedOptions}
                </button>
                {showAdvDP && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                    <div>
                      <Label className="text-xs font-medium">{t.setup.dpCertMode}</Label>
                      <select className="mt-1 w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono"
                        value={dpCfg.certMode} onChange={(e) => updateDP({ certMode: e.target.value })} disabled={isDpDeploying}>
                        <option value="letsencrypt">letsencrypt</option>
                        <option value="manual">manual</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-input" checked={dpCfg.verifyClients}
                          onChange={(e) => updateDP({ verifyClients: e.target.checked })} disabled={isDpDeploying} />
                        <span className="text-xs font-medium">{t.setup.dpVerifyClients}</span>
                      </label>
                    </div>
                    <ConfigField label={t.setup.timezone} value={dpCfg.timezone}
                      onChange={(v) => updateDP({ timezone: v })} placeholder="Asia/Shanghai" disabled={isDpDeploying} />
                  </div>
                )}
              </div>

              <Separator />

              {/* Command preview */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t.setup.commandPreview}</span>
                </div>
                <CommandPreview code={dpCmd} onCopy={copyToClipboard} />
              </div>

              {/* Deploy button & log */}
              {dpDeployStatus === 'idle' && (
                <Button className="w-full" size="lg"
                  onClick={() => deployContainer('derper', setDpDeployStatus, setDpDeployLog)}>
                  <PlayCircle className="h-4 w-4 mr-2" />{t.setup.deployNow}
                </Button>
              )}

              {(dpDeployStatus === 'deploying' || dpDeployStatus === 'success' || dpDeployStatus === 'error') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{t.setup.deployProgress}</span>
                    {dpDeployStatus === 'success' && <Badge className="bg-green-500">{t.setup.deploySuccess}</Badge>}
                    {dpDeployStatus === 'error' && <Badge variant="destructive">{t.setup.deployFailed}</Badge>}
                    {dpDeployStatus === 'deploying' && <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1" />{t.setup.deploying}</Badge>}
                  </div>
                  <DeployLog lines={dpDeployLog} status={dpDeployStatus} />
                  {dpDeployStatus === 'error' && (
                    <Button variant="outline" size="sm"
                      onClick={() => { setDpDeployStatus('idle'); setDpDeployLog([]); }}>
                      {t.setup.retryDeploy}
                    </Button>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 border border-border">
                💡 {t.setup.derperHint}
              </p>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('headscale')} disabled={isDpDeploying}>
                  <ArrowLeft className="h-4 w-4 mr-1" />{t.setup.back}
                </Button>
                <Button className="flex-1" onClick={() => setStep('done')} disabled={isDpDeploying}>
                  {dpDeployStatus === 'idle' ? t.setup.skipStep : t.setup.next}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── Done ─── */}
          {step === 'done' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 mx-auto bg-green-500/10 rounded-full flex items-center justify-center">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold">{t.setup.doneTitle}</h2>
              <p className="text-muted-foreground">{t.setup.doneDesc}</p>

              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Headscale</span>
                    {hsDeployStatus === 'success' ? (
                      <Badge className="bg-green-500 ml-auto">{t.common.status.running}</Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-auto">{t.setup.notDeployed}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{hsCfg.containerName}</p>
                  <p className="text-xs text-muted-foreground">HTTP:{hsCfg.httpPort} | gRPC:{hsCfg.grpcPort}</p>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">DERP</span>
                    {dpDeployStatus === 'success' ? (
                      <Badge className="bg-green-500 ml-auto">{t.common.status.running}</Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-auto">{t.setup.notDeployed}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{dpCfg.containerName}</p>
                  <p className="text-xs text-muted-foreground">{dpCfg.derpDomain} | DERP:{dpCfg.derpPort} | STUN:{dpCfg.stunPort}</p>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('derper')}>
                  <ArrowLeft className="h-4 w-4 mr-1" />{t.setup.back}
                </Button>
                <Button size="lg" className="flex-1" onClick={() => setLocation('/login')}>
                  {t.setup.goToLogin}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
