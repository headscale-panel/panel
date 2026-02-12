import { locales, useI18n, useTranslation } from '@/i18n/index';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import {
  Activity,
  ArrowRight,
  Check,
  ChevronsUpDown,
  Copy,
  Download,
  Loader2,
  Lock,
  Network,
  PlayCircle,
  Server,
  Shield,
  Wifi,
  WifiOff,
  FileCode,
  Rocket,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { toast } from 'sonner';

type Stage = 'check' | 'controller' | 'network' | 'provision';
type StageStatus = 'configured' | 'processing' | 'pending';
type DeployStatus = 'idle' | 'deploying' | 'success' | 'error';
type ProxyMode = 'none' | 'built_in' | 'external';
type ProvisionPhase = 'idle' | 'generating' | 'pulling' | 'starting' | 'finalizing' | 'done' | 'error';

interface HeadscaleConfig {
  containerName: string;
  listenAddress: string;
  httpPort: string;
  grpcPort: string;
  configPath: string;
  dataPath: string;
  timezone: string;
  databaseDriver: 'sqlite' | 'postgres';
  databaseURL: string;
  apiKey: string;
}

interface DerperConfig {
  enabled: boolean;
  autoDeploy: boolean;
  containerName: string;
  derpDomain: string;
  derpPort: string;
  stunPort: string;
  regionCode: string;
  certMode: 'letsencrypt' | 'manual';
  verifyClients: boolean;
  timezone: string;
}

interface ReverseProxyConfig {
  panelDomain: string;
  headscaleHost: string;
  derpHost: string;
  deployCertbot: boolean;
  nginxContainerName: string;
  certbotContainerName: string;
  certbotEmail: string;
}

interface ProgressLine {
  step: string;
  message: string;
  error?: string;
}

interface SetupStatusResponse {
  initialized?: boolean;
  user_count?: number;
  setup_window_open?: boolean;
  setup_window_deadline?: string;
  bootstrap_configured?: boolean;
  init_token?: string;
  deploy_token?: string;
}

interface HealthSummary {
  docker_available?: boolean;
  docker_detail?: string;
  docker_version?: string;
  cpu_cores?: number;
  memory_total_bytes?: number;
  memory_total_human?: string;
  storage_total_bytes?: number;
  storage_free_bytes?: number;
  storage_total_human?: string;
  storage_free_human?: string;
}

interface DeploymentSummary {
  deployed?: boolean;
  container_count?: number;
  headscale_detected?: boolean;
  derp_detected?: boolean;
  nginx_detected?: boolean;
  headscale?: {
    container_name?: string;
    http_port?: number;
    grpc_port?: number;
  };
  derp?: {
    container_name?: string;
    derp_port?: number;
    stun_port?: number;
  };
}

interface ConfigHints {
  panel_domain?: string;
  headscale_host?: string;
  derp_host?: string;
}

interface SetupPreflightResponse {
  docker?: {
    ok?: boolean;
    detail?: string;
  };
  health?: HealthSummary;
  deployment?: DeploymentSummary;
  system_state?: string;
  existing_files?: string[];
  has_existing_config?: boolean;
  maintenance_mode_suggested?: boolean;
  bootstrap_configured?: boolean;
  config_hints?: ConfigHints;
}

const COLOR_BLUE = '#006FFF';
const COLOR_STATUS_GREEN = '#10B981';
const COLOR_BG = '#F0F4F8';
const CARD_BASE_CLASS = 'rounded-2xl border border-slate-200/60 bg-white/95 backdrop-blur-sm shadow-[0_8px_30px_rgba(15,23,42,0.06)]';
const CARD_INNER_CLASS = 'rounded-xl border border-slate-200/80 bg-slate-50/50';

const defaultHeadscale: HeadscaleConfig = {
  containerName: 'headscale-server',
  listenAddress: '0.0.0.0:8080',
  httpPort: '28080',
  grpcPort: '28081',
  configPath: './headscale/config',
  dataPath: './headscale/data',
  timezone: 'Asia/Shanghai',
  databaseDriver: 'sqlite',
  databaseURL: './headscale/data/headscale.db',
  apiKey: generateRandomToken(40),
};

const defaultDerper: DerperConfig = {
  enabled: true,
  autoDeploy: true,
  containerName: 'headscale-derp',
  derpDomain: 'derp1.example.com',
  derpPort: '26060',
  stunPort: '33478',
  regionCode: '901',
  certMode: 'letsencrypt',
  verifyClients: false,
  timezone: 'Asia/Shanghai',
};

const defaultProxy: ReverseProxyConfig = {
  panelDomain: 'panel.example.com',
  headscaleHost: 'headscale.example.com',
  derpHost: 'derp1.example.com',
  deployCertbot: false,
  nginxContainerName: 'headscale-nginx',
  certbotContainerName: 'headscale-certbot',
  certbotEmail: 'admin@example.com',
};

interface SetupDraft {
  adminForm?: { username: string; password: string; email: string };
  hsCfg?: HeadscaleConfig;
  derpCfg?: DerperConfig;
  proxyCfg?: ReverseProxyConfig;
  proxyMode?: ProxyMode;
  setupBootstrapToken?: string;
}

const setupDraftStorageKey = 'setup.wizard.draft.v1';

function readSetupDraft(): SetupDraft {
  try {
    const raw = localStorage.getItem(setupDraftStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as SetupDraft;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function generateRandomToken(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

function getStageStatusLabel(status: StageStatus, locked: boolean, setup: { statusConfigured: string; statusProcessing: string; statusPending: string; statusLocked: string }): string {
  if (status === 'configured') {
    return setup.statusConfigured;
  }
  if (status === 'processing') {
    return setup.statusProcessing;
  }
  if (locked) {
    return setup.statusLocked;
  }
  return setup.statusPending;
}

function buildExternalProxySnippet(proxy: ReverseProxyConfig, hs: HeadscaleConfig, derp: DerperConfig): string {
  const derpBlock = derp.enabled
    ? `\nserver {\n  listen 80;\n  server_name ${proxy.derpHost};\n  location / {\n    proxy_pass http://127.0.0.1:${derp.derpPort};\n  }\n}\n\n# STUN (UDP ${derp.stunPort}) needs L4 forwarding on your edge gateway.\n`
    : '';

  return `# Example Nginx config (External Managed)\nserver {\n  listen 80;\n  server_name ${proxy.panelDomain};\n  location / {\n    proxy_pass http://127.0.0.1:8080;\n  }\n}\n\nserver {\n  listen 80;\n  server_name ${proxy.headscaleHost};\n  location / {\n    proxy_pass http://127.0.0.1:${hs.httpPort};\n  }\n}\n${derpBlock}`;
}

function buildHeadscaleComposeService(cfg: HeadscaleConfig): string {
  return `  headscale:\n    image: headscale/headscale:stable\n    container_name: ${cfg.containerName}\n    command: ["serve"]\n    restart: unless-stopped\n    ports:\n      - "${cfg.httpPort}:8080"\n      - "${cfg.grpcPort}:50443"\n    environment:\n      HEADSCALE_DATABASE_TYPE: ${cfg.databaseDriver}\n      HEADSCALE_DATABASE_URL: ${cfg.databaseURL}\n      HEADSCALE_API_KEY: ${cfg.apiKey}\n    volumes:\n      - ${cfg.configPath}:/etc/headscale\n      - ${cfg.dataPath}:/var/lib/headscale\n      - ./headscale/run:/var/run/headscale\n      - /usr/share/zoneinfo/${cfg.timezone}:/etc/localtime:ro\n    networks:\n      - private`;
}

function buildDerperComposeService(cfg: DerperConfig): string {
  return `  derper:\n    image: fredliang/derper\n    container_name: ${cfg.containerName}\n    restart: unless-stopped\n    ports:\n      - "${cfg.derpPort}:6060"\n      - "${cfg.stunPort}:3478/udp"\n    environment:\n      DERP_DOMAIN: ${cfg.derpDomain}\n      DERP_ADDR: :6060\n      DERP_REGION_CODE: ${cfg.regionCode}\n      DERP_CERT_MODE: ${cfg.certMode}\n      DERP_VERIFY_CLIENTS: "${String(cfg.verifyClients)}"\n    volumes:\n      - /var/run/tailscale:/var/run/tailscale\n      - /usr/share/zoneinfo/${cfg.timezone}:/etc/localtime:ro\n    networks:\n      - private`;
}

function buildNginxComposeService(proxy: ReverseProxyConfig, timezone: string): string {
  return `  nginx:\n    image: nginx:1.27-alpine\n    container_name: ${proxy.nginxContainerName}\n    restart: unless-stopped\n    ports:\n      - "80:80"\n      - "443:443"\n    volumes:\n      - ./deploy/nginx/conf.d:/etc/nginx/conf.d\n      - ./deploy/nginx/certbot/www:/var/www/certbot\n      - ./deploy/nginx/certbot/conf:/etc/letsencrypt\n      - /usr/share/zoneinfo/${timezone}:/etc/localtime:ro\n    networks:\n      - private`;
}

function buildCertbotComposeService(proxy: ReverseProxyConfig): string {
  return `  certbot:\n    image: certbot/certbot:latest\n    container_name: ${proxy.certbotContainerName}\n    restart: unless-stopped\n    environment:\n      CERTBOT_EMAIL: ${proxy.certbotEmail}\n      CERTBOT_DOMAINS: ${[proxy.panelDomain, proxy.headscaleHost, proxy.derpHost].filter(Boolean).join(',')}\n    command:\n      - sh\n      - -c\n      - >-\n        trap exit TERM;\n        while :; do\n          certbot certonly --webroot -w /var/www/certbot --agree-tos --no-eff-email --email "$CERTBOT_EMAIL" -d "$CERTBOT_DOMAINS" || true;\n          certbot renew --webroot -w /var/www/certbot --quiet || true;\n          sleep 12h & wait $!;\n        done\n    volumes:\n      - ./deploy/nginx/certbot/www:/var/www/certbot\n      - ./deploy/nginx/certbot/conf:/etc/letsencrypt\n    networks:\n      - private`;
}

function buildComposePreview(hs: HeadscaleConfig, derp: DerperConfig, proxy: ReverseProxyConfig, proxyMode: ProxyMode): string {
  const services: string[] = [buildHeadscaleComposeService(hs)];

  if (derp.enabled && derp.autoDeploy) {
    services.push(buildDerperComposeService(derp));
  }

  if (proxyMode === 'built_in') {
    services.push(buildNginxComposeService(proxy, hs.timezone));
    if (proxy.deployCertbot) {
      services.push(buildCertbotComposeService(proxy));
    }
  }

  return `version: "3.9"\nservices:\n${services.join('\n\n')}\n\nnetworks:\n  private:\n    name: private\n    driver: bridge`;
}

function CommandPreview({ code, onCopy }: { code: string; onCopy: (text: string) => void }) {
  return (
    <div className="relative group">
      <pre className="bg-zinc-950 text-zinc-100 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed border border-zinc-800">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 text-zinc-400 hover:text-white hover:bg-zinc-800"
        onClick={() => onCopy(code)}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function statusText(flag: boolean | undefined, labels: { healthy: string; attention: string; unknown: string }): string {
  if (flag === undefined) {
    return labels.unknown;
  }
  return flag ? labels.healthy : labels.attention;
}

export default function Setup() {
  const t = useTranslation();
  const { locale, setLocale } = useI18n();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const draftRef = useRef<SetupDraft>(readSetupDraft());

  const setupProfile = useMemo<'existing' | 'fresh'>(() => {
    const query = new URLSearchParams(search);
    return query.get('profile') === 'existing' ? 'existing' : 'fresh';
  }, [search]);

  const [activeStage, setActiveStage] = useState<Stage>('check');
  const [loading, setLoading] = useState(true);

  const [setupWindowOpen, setSetupWindowOpen] = useState(true);
  const [setupWindowDeadline, setSetupWindowDeadline] = useState('');
  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [setupBootstrapToken, setSetupBootstrapToken] = useState(
    () => sessionStorage.getItem('setup.bootstrapToken') || draftRef.current.setupBootstrapToken || '',
  );
  const [userCount, setUserCount] = useState(0);

  const [manageExistingMode, setManageExistingMode] = useState(() => setupProfile === 'existing');

  const [adminForm, setAdminForm] = useState(
    () => draftRef.current.adminForm || { username: '', password: '', email: '' },
  );
  const [adminResetMode, setAdminResetMode] = useState(false);
  const [hsCfg, setHsCfg] = useState<HeadscaleConfig>(() => ({
    ...defaultHeadscale,
    ...draftRef.current.hsCfg,
  }));
  const [derpCfg, setDerpCfg] = useState<DerperConfig>(() => ({
    ...defaultDerper,
    ...draftRef.current.derpCfg,
  }));
  const [proxyCfg, setProxyCfg] = useState<ReverseProxyConfig>(() => ({
    ...defaultProxy,
    ...draftRef.current.proxyCfg,
  }));
  const [proxyMode, setProxyMode] = useState<ProxyMode>(() => {
    const mode = draftRef.current.proxyMode;
    return mode === 'none' || mode === 'built_in' || mode === 'external' ? mode : 'built_in';
  });

  const [preflight, setPreflight] = useState<SetupPreflightResponse | null>(null);
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [derpExpanded, setDerpExpanded] = useState(true);
  const [proxyExpanded, setProxyExpanded] = useState(true);

  const [deployStatus, setDeployStatus] = useState<DeployStatus>('idle');
  const [deployLog, setDeployLog] = useState<ProgressLine[]>([]);
  const [provisionPhase, setProvisionPhase] = useState<ProvisionPhase>('idle');
  const [phaseText, setPhaseText] = useState('');

  // Connectivity check state
  const [connectivityChecking, setConnectivityChecking] = useState(false);
  const [connectivityResults, setConnectivityResults] = useState<Array<{
    name: string; address: string; reachable: boolean; detail: string;
  }>>([]);
  const [connectivityPassed, setConnectivityPassed] = useState(false);

  // Generated compose state
  const [generatedCompose, setGeneratedCompose] = useState('');
  const [composeGenerating, setComposeGenerating] = useState(false);

  const [composePath, setComposePath] = useState('');
  const [nginxConfigPath, setNginxConfigPath] = useState('');
  const [nginxConfigContent, setNginxConfigContent] = useState('');
  const [proxyTargets, setProxyTargets] = useState<string[]>([]);

  const [deployed, setDeployed] = useState({
    headscale: false,
    derper: false,
    nginx: false,
    certbot: false,
    admin: false,
  });

  const preflightHydratedRef = useRef(false);

  useEffect(() => {
    setManageExistingMode(setupProfile === 'existing');
  }, [setupProfile]);

  useEffect(() => {
    sessionStorage.setItem('setup.bootstrapToken', setupBootstrapToken.trim());
    const draft: SetupDraft = {
      adminForm,
      hsCfg,
      derpCfg,
      proxyCfg,
      proxyMode,
      setupBootstrapToken: setupBootstrapToken.trim(),
    };
    localStorage.setItem(setupDraftStorageKey, JSON.stringify(draft));
  }, [adminForm, derpCfg, hsCfg, proxyCfg, proxyMode, setupBootstrapToken]);

  const buildSetupHeaders = useCallback(
    (extra?: Record<string, string>): Record<string, string> => {
      const headers: Record<string, string> = {};
      if (setupBootstrapToken.trim()) {
        headers['X-Setup-Bootstrap-Token'] = setupBootstrapToken.trim();
      }
      if (extra) {
        Object.assign(headers, extra);
      }
      return headers;
    },
    [setupBootstrapToken],
  );

  const refreshSetupStatus = useCallback(async (): Promise<SetupStatusResponse> => {
    const status = (await api.get('/setup/status', {
      headers: buildSetupHeaders(),
    })) as SetupStatusResponse;

    if (status.initialized) {
      setLocation('/login');
      return status;
    }

    setSetupWindowOpen(Boolean(status.setup_window_open));
    setSetupWindowDeadline(String(status.setup_window_deadline || ''));
    setBootstrapConfigured(Boolean(status.bootstrap_configured));
    setUserCount(Number(status.user_count || 0));

    return status;
  }, [buildSetupHeaders, setLocation]);

  const hydrateFromPreflight = useCallback((data: SetupPreflightResponse) => {
    if (preflightHydratedRef.current) {
      return;
    }
    if (setupProfile !== 'existing') {
      preflightHydratedRef.current = true;
      return;
    }

    const hints = data.config_hints;
    const deployment = data.deployment;

    if (hints?.panel_domain || hints?.headscale_host || hints?.derp_host) {
      setProxyCfg((prev) => ({
        ...prev,
        panelDomain: hints.panel_domain || prev.panelDomain,
        headscaleHost: hints.headscale_host || prev.headscaleHost,
        derpHost: hints.derp_host || prev.derpHost,
      }));
    }

    if (deployment?.headscale_detected) {
      setHsCfg((prev) => ({
        ...prev,
        containerName: deployment.headscale?.container_name || prev.containerName,
        httpPort: deployment.headscale?.http_port ? String(deployment.headscale.http_port) : prev.httpPort,
        grpcPort: deployment.headscale?.grpc_port ? String(deployment.headscale.grpc_port) : prev.grpcPort,
      }));
    }

    if (deployment?.derp_detected) {
      setDerpCfg((prev) => ({
        ...prev,
        enabled: true,
        autoDeploy: false,
        containerName: deployment.derp?.container_name || prev.containerName,
        derpPort: deployment.derp?.derp_port ? String(deployment.derp.derp_port) : prev.derpPort,
        stunPort: deployment.derp?.stun_port ? String(deployment.derp.stun_port) : prev.stunPort,
      }));
      setDerpExpanded(true);
    }

    if (deployment?.nginx_detected) {
      setProxyMode('built_in');
      setProxyExpanded(true);
    }

    preflightHydratedRef.current = true;
  }, [setupProfile]);

  const runPreflight = useCallback(async () => {
    setPreflightRunning(true);
    try {
      const data = (await api.post(
        '/setup/preflight',
        {
          panel_domain: proxyCfg.panelDomain,
          headscale_host: proxyCfg.headscaleHost,
          derp_host: derpCfg.enabled ? proxyCfg.derpHost : '',
          backend_port: hsCfg.listenAddress.split(':').pop() || '',
          headscale_port: hsCfg.httpPort,
          headscale_grpc_port: hsCfg.grpcPort,
          derp_port: derpCfg.derpPort,
          derp_stun_port: derpCfg.stunPort,
          skip_network_checks: true,
          skip_docker: setupProfile === 'existing',
        },
        {
          headers: buildSetupHeaders(),
        },
      )) as SetupPreflightResponse;

      setPreflight(data);
      if (Boolean(data.bootstrap_configured)) {
        setBootstrapConfigured(true);
      }
      hydrateFromPreflight(data);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t.common.errors.operationFailed));
    } finally {
      setPreflightRunning(false);
    }
  }, [buildSetupHeaders, derpCfg.derpPort, derpCfg.enabled, derpCfg.stunPort, hsCfg.grpcPort, hsCfg.httpPort, hsCfg.listenAddress, hydrateFromPreflight, proxyCfg.derpHost, proxyCfg.headscaleHost, proxyCfg.panelDomain, setupProfile, t.common.errors.operationFailed]);

  // Connectivity check (for existing config mode - skip Docker, only test Headscale reachability)
  const runConnectivityCheck = useCallback(async () => {
    setConnectivityChecking(true);
    setConnectivityResults([]);
    try {
      const data = (await api.post(
        '/setup/connectivity-check',
        {
          headscale_http_addr: `127.0.0.1:${hsCfg.httpPort || '28080'}`,
          headscale_grpc_addr: `127.0.0.1:${hsCfg.grpcPort || '28081'}`,
          api_key: hsCfg.apiKey,
        },
        { headers: buildSetupHeaders() },
      )) as { checks?: Array<{ name: string; address: string; reachable: boolean; detail: string }>; all_reachable?: boolean };

      const checks = Array.isArray(data.checks) ? data.checks : [];
      setConnectivityResults(checks);
      const passed = Boolean(data.all_reachable);
      setConnectivityPassed(passed);
      if (passed) {
        toast.success(t.setup.connectionSuccess);
      } else {
        toast.error(t.setup.connectionFailed);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t.common.errors.operationFailed));
    } finally {
      setConnectivityChecking(false);
    }
  }, [buildSetupHeaders, hsCfg.httpPort, hsCfg.grpcPort, hsCfg.apiKey, t]);

  // Generate compose file (when Docker not available)
  const generateComposeFromConfig = useCallback(async () => {
    setComposeGenerating(true);
    try {
      const data = (await api.post(
        '/setup/generate-compose',
        {
          headscale_container_name: hsCfg.containerName,
          headscale_http_port: hsCfg.httpPort,
          headscale_grpc_port: hsCfg.grpcPort,
          headscale_config_path: hsCfg.configPath,
          headscale_data_path: hsCfg.dataPath,
          headscale_timezone: hsCfg.timezone,
          headscale_db_driver: hsCfg.databaseDriver,
          headscale_db_url: hsCfg.databaseURL,
          headscale_api_key: hsCfg.apiKey,
          derp_enabled: derpCfg.enabled && derpCfg.autoDeploy,
          derp_container_name: derpCfg.containerName,
          derp_domain: derpCfg.derpDomain,
          derp_port: derpCfg.derpPort,
          stun_port: derpCfg.stunPort,
          derp_region_code: derpCfg.regionCode,
          derp_cert_mode: derpCfg.certMode,
          derp_verify_clients: derpCfg.verifyClients,
          proxy_mode: proxyMode,
          nginx_container_name: proxyCfg.nginxContainerName,
          panel_domain: proxyCfg.panelDomain,
          headscale_host: proxyCfg.headscaleHost,
          derp_host: proxyCfg.derpHost,
          deploy_certbot: proxyCfg.deployCertbot,
          certbot_container_name: proxyCfg.certbotContainerName,
          certbot_email: proxyCfg.certbotEmail,
          write_file: false,
        },
        { headers: buildSetupHeaders() },
      )) as { compose_content?: string; compose_path?: string };

      const content = data.compose_content || '';
      setGeneratedCompose(content);
      setComposePath(String(data.compose_path || ''));
      toast.success(t.setup.composeGenerated);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t.common.errors.operationFailed));
    } finally {
      setComposeGenerating(false);
    }
  }, [buildSetupHeaders, hsCfg, derpCfg, proxyMode, proxyCfg, t]);

  const dockerAvailable = useMemo(() => {
    return Boolean(preflight?.health?.docker_available ?? preflight?.docker?.ok);
  }, [preflight]);

  useEffect(() => {
    refreshSetupStatus()
      .then(() => runPreflight())
      .catch(() => {
        setSetupWindowOpen(false);
      })
      .finally(() => setLoading(false));
    // Initial bootstrap only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSetupToken = useCallback(
    async (purpose: 'init' | 'deploy'): Promise<string> => {
      if (bootstrapConfigured && !setupBootstrapToken.trim()) {
        throw new Error(t.setup.bootstrapRequired);
      }

      const status = await refreshSetupStatus();
      if (status.initialized) {
        throw new Error(t.setup.systemAlreadyInitialized);
      }
      if (!status.setup_window_open) {
        throw new Error(
          status.setup_window_deadline
            ? `${t.setup.setupWindowClosed} (${status.setup_window_deadline})`
            : t.setup.setupWindowClosed,
        );
      }

      const field = purpose === 'init' ? 'init_token' : 'deploy_token';
      const tokenValue = status[field];
      const token = typeof tokenValue === 'string' ? tokenValue : '';
      if (!token) {
        throw new Error(purpose === 'init' ? t.setup.missingInitToken : t.setup.missingDeployToken);
      }
      return token;
    },
    [bootstrapConfigured, refreshSetupStatus, setupBootstrapToken, t.setup],
  );

  const copyToClipboard = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text);
      toast.success(t.topology.copiedToClipboard);
    },
    [t],
  );

  const updateHS = (patch: Partial<HeadscaleConfig>) => setHsCfg((prev) => ({ ...prev, ...patch }));
  const updateDerp = (patch: Partial<DerperConfig>) => setDerpCfg((prev) => ({ ...prev, ...patch }));
  const updateProxy = (patch: Partial<ReverseProxyConfig>) => setProxyCfg((prev) => ({ ...prev, ...patch }));

  const applyProxyMode = (mode: ProxyMode) => {
    setProxyMode(mode);
    if (mode === 'built_in') {
      setProxyExpanded(true);
    }
  };

  const composePreview = useMemo(() => buildComposePreview(hsCfg, derpCfg, proxyCfg, proxyMode), [derpCfg, hsCfg, proxyCfg, proxyMode]);

  const existingSystem = useMemo(() => {
    return Boolean(preflight?.deployment?.deployed || preflight?.has_existing_config);
  }, [preflight?.deployment?.deployed, preflight?.has_existing_config]);

  const preflightConfigured = useMemo(() => {
    if (!preflight) {
      return false;
    }
    // When using existing config, Docker is not required — connectivity or existing files suffice
    if (setupProfile === 'existing') {
      return connectivityPassed || Boolean(preflight.has_existing_config) || Boolean(preflight.deployment?.deployed);
    }
    return Boolean(preflight.health?.docker_available ?? preflight.docker?.ok);
  }, [preflight, setupProfile, connectivityPassed]);

  const adminLocked = manageExistingMode && !adminResetMode;

  const coreConfigured = useMemo(() => {
    if (!hsCfg.containerName.trim() || !hsCfg.httpPort.trim() || !hsCfg.grpcPort.trim() || !hsCfg.apiKey.trim()) {
      return false;
    }
    if (hsCfg.databaseDriver === 'postgres' && !hsCfg.databaseURL.trim()) {
      return false;
    }
    if (!adminLocked) {
      if (!adminForm.username.trim() || !adminForm.password.trim()) {
        return false;
      }
    }
    return true;
  }, [adminForm.password, adminForm.username, adminLocked, hsCfg.apiKey, hsCfg.containerName, hsCfg.databaseDriver, hsCfg.databaseURL, hsCfg.grpcPort, hsCfg.httpPort]);

  const networkConfigured = useMemo(() => {
    if (!proxyCfg.panelDomain.trim() || !proxyCfg.headscaleHost.trim()) {
      return false;
    }
    if (derpCfg.enabled) {
      if (!derpCfg.derpDomain.trim() || !derpCfg.derpPort.trim() || !derpCfg.stunPort.trim()) {
        return false;
      }
      if (!proxyCfg.derpHost.trim()) {
        return false;
      }
    }
    if (proxyMode === 'built_in' && proxyCfg.deployCertbot && !proxyCfg.certbotEmail.trim()) {
      return false;
    }
    return true;
  }, [derpCfg.derpDomain, derpCfg.derpPort, derpCfg.enabled, derpCfg.stunPort, proxyCfg.certbotEmail, proxyCfg.deployCertbot, proxyCfg.derpHost, proxyCfg.headscaleHost, proxyCfg.panelDomain, proxyMode]);

  const provisionConfigured = deployStatus === 'success';

  const stageOrder: Array<{ key: Stage; label: string; subtitle: string; icon: LucideIcon }> = [
    { key: 'check', label: t.setup.stageCheck, subtitle: t.setup.stageCheckSub, icon: Activity },
    { key: 'controller', label: t.setup.stageController, subtitle: t.setup.stageControllerSub, icon: Shield },
    { key: 'network', label: t.setup.stageNetwork, subtitle: t.setup.stageNetworkSub, icon: Network },
    { key: 'provision', label: t.setup.stageProvision, subtitle: t.setup.stageProvisionSub, icon: PlayCircle },
  ];

  const stageConfigured: Record<Stage, boolean> = {
    check: preflightConfigured,
    controller: coreConfigured,
    network: networkConfigured,
    provision: provisionConfigured,
  };

  const stageIndex = useMemo<Record<Stage, number>>(
    () => ({
      check: 0,
      controller: 1,
      network: 2,
      provision: 3,
    }),
    [],
  );

  const linearCompletedCount = useMemo(() => {
    let count = 0;
    for (const stage of stageOrder) {
      if (stageConfigured[stage.key]) {
        count += 1;
        continue;
      }
      break;
    }
    return count;
  }, [stageConfigured, stageOrder]);

  const stageStatus = useMemo<Record<Stage, StageStatus>>(() => {
    const status: Record<Stage, StageStatus> = {
      check: 'pending',
      controller: 'pending',
      network: 'pending',
      provision: 'pending',
    };

    stageOrder.forEach((stage, idx) => {
      if (activeStage === stage.key) {
        status[stage.key] = 'processing';
      } else if (idx < linearCompletedCount) {
        status[stage.key] = 'configured';
      } else {
        status[stage.key] = 'pending';
      }
    });

    return status;
  }, [activeStage, linearCompletedCount, stageOrder]);

  const progressValue = useMemo(() => {
    return Math.round((linearCompletedCount / stageOrder.length) * 100);
  }, [linearCompletedCount, stageOrder.length]);

  const canEnterStage = useCallback((target: Stage): boolean => {
    const targetIndex = stageIndex[target];
    const activeIndex = stageIndex[activeStage];

    if (targetIndex < linearCompletedCount) {
      return true;
    }
    if (targetIndex <= activeIndex) {
      return true;
    }
    if (targetIndex !== activeIndex + 1) {
      return false;
    }
    return stageConfigured[stageOrder[activeIndex].key];
  }, [activeStage, linearCompletedCount, stageConfigured, stageIndex, stageOrder]);

  const jumpToStage = (target: Stage) => {
    if (!canEnterStage(target)) {
      toast.error(t.setup.completePrevious);
      return;
    }
    setActiveStage(target);
  };

  const generateComposeFile = useCallback(async () => {
    setProvisionPhase('generating');
    setPhaseText(t.setup.phaseGeneratingConfig);

    const setupDeployToken = await fetchSetupToken('deploy');
    const data = (await api.post(
      '/setup/compose',
      {
        content: composePreview,
        write_file: true,
      },
      {
        headers: buildSetupHeaders({
          'X-Setup-Deploy-Token': setupDeployToken,
          'X-Setup-Token': setupDeployToken,
        }),
      },
    )) as {
      compose_path?: string;
    };

    setComposePath(String(data.compose_path || ''));
  }, [buildSetupHeaders, composePreview, fetchSetupToken, t.setup.phaseGeneratingConfig]);

  const requestReverseProxyConfig = useCallback(async () => {
    const setupDeployToken = await fetchSetupToken('deploy');

    const enableCertbot = proxyMode === 'built_in' && proxyCfg.deployCertbot;
    const data = (await api.post(
      '/setup/reverse-proxy/config',
      {
        panel_domain: proxyCfg.panelDomain,
        headscale_host: proxyCfg.headscaleHost,
        derp_host: derpCfg.enabled ? proxyCfg.derpHost : '',
        headscale_port: hsCfg.httpPort,
        derp_port: derpCfg.enabled ? derpCfg.derpPort : '',
        derp_stun_port: derpCfg.enabled ? derpCfg.stunPort : '',
        enable_certbot: enableCertbot,
        write_file: true,
      },
      {
        headers: buildSetupHeaders({
          'X-Setup-Deploy-Token': setupDeployToken,
          'X-Setup-Token': setupDeployToken,
        }),
      },
    )) as {
      config_path?: string;
      nginx_config?: string;
      proxy_targets?: string[];
    };

    setNginxConfigPath(String(data.config_path || ''));
    setNginxConfigContent(String(data.nginx_config || ''));
    setProxyTargets(Array.isArray(data.proxy_targets) ? data.proxy_targets : []);
  }, [buildSetupHeaders, derpCfg.derpPort, derpCfg.enabled, derpCfg.stunPort, fetchSetupToken, hsCfg.httpPort, proxyCfg.derpHost, proxyCfg.deployCertbot, proxyCfg.headscaleHost, proxyCfg.panelDomain, proxyMode]);

  const deployOneService = useCallback(
    async (label: string, payload: Record<string, unknown>) => {
      const setupDeployToken = await fetchSetupToken('deploy');
      const data = (await api.post('/setup/deploy', payload, {
        headers: buildSetupHeaders({
          'X-Setup-Deploy-Token': setupDeployToken,
          'X-Setup-Token': setupDeployToken,
        }),
      })) as {
        progress?: Array<{ step?: string; message?: string; error?: string }>;
      };

      const progress = Array.isArray(data.progress) ? data.progress : [];
      setDeployLog((prev) => [
        ...prev,
        ...progress.map((p) => ({
          step: p.step || 'progress',
          message: `[${label}] ${p.message || ''}`,
          error: p.error || undefined,
        })),
      ]);
    },
    [buildSetupHeaders, fetchSetupToken],
  );

  const buildHeadscaleDeployRequest = useCallback(() => {
    return {
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
      env: {
        HEADSCALE_DATABASE_TYPE: hsCfg.databaseDriver,
        HEADSCALE_DATABASE_URL: hsCfg.databaseURL,
        HEADSCALE_API_KEY: hsCfg.apiKey,
      },
      command: ['serve'],
      network_name: 'private',
      restart_policy: 'unless-stopped',
    };
  }, [hsCfg]);

  const buildDerpDeployRequest = useCallback(() => {
    return {
      image: 'fredliang/derper',
      container_name: derpCfg.containerName,
      ports: {
        [derpCfg.derpPort]: '6060',
        [`${derpCfg.stunPort}/udp`]: '3478',
      },
      volumes: {
        '/var/run/tailscale': '/var/run/tailscale',
        [`/usr/share/zoneinfo/${derpCfg.timezone}`]: '/etc/localtime',
      },
      env: {
        DERP_DOMAIN: derpCfg.derpDomain,
        DERP_ADDR: ':6060',
        DERP_REGION_CODE: derpCfg.regionCode,
        DERP_CERT_MODE: derpCfg.certMode,
        DERP_VERIFY_CLIENTS: String(derpCfg.verifyClients),
      },
      network_name: 'private',
      restart_policy: 'unless-stopped',
    };
  }, [derpCfg]);

  const buildNginxDeployRequest = useCallback(() => {
    return {
      image: 'nginx:1.27-alpine',
      container_name: proxyCfg.nginxContainerName,
      ports: {
        '80': '80',
        '443': '443',
      },
      volumes: {
        './deploy/nginx/conf.d': '/etc/nginx/conf.d',
        './deploy/nginx/certbot/www': '/var/www/certbot',
        './deploy/nginx/certbot/conf': '/etc/letsencrypt',
        [`/usr/share/zoneinfo/${hsCfg.timezone}`]: '/etc/localtime',
      },
      network_name: 'private',
      restart_policy: 'unless-stopped',
    };
  }, [hsCfg.timezone, proxyCfg.nginxContainerName]);

  const buildCertbotDeployRequest = useCallback(() => {
    const domains = [proxyCfg.panelDomain, proxyCfg.headscaleHost, derpCfg.enabled ? proxyCfg.derpHost : '']
      .map((d) => d.trim())
      .filter(Boolean)
      .join(',');

    return {
      image: 'certbot/certbot:latest',
      container_name: proxyCfg.certbotContainerName,
      volumes: {
        './deploy/nginx/certbot/www': '/var/www/certbot',
        './deploy/nginx/certbot/conf': '/etc/letsencrypt',
      },
      env: {
        CERTBOT_EMAIL: proxyCfg.certbotEmail,
        CERTBOT_DOMAINS: domains,
      },
      command: [
        'sh',
        '-c',
        'trap exit TERM; while :; do certbot certonly --webroot -w /var/www/certbot --agree-tos --no-eff-email --email "$CERTBOT_EMAIL" -d "$CERTBOT_DOMAINS" || true; certbot renew --webroot -w /var/www/certbot --quiet || true; sleep 12h & wait $!; done',
      ],
      network_name: 'private',
      restart_policy: 'unless-stopped',
    };
  }, [derpCfg.enabled, proxyCfg.certbotContainerName, proxyCfg.certbotEmail, proxyCfg.derpHost, proxyCfg.headscaleHost, proxyCfg.panelDomain]);

  const runProvision = useCallback(async () => {
    if (!coreConfigured || !networkConfigured) {
      toast.error(t.setup.completePrevious);
      return;
    }

    if (!setupWindowOpen) {
      toast.error(t.setup.setupWindowClosed);
      return;
    }

    const deployedState = {
      headscale: false,
      derper: false,
      nginx: false,
      certbot: false,
      admin: false,
    };

    setDeployStatus('deploying');
    setProvisionPhase('generating');
    setPhaseText(t.setup.phaseGeneratingConfig);
    setDeployLog([]);

    try {
      await generateComposeFile();
      await requestReverseProxyConfig();

      setProvisionPhase('pulling');
      setPhaseText(t.setup.phasePullingImages);
      await deployOneService(t.setup.serviceHeadscale, buildHeadscaleDeployRequest());
      deployedState.headscale = true;

      setProvisionPhase('starting');
      setPhaseText(t.setup.phaseStartingContainer);

      if (derpCfg.enabled && derpCfg.autoDeploy) {
        await deployOneService(t.setup.serviceDerp, buildDerpDeployRequest());
        deployedState.derper = true;
      }

      if (proxyMode === 'built_in') {
        await deployOneService(t.setup.serviceNginx, buildNginxDeployRequest());
        deployedState.nginx = true;
        if (proxyCfg.deployCertbot) {
          await deployOneService(t.setup.serviceCertbot, buildCertbotDeployRequest());
          deployedState.certbot = true;
        }
      }

      setProvisionPhase('finalizing');
      setPhaseText(t.setup.phaseFinalizing);

      if (!adminLocked) {
        const setupInitToken = await fetchSetupToken('init');
        await api.post('/setup/init', adminForm, {
          headers: buildSetupHeaders({
            'X-Setup-Init-Token': setupInitToken,
            'X-Setup-Token': setupInitToken,
          }),
        });
        deployedState.admin = true;
      }

      setDeployed(deployedState);
      setProvisionPhase('done');
      setPhaseText(t.setup.phaseProvisionCompleted);
      setDeployStatus('success');
      toast.success(t.setup.provisionCompleted);
    } catch (err: unknown) {
      const message = getErrorMessage(err, t.setup.provisionFailed);
      setDeployStatus('error');
      setProvisionPhase('error');
      setPhaseText(message);
      setDeployLog((prev) => [...prev, { step: 'error', message, error: message }]);
      toast.error(message);
    }
  }, [adminForm, adminLocked, buildCertbotDeployRequest, buildDerpDeployRequest, buildHeadscaleDeployRequest, buildNginxDeployRequest, buildSetupHeaders, coreConfigured, deployOneService, derpCfg.autoDeploy, derpCfg.enabled, fetchSetupToken, generateComposeFile, networkConfigured, proxyCfg.deployCertbot, proxyMode, requestReverseProxyConfig, setupWindowOpen, t.setup]);

  const pendingChanges = useMemo(() => {
    const currentHeadscale = preflight?.deployment?.headscale_detected
      ? `${preflight.deployment?.headscale?.container_name || 'headscale'} ${t.setup.running}`
      : t.setup.noContainer;

    const currentDerp = preflight?.deployment?.derp_detected
      ? `${preflight.deployment?.derp?.container_name || 'derper'} ${t.setup.running}`
      : t.setup.notEnabled;

    const currentProxy = preflight?.deployment?.nginx_detected ? t.setup.builtInNginx : t.setup.noBuiltInProxy;

    return [
      {
        name: t.setup.headscaleController,
        current: currentHeadscale,
        target: `Deploy ${hsCfg.containerName} (${hsCfg.httpPort}/${hsCfg.grpcPort})`,
      },
      {
        name: t.setup.derpRelay,
        current: currentDerp,
        target: derpCfg.enabled ? (derpCfg.autoDeploy ? `${t.setup.enable} ${derpCfg.containerName}` : t.setup.managedExternally) : t.setup.disabled,
      },
      {
        name: t.setup.reverseProxyLabel,
        current: currentProxy,
        target: proxyMode === 'built_in' ? t.setup.builtInNginx : proxyMode === 'external' ? t.setup.managedExternally : t.setup.none,
      },
      {
        name: t.setup.administratorLabel,
        current: manageExistingMode ? t.setup.existingAccount : t.setup.pending,
        target: adminLocked ? t.setup.keepExistingAccount : `${t.setup.createOrUpdate} ${adminForm.username || 'admin'}`,
      },
    ];
  }, [adminForm.username, adminLocked, derpCfg.autoDeploy, derpCfg.containerName, derpCfg.enabled, hsCfg.containerName, hsCfg.grpcPort, hsCfg.httpPort, manageExistingMode, preflight?.deployment?.derp?.container_name, preflight?.deployment?.derp_detected, preflight?.deployment?.headscale?.container_name, preflight?.deployment?.headscale_detected, preflight?.deployment?.nginx_detected, proxyMode, t.setup]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLOR_BG }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLOR_BLUE }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: COLOR_BG,
        backgroundImage:
          'radial-gradient(circle at 10% -10%, rgba(0,92,255,0.12), transparent 45%), radial-gradient(circle at 90% 120%, rgba(2,132,199,0.12), transparent 35%)',
      }}
    >
      <div className="mx-auto max-w-[1400px] p-4 md:p-6">
        <div className="mb-3 flex justify-end">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            {Object.entries(locales).map(([code, meta]) => (
              <option key={code} value={code}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          <aside
            className="rounded-2xl p-5 md:p-6 sticky top-4 h-fit border border-slate-700/50 shadow-[0_16px_40px_rgba(2,6,23,0.30)]"
            style={{
              background:
                'linear-gradient(165deg, #0F172A 0%, #1E293B 100%)',
              color: '#E2E8F0',
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #006FFF, #3B82F6)' }}>
                <Activity className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white tracking-tight">{t.setup.consoleTitle}</p>
                <p className="text-[11px] text-slate-400">{t.setup.consoleSubtitle}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{t.setup.progress}</p>
                <span className="text-xs font-semibold text-blue-400">{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-1.5 bg-slate-700/60" />
            </div>

            <div className="mt-5 space-y-1.5">
              {stageOrder.map((stage, idx) => {
                const Icon = stage.icon;
                const status = stageStatus[stage.key];
                const locked = !canEnterStage(stage.key);
                const isActive = activeStage === stage.key;
                const statusLabel = getStageStatusLabel(status, locked, t.setup);
                const statusTone = status === 'configured'
                  ? 'text-emerald-400'
                  : status === 'processing'
                    ? 'text-blue-400'
                    : 'text-slate-500';

                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => jumpToStage(stage.key)}
                    className={`w-full rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ${
                      isActive
                        ? 'border-blue-400/40 bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.15),0_0_20px_rgba(0,111,255,0.06)]'
                        : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600/60 hover:bg-slate-800/50'
                    }`}
                    disabled={locked}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 relative h-4 w-4 shrink-0">
                        <span
                          className="absolute inset-0 rounded-full border-2"
                          style={{
                            borderColor: status === 'configured' ? COLOR_STATUS_GREEN : isActive ? COLOR_BLUE : '#64748B',
                            backgroundColor: status === 'configured' ? 'rgba(16,185,129,0.25)' : isActive ? 'rgba(0,92,255,0.25)' : 'rgba(100,116,139,0.2)',
                          }}
                        />
                        {status === 'configured' ? (
                          <Check className="absolute inset-0 m-auto h-3 w-3" style={{ color: COLOR_STATUS_GREEN }} />
                        ) : locked ? (
                          <Lock className="absolute inset-0 m-auto h-3 w-3 text-slate-400" />
                        ) : (
                          <span className="absolute inset-0 m-auto block h-1.5 w-1.5 rounded-full bg-blue-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white truncate">{`${idx + 1}. ${stage.label}`}</p>
                          <span className={`text-[11px] font-medium ${statusTone}`}>{statusLabel}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{stage.subtitle}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="space-y-5">
            {activeStage === 'check' && (
              <Card className={`${CARD_BASE_CLASS} p-6 md:p-7`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{t.setup.checkTitle}</h2>
                    <p className="text-sm text-slate-500 mt-1">{t.setup.checkDesc}</p>
                  </div>
                  <Badge
                    style={{
                      backgroundColor: existingSystem ? 'rgba(16,185,129,0.12)' : 'rgba(0,92,255,0.12)',
                      color: existingSystem ? COLOR_STATUS_GREEN : COLOR_BLUE,
                    }}
                  >
                    {existingSystem ? t.setup.systemOnline : t.setup.readyToSetup}
                  </Badge>
                </div>

                {bootstrapConfigured && (
                  <div className={`mt-4 p-3 ${CARD_INNER_CLASS}`}>
                    <Label>{t.setup.bootstrapCredential}</Label>
                    <Input
                      className="mt-1"
                      placeholder="X-Setup-Bootstrap-Token"
                      type="password"
                      value={setupBootstrapToken}
                      onChange={(e) => setSetupBootstrapToken(e.target.value)}
                    />
                    <p className="text-xs text-slate-500 mt-1">{t.setup.bootstrapHint}</p>
                  </div>
                )}

                {!setupWindowOpen && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs p-3">
                    {t.setup.setupWindowClosed}{setupWindowDeadline ? ` (${setupWindowDeadline})` : ''}.
                  </div>
                )}

                {setupProfile === 'existing' ? (
                  /* ── Existing Config Mode: Connectivity Check (no Docker) ── */
                  <>
                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Wifi className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-800">{t.setup.connectivityCheck}</span>
                      </div>
                      <p className="text-xs text-blue-600/80">{t.setup.connectivityCheckDesc}</p>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-blue-700">{t.setup.headscaleHTTPAddr}</Label>
                          <Input
                            className="mt-1 border-blue-200 bg-white"
                            value={`127.0.0.1:${hsCfg.httpPort || '28080'}`}
                            disabled
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-blue-700">{t.setup.headscaleGRPCAddr}</Label>
                          <Input
                            className="mt-1 border-blue-200 bg-white"
                            value={`127.0.0.1:${hsCfg.grpcPort || '28081'}`}
                            disabled
                          />
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 border-blue-300 text-blue-700 hover:bg-blue-100"
                        onClick={runConnectivityCheck}
                        disabled={connectivityChecking}
                      >
                        {connectivityChecking ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{t.setup.testing}</>
                        ) : (
                          <><Network className="h-3.5 w-3.5 mr-1.5" />{t.setup.testConnectivity}</>
                        )}
                      </Button>

                      {connectivityResults.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {connectivityResults.map((r) => (
                            <div key={r.name} className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${
                              r.reachable
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-red-200 bg-red-50 text-red-600'
                            }`}>
                              {r.reachable ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                              <span className="font-medium">{r.name}</span>
                              <span className="text-slate-500">{r.address}</span>
                              <span className="ml-auto">{r.reachable ? t.setup.reachable : t.setup.unreachable}</span>
                            </div>
                          ))}
                          <div className={`rounded-lg p-2 text-xs font-medium ${
                            connectivityPassed
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-600 border border-red-200'
                          }`}>
                            {connectivityPassed ? t.setup.allReachable : t.setup.someUnreachable}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      <Server className="h-3.5 w-3.5 inline mr-1" />
                      {t.setup.skipDockerHint}
                    </div>
                  </>
                ) : (
                  /* ── Fresh Setup Mode: Docker Detection ── */
                  <>
                    <div className="mt-5">
                      <Card className={`${CARD_INNER_CLASS} p-4`}>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4" style={{ color: COLOR_BLUE }} />
                          <span className="text-sm font-medium">{t.setup.docker}</span>
                        </div>
                        <p className="text-xs mt-2 text-slate-600">{statusText(preflight?.health?.docker_available ?? preflight?.docker?.ok, t.setup)}</p>
                        <p className="text-xs text-slate-500 mt-1">{preflight?.health?.docker_detail || preflight?.docker?.detail || '-'}</p>
                      </Card>
                    </div>
                  </>
                )}

                <Card className="mt-4 p-3 border border-slate-200 bg-white rounded-xl">
                  <p className="text-xs font-medium text-slate-600">{t.setup.existingFiles}</p>
                  <p className="text-xs mt-1 text-slate-500">{(preflight?.existing_files || []).join(', ') || t.setup.noExistingFiles}</p>
                </Card>

                {preflight?.has_existing_config && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    {setupProfile === 'existing' ? t.setup.existingConfigUsing : t.setup.existingConfigIgnored}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={runPreflight} disabled={preflightRunning}>
                    {preflightRunning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{t.setup.recheckEnv}
                  </Button>
                  <Button
                    className="ml-auto"
                    style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 10px 22px rgba(0,92,255,0.28)' }}
                    disabled={!preflightConfigured}
                    onClick={() => {
                      setManageExistingMode(setupProfile === 'existing' && existingSystem);
                      jumpToStage('controller');
                    }}
                  >
                    {setupProfile === 'existing' && existingSystem ? t.setup.useExistingConfig : t.setup.setupNewController}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </Card>
            )}

            {activeStage === 'controller' && (
              <Card className={`${CARD_BASE_CLASS} p-6 md:p-7 space-y-6`}>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{t.setup.controllerTitle}</h2>
                  <p className="text-sm text-slate-500 mt-1">{t.setup.controllerDesc}</p>
                </div>

                <Card className={`${CARD_INNER_CLASS} p-4 space-y-3`}>
                  <p className="text-sm font-semibold text-slate-800">{t.setup.networkIdentity}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>{t.setup.publicDomain}</Label>
                      <Input
                        className="mt-1"
                        value={proxyCfg.headscaleHost}
                        onChange={(e) => updateProxy({ headscaleHost: e.target.value })}
                        placeholder="vpn.example.com"
                      />
                    </div>
                    <div>
                      <Label>{t.setup.listenAddress}</Label>
                      <Input
                        className="mt-1"
                        value={hsCfg.listenAddress}
                        onChange={(e) => updateHS({ listenAddress: e.target.value })}
                        placeholder="0.0.0.0:8080"
                      />
                    </div>
                  </div>
                </Card>

                <Card className={`${CARD_INNER_CLASS} p-4 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{t.setup.administrator}</p>
                    {adminLocked && (
                      <button
                        className="text-xs underline text-slate-500 hover:text-slate-700"
                        onClick={() => setAdminResetMode(true)}
                      >
                        {t.setup.resetPassword}
                      </button>
                    )}
                  </div>

                  {adminLocked ? (
                    <div className="rounded border bg-white p-3 text-xs text-slate-600">
                      {t.setup.adminCreatedHint}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>{t.setup.username}</Label>
                      <Input
                        className="mt-1"
                        disabled={adminLocked}
                        value={adminLocked ? '*****' : adminForm.username}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, username: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>{t.setup.password}</Label>
                      <Input
                        className="mt-1"
                        type="password"
                        disabled={adminLocked}
                        value={adminLocked ? '*****' : adminForm.password}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>{t.setup.email}</Label>
                      <Input
                        className="mt-1"
                        type="email"
                        disabled={adminLocked}
                        value={adminLocked ? '*****' : adminForm.email}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  </div>
                </Card>

                <Card className={`${CARD_INNER_CLASS} p-4`}>
                  <p className="text-sm font-semibold text-slate-800 mb-3">{t.setup.headscaleService}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>{t.setup.containerName}</Label>
                      <Input className="mt-1" value={hsCfg.containerName} onChange={(e) => updateHS({ containerName: e.target.value })} />
                    </div>
                    <div>
                      <Label>{t.setup.httpPort}</Label>
                      <Input className="mt-1" value={hsCfg.httpPort} onChange={(e) => updateHS({ httpPort: e.target.value })} />
                    </div>
                    <div>
                      <Label>{t.setup.grpcPort}</Label>
                      <Input className="mt-1" value={hsCfg.grpcPort} onChange={(e) => updateHS({ grpcPort: e.target.value })} />
                    </div>
                    <div>
                      <Label>{t.setup.databaseDriver}</Label>
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={hsCfg.databaseDriver}
                        onChange={(e) => updateHS({ databaseDriver: e.target.value as 'sqlite' | 'postgres' })}
                      >
                        <option value="sqlite">SQLite</option>
                        <option value="postgres">Postgres</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>{t.setup.databaseURL}</Label>
                      <Input className="mt-1" value={hsCfg.databaseURL} onChange={(e) => updateHS({ databaseURL: e.target.value })} />
                    </div>
                    <div className="md:col-span-3">
                      <Label>{t.setup.apiKey}</Label>
                      <div className="mt-1 flex gap-2">
                        <Input className="font-mono" value={hsCfg.apiKey} onChange={(e) => updateHS({ apiKey: e.target.value })} />
                        <Button variant="outline" onClick={() => updateHS({ apiKey: generateRandomToken(40) })}>
                          {t.setup.regenerate}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                <div>
                  <p className="text-xs text-slate-500 mb-2">{t.setup.composePreview}</p>
                  <CommandPreview code={buildHeadscaleComposeService(hsCfg)} onCopy={copyToClipboard} />
                </div>

                <div className="flex justify-end">
                  <Button
                    style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 10px 22px rgba(0,92,255,0.28)' }}
                    disabled={!coreConfigured}
                    onClick={() => jumpToStage('network')}
                  >
                    {t.setup.continueToNetwork}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </Card>
            )}

            {activeStage === 'network' && (
              <Card className={`${CARD_BASE_CLASS} p-6 md:p-7 space-y-6`}>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{t.setup.networkTitle}</h2>
                  <p className="text-sm text-slate-500 mt-1">{t.setup.networkDesc}</p>
                </div>

                <Card className={`${CARD_INNER_CLASS} overflow-hidden`}>
                  <button
                    type="button"
                    className="w-full p-4 flex items-center justify-between"
                    onClick={() => setDerpExpanded((prev) => !prev)}
                  >
                    <div className="flex items-center gap-3">
                      <Switch checked={derpCfg.enabled} onCheckedChange={(checked) => updateDerp({ enabled: checked })} />
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">{t.setup.embeddedDerp}</p>
                        <p className="text-xs text-slate-500">{t.setup.embeddedDerpDesc}</p>
                      </div>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-slate-500" />
                  </button>

                  {derpExpanded && derpCfg.enabled && (
                    <div className="px-4 pb-4 space-y-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={derpCfg.autoDeploy} onChange={(e) => updateDerp({ autoDeploy: e.target.checked })} />
                        {t.setup.autoDeployDerp}
                      </label>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label>{t.setup.container}</Label>
                          <Input className="mt-1" value={derpCfg.containerName} onChange={(e) => updateDerp({ containerName: e.target.value })} />
                        </div>
                        <div>
                          <Label>{t.setup.derpDomain}</Label>
                          <Input className="mt-1" value={derpCfg.derpDomain} onChange={(e) => updateDerp({ derpDomain: e.target.value })} />
                        </div>
                        <div>
                          <Label>{t.setup.regionCode}</Label>
                          <Input className="mt-1" value={derpCfg.regionCode} onChange={(e) => updateDerp({ regionCode: e.target.value })} />
                        </div>
                        <div>
                          <Label>{t.setup.derpPort}</Label>
                          <Input className="mt-1" value={derpCfg.derpPort} onChange={(e) => updateDerp({ derpPort: e.target.value })} />
                        </div>
                        <div>
                          <Label>{t.setup.stunPort}</Label>
                          <Input className="mt-1" value={derpCfg.stunPort} onChange={(e) => updateDerp({ stunPort: e.target.value })} />
                        </div>
                        <div>
                          <Label>{t.setup.certMode}</Label>
                          <select
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={derpCfg.certMode}
                            onChange={(e) => updateDerp({ certMode: e.target.value as 'letsencrypt' | 'manual' })}
                          >
                            <option value="letsencrypt">letsencrypt</option>
                            <option value="manual">manual</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>

                <Card className={`${CARD_INNER_CLASS} overflow-hidden`}>
                  <button
                    type="button"
                    className="w-full p-4 flex items-center justify-between"
                    onClick={() => setProxyExpanded((prev) => !prev)}
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold text-slate-800">{t.setup.reverseProxy}</p>
                      <p className="text-xs text-slate-500">{t.setup.reverseProxyDesc}</p>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-slate-500" />
                  </button>

                  {proxyExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {([
                          { key: 'none', label: t.setup.proxyNone },
                          { key: 'built_in', label: t.setup.proxyBuiltIn },
                          { key: 'external', label: t.setup.proxyExternal },
                        ] as Array<{ key: ProxyMode; label: string }>).map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => applyProxyMode(option.key)}
                            className={`rounded-md border px-3 py-2 text-sm ${proxyMode === option.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label>{t.setup.panelDomain}</Label>
                          <Input className="mt-1" value={proxyCfg.panelDomain} onChange={(e) => updateProxy({ panelDomain: e.target.value })} />
                        </div>
                        <div>
                          <Label>{t.setup.headscaleHost}</Label>
                          <Input className="mt-1" value={proxyCfg.headscaleHost} onChange={(e) => updateProxy({ headscaleHost: e.target.value })} />
                        </div>
                        <div>
                          <Label>{t.setup.derpHost}</Label>
                          <Input className="mt-1" value={proxyCfg.derpHost} onChange={(e) => updateProxy({ derpHost: e.target.value })} disabled={!derpCfg.enabled} />
                        </div>
                      </div>

                      {proxyMode === 'built_in' && (
                        <div className="space-y-2 text-sm">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={proxyCfg.deployCertbot}
                              onChange={(e) => updateProxy({ deployCertbot: e.target.checked })}
                            />
                            {t.setup.enableLetsEncrypt}
                          </label>
                          {proxyCfg.deployCertbot && (
                            <div>
                              <Label>{t.setup.certbotEmail}</Label>
                              <Input className="mt-1" value={proxyCfg.certbotEmail} onChange={(e) => updateProxy({ certbotEmail: e.target.value })} />
                            </div>
                          )}
                        </div>
                      )}

                      {proxyMode === 'external' && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                          {t.setup.externalProxyHint}
                          <div className="mt-2">
                            <CommandPreview code={buildExternalProxySnippet(proxyCfg, hsCfg, derpCfg)} onCopy={copyToClipboard} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                <div>
                  <p className="text-xs text-slate-500 mb-2">{t.setup.connectivityPreview}</p>
                  <CommandPreview code={composePreview} onCopy={copyToClipboard} />
                </div>

                <div className="flex justify-end">
                  <Button
                    style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 10px 22px rgba(0,92,255,0.28)' }}
                    disabled={!networkConfigured}
                    onClick={() => jumpToStage('provision')}
                  >
                    {t.setup.continueToProvision}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </Card>
            )}

            {activeStage === 'provision' && (
              <Card className={`${CARD_BASE_CLASS} p-6 md:p-7 space-y-6`}>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{t.setup.provisionTitle}</h2>
                  <p className="text-sm text-slate-500 mt-1">{t.setup.provisionDesc}</p>
                </div>

                {!setupWindowOpen && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                    {t.setup.setupWindowClosed}{setupWindowDeadline ? ` (${setupWindowDeadline})` : ''}. {t.setup.provisionBlocked}
                  </div>
                )}

                {/* Docker status indicator */}
                <div className={`rounded-xl border p-4 ${
                  dockerAvailable
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-amber-200 bg-amber-50/60'
                }`}>
                  <div className="flex items-center gap-2">
                    <Server className={`h-4 w-4 ${dockerAvailable ? 'text-emerald-600' : 'text-amber-600'}`} />
                    <span className={`text-sm font-semibold ${dockerAvailable ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {dockerAvailable ? t.setup.dockerAvailable : t.setup.dockerNotAvailable}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${dockerAvailable ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {dockerAvailable ? t.setup.dockerAvailableHint : t.setup.dockerNotAvailableHint}
                  </p>
                </div>

                <div className={`${CARD_INNER_CLASS} p-3`}>
                  <p className="text-sm font-semibold text-slate-800 mb-3">{t.setup.pendingChanges}</p>
                  <div className="space-y-2">
                    {pendingChanges.map((item) => (
                      <div key={item.name} className="grid grid-cols-1 md:grid-cols-[180px_1fr_1fr] gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                        <p className="font-semibold text-slate-700">{item.name}</p>
                        <p className="text-slate-500">{t.setup.current}: {item.current}</p>
                        <p className="text-slate-700">{t.setup.target}: {item.target}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-500 mb-2">{t.setup.targetCompose}</p>
                  <CommandPreview code={composePreview} onCopy={copyToClipboard} />
                </div>

                {dockerAvailable ? (
                  /* ── Docker Available: One-Click Deploy ── */
                  <Button
                    className="w-full"
                    size="lg"
                    style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 12px 26px rgba(0,92,255,0.28)' }}
                    disabled={deployStatus === 'deploying' || !setupWindowOpen}
                    onClick={runProvision}
                  >
                    <Rocket className="h-4 w-4 mr-2" />{t.setup.oneClickDeploy}
                  </Button>
                ) : (
                  /* ── Docker Not Available: Generate Compose File ── */
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        size="lg"
                        variant="outline"
                        onClick={generateComposeFromConfig}
                        disabled={composeGenerating}
                      >
                        {composeGenerating ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.setup.generatingCompose}</>
                        ) : (
                          <><FileCode className="h-4 w-4 mr-2" />{t.setup.generateCompose}</>
                        )}
                      </Button>
                    </div>

                    {generatedCompose && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-700">{t.setup.composeContent}</p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(generatedCompose)}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1" />{t.setup.copyCompose}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const blob = new Blob([generatedCompose], { type: 'text/yaml' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'docker-compose.yml';
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                            >
                              <Download className="h-3.5 w-3.5 mr-1" />{t.setup.downloadCompose}
                            </Button>
                          </div>
                        </div>
                        <CommandPreview code={generatedCompose} onCopy={copyToClipboard} />

                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <p className="text-xs text-blue-700 font-medium">{t.setup.manualDeployHint}</p>
                          <div className="mt-2">
                            <CommandPreview code={t.setup.manualDeployCmd} onCopy={copyToClipboard} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Still allow creating admin even without Docker deploy */}
                    {!adminLocked && (
                      <Button
                        className="w-full"
                        size="lg"
                        style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 12px 26px rgba(0,92,255,0.28)' }}
                        disabled={deployStatus === 'deploying' || !setupWindowOpen || !adminForm.username.trim() || !adminForm.password.trim()}
                        onClick={async () => {
                          setDeployStatus('deploying');
                          setProvisionPhase('finalizing');
                          setPhaseText(t.setup.phaseFinalizing);
                          try {
                            const setupInitToken = await fetchSetupToken('init');
                            await api.post('/setup/init', adminForm, {
                              headers: buildSetupHeaders({
                                'X-Setup-Init-Token': setupInitToken,
                                'X-Setup-Token': setupInitToken,
                              }),
                            });
                            setDeployed((prev) => ({ ...prev, admin: true }));
                            setProvisionPhase('done');
                            setPhaseText(t.setup.phaseProvisionCompleted);
                            setDeployStatus('success');
                            toast.success(t.setup.provisionCompleted);
                          } catch (err: unknown) {
                            const message = getErrorMessage(err, t.setup.provisionFailed);
                            setDeployStatus('error');
                            setProvisionPhase('error');
                            setPhaseText(message);
                            toast.error(message);
                          }
                        }}
                      >
                        <Shield className="h-4 w-4 mr-2" />{t.setup.skipToAdmin}
                      </Button>
                    )}
                  </div>
                )}

                {(deployStatus === 'success' || deployStatus === 'error') && (
                  <div className="space-y-3">
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <Card className={`${CARD_INNER_CLASS} p-3`}>{t.setup.composeFile}: {composePath || './deploy/docker-compose.setup.yaml'}</Card>
                      <Card className={`${CARD_INNER_CLASS} p-3`}>{t.setup.nginxConfigFile}: {nginxConfigPath || './deploy/nginx/conf.d/headscale-panel.setup.conf'}</Card>
                    </div>

                    {(proxyMode === 'external' || proxyMode === 'none') && proxyTargets.length > 0 && (
                      <Card className="p-3 border border-amber-200 bg-amber-50 text-xs text-amber-700">
                        <p className="font-semibold mb-1">{t.setup.externalProxyHint}</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {proxyTargets.map((target) => (
                            <li key={target}>{target}</li>
                          ))}
                        </ul>
                      </Card>
                    )}

                    {nginxConfigContent && (
                      <div>
                        <p className="text-xs text-slate-500 mb-2">{t.setup.generatedProxyConfig}</p>
                        <CommandPreview code={nginxConfigContent} onCopy={copyToClipboard} />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <Card className={`${CARD_INNER_CLASS} p-3`}>{t.setup.serviceHeadscale}: {deployed.headscale ? t.setup.deployed : t.setup.skipped}</Card>
                      <Card className={`${CARD_INNER_CLASS} p-3`}>{t.setup.serviceDerp}: {deployed.derper ? t.setup.deployed : derpCfg.enabled ? t.setup.manualExternal : t.setup.disabled}</Card>
                      <Card className={`${CARD_INNER_CLASS} p-3`}>{t.setup.reverseProxyLabel}: {deployed.nginx ? t.setup.builtIn : proxyMode === 'external' ? t.setup.external : t.setup.none}</Card>
                      <Card className={`${CARD_INNER_CLASS} p-3`}>{t.setup.administratorLabel}: {deployed.admin ? t.setup.initialized : adminLocked ? t.setup.keptExisting : t.setup.pending}</Card>
                    </div>

                    <Button className="w-full" variant="outline" onClick={() => setLocation('/login')}>
                      {t.setup.goToLogin}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </main>
        </div>
      </div>

      {deployStatus === 'deploying' && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-2xl bg-white px-8 py-8 text-center shadow-[0_25px_60px_rgba(15,23,42,0.30)] min-w-[320px] max-w-md border border-slate-200/60">
            <div className="relative mx-auto h-16 w-16">
              <span className="absolute inset-0 rounded-full border-4 border-blue-100" />
              <span className="absolute inset-0 rounded-full animate-ping border-4 border-blue-300/60" style={{ animationDuration: '2s' }} />
              <span className="absolute inset-3 rounded-full" style={{ background: 'linear-gradient(135deg, #006FFF, #3B82F6)' }} />
            </div>
            <p className="text-base font-semibold text-slate-900 mt-5">{phaseText || t.setup.provisioning}</p>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{provisionPhase}</p>
            {deployLog.length > 0 && (
              <div className="mt-3 text-left max-h-28 overflow-auto border rounded p-2 text-[11px] text-slate-600 bg-slate-50">
                {deployLog.slice(-5).map((line, idx) => (
                  <div key={`${line.step}-${idx}`} className="truncate">{line.message}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
