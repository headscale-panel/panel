import { locales, useI18n, useTranslation } from '@/i18n/index';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  UserPlus,
  FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { toast } from 'sonner';

type Stage = 'check' | 'controller' | 'network' | 'admin' | 'provision';
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
  enableSSL: boolean;
  sslCertMode: 'certbot' | 'manual';
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
const CARD_BASE_CLASS = 'rounded-xl border bg-card shadow-sm';
const CARD_INNER_CLASS = 'rounded-lg border bg-muted/50';

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
  derpDomain: 'derp1.bokro.cn',
  derpPort: '26060',
  stunPort: '33478',
  regionCode: 'gz_tencent',
  certMode: 'letsencrypt',
  verifyClients: false,
  timezone: 'Asia/Shanghai',
};

const defaultProxy: ReverseProxyConfig = {
  panelDomain: 'panel.bokro.cn',
  headscaleHost: 'hs.bokro.cn',
  derpHost: 'derp1.bokro.cn',
  enableSSL: true,
  sslCertMode: 'certbot',
  deployCertbot: true,
  nginxContainerName: 'headscale-nginx',
  certbotContainerName: 'headscale-certbot',
  certbotEmail: '',
};

interface SetupDraft {
  adminForm?: { username: string; password: string; email: string };
  hsCfg?: HeadscaleConfig;
  derpCfg?: DerperConfig;
  proxyCfg?: ReverseProxyConfig;
  proxyMode?: ProxyMode;
  existingHTTPAddr?: string;
  existingGRPCAddr?: string;
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
    // Extract more detailed error messages
    const message = err.message;
    
    // Check for common error patterns and provide helpful hints
    if (message.includes('Docker') || message.includes('docker')) {
      return message + '\n\n💡 提示：请确保 Docker 服务正在运行，并且当前用户有权限访问 Docker。';
    }
    if (message.includes('permission denied') || message.includes('Permission denied')) {
      return message + '\n\n💡 提示：请检查文件系统权限，确保应用有读写权限。';
    }
    if (message.includes('port') && message.includes('already')) {
      return message + '\n\n💡 提示：端口已被占用，请检查是否有其他服务正在使用该端口。';
    }
    if (message.includes('timeout') || message.includes('Timeout')) {
      return message + '\n\n💡 提示：网络超时，请检查网络连接或稍后重试。';
    }
    if (message.includes('not found') || message.includes('Not found')) {
      return message + '\n\n💡 提示：资源未找到，请检查配置是否正确。';
    }
    
    return message;
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
  const proxyHeaders = `    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    add_header X-Cache $upstream_cache_status;
    add_header Strict-Transport-Security "max-age=31536000";
    add_header Cache-Control no-cache;`;

  const derpBlock = derp.enabled
    ? `\nserver {\n  listen 80;\n  server_name ${proxy.derpHost};\n  location / {\n    proxy_pass http://127.0.0.1:${derp.derpPort};\n${proxyHeaders}\n  }\n}\n\n# STUN (UDP ${derp.stunPort}) needs L4 forwarding on your edge gateway.\n`
    : '';

  return `# Example Nginx config (External Managed)\nserver {\n  listen 80;\n  server_name ${proxy.headscaleHost};\n\n  # Headscale API\n  location / {\n    proxy_pass http://127.0.0.1:${hs.httpPort};\n${proxyHeaders}\n  }\n\n  # Panel (${proxy.headscaleHost}/panel)\n  location /panel {\n    proxy_pass http://127.0.0.1:8080;\n${proxyHeaders}\n  }\n}\n${derpBlock}`;
}

function buildHeadscaleComposeService(cfg: HeadscaleConfig, withDerp: boolean): string {
  const dependsOn = withDerp ? '\n    depends_on:\n      - derp' : '';
  return `  server:\n    image: headscale/headscale:stable\n    container_name: ${cfg.containerName}\n    networks:\n      - private\n    volumes:\n      - ${cfg.configPath}:/etc/headscale\n      - ${cfg.dataPath}:/var/lib/headscale\n      - ./headscale/run:/var/run/headscale\n      - /usr/share/zoneinfo/${cfg.timezone}:/etc/localtime:ro\n    ports:\n      - "${cfg.httpPort}:8080"\n      - "${cfg.grpcPort}:50443"\n    command: serve\n    restart: unless-stopped${dependsOn}`;
}

function buildDerperComposeService(cfg: DerperConfig): string {
  return `  derp:\n    image: fredliang/derper\n    container_name: ${cfg.containerName}\n    networks:\n      - private\n    environment:\n      DERP_DOMAIN: ${cfg.derpDomain}\n      DERP_ADDR: :6060\n      DERP_CERT_MODE: ${cfg.certMode}\n      DERP_VERIFY_CLIENTS: ${String(cfg.verifyClients)}\n    ports:\n      - "${cfg.derpPort}:6060"\n      - "${cfg.stunPort}:3478/udp"\n    volumes:\n      - /var/run/tailscale:/var/run/tailscale\n      - /usr/share/zoneinfo/${cfg.timezone}:/etc/localtime:ro\n    restart: unless-stopped`;
}

function buildNginxComposeService(proxy: ReverseProxyConfig, timezone: string): string {
  const ports = proxy.enableSSL ? `\n      - "80:80"\n      - "443:443"` : `\n      - "80:80"`;
  const certVolumes = proxy.enableSSL
    ? `\n      - ./deploy/nginx/certbot/www:/var/www/certbot\n      - ./deploy/nginx/certbot/conf:/etc/letsencrypt`
    : '';
  return `  nginx:\n    image: nginx:1.27-alpine\n    container_name: ${proxy.nginxContainerName}\n    restart: unless-stopped\n    ports:${ports}\n    volumes:\n      - ./deploy/nginx/conf.d:/etc/nginx/conf.d${certVolumes}\n      - /usr/share/zoneinfo/${timezone}:/etc/localtime:ro\n    networks:\n      - private`;
}

function buildCertbotComposeService(proxy: ReverseProxyConfig): string {
  return `  certbot:\n    image: certbot/certbot:latest\n    container_name: ${proxy.certbotContainerName}\n    restart: unless-stopped\n    environment:\n      CERTBOT_EMAIL: ${proxy.certbotEmail}\n      CERTBOT_DOMAINS: ${[proxy.headscaleHost, proxy.derpHost].filter(Boolean).join(',')}\n    command:\n      - sh\n      - -c\n      - >-\n        trap exit TERM;\n        while :; do\n          certbot certonly --webroot -w /var/www/certbot --agree-tos --no-eff-email --email "$CERTBOT_EMAIL" -d "$CERTBOT_DOMAINS" || true;\n          certbot renew --webroot -w /var/www/certbot --quiet || true;\n          sleep 12h & wait $!;\n        done\n    volumes:\n      - ./deploy/nginx/certbot/www:/var/www/certbot\n      - ./deploy/nginx/certbot/conf:/etc/letsencrypt\n    networks:\n      - private`;
}

function buildComposePreview(hs: HeadscaleConfig, derp: DerperConfig, proxy: ReverseProxyConfig, proxyMode: ProxyMode): string {
  const withDerp = derp.enabled && derp.autoDeploy;
  const services: string[] = [buildHeadscaleComposeService(hs, withDerp)];

  if (withDerp) {
    services.push(buildDerperComposeService(derp));
  }

  if (proxyMode === 'built_in') {
    services.push(buildNginxComposeService(proxy, hs.timezone));
    if (proxy.enableSSL && proxy.sslCertMode === 'certbot') {
      services.push(buildCertbotComposeService(proxy));
    }
  }

  return `networks:\n  private:\n    driver: bridge\n    ipam:\n      config:\n        - subnet: 172.20.200.0/24\nservices:\n${services.join('\n\n')}`;
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

  const [bootstrapConfigured, setBootstrapConfigured] = useState(false);
  const [setupBootstrapToken, setSetupBootstrapToken] = useState(
    () => sessionStorage.getItem('setup.bootstrapToken') || draftRef.current.setupBootstrapToken || '',
  );
  const [userCount, setUserCount] = useState(0);

  const [manageExistingMode, setManageExistingMode] = useState(false);

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
  const [existingHTTPAddr, setExistingHTTPAddr] = useState(
    () => draftRef.current.existingHTTPAddr || `127.0.0.1:${defaultHeadscale.httpPort}`,
  );
  const [existingGRPCAddr, setExistingGRPCAddr] = useState(
    () => draftRef.current.existingGRPCAddr || `127.0.0.1:${defaultHeadscale.grpcPort}`,
  );
  const [proxyMode, setProxyMode] = useState<ProxyMode>(() => {
    const mode = draftRef.current.proxyMode;
    return mode === 'none' || mode === 'built_in' || mode === 'external' ? mode : 'external';
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

  // Inline error state (replaces blocking toasts/popups)
  const [inlineError, setInlineError] = useState('');

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
    setManageExistingMode(setupProfile === 'existing' && userCount > 0);
  }, [setupProfile, userCount]);

  useEffect(() => {
    sessionStorage.setItem('setup.bootstrapToken', setupBootstrapToken.trim());
    const draft: SetupDraft = {
      adminForm,
      hsCfg,
      derpCfg,
      proxyCfg,
      proxyMode,
      existingHTTPAddr,
      existingGRPCAddr,
      setupBootstrapToken: setupBootstrapToken.trim(),
    };
    localStorage.setItem(setupDraftStorageKey, JSON.stringify(draft));
  }, [adminForm, derpCfg, existingGRPCAddr, existingHTTPAddr, hsCfg, proxyCfg, proxyMode, setupBootstrapToken]);

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
      const detectedHTTPPort = deployment.headscale?.http_port ? String(deployment.headscale.http_port) : hsCfg.httpPort;
      const detectedGRPCPort = deployment.headscale?.grpc_port ? String(deployment.headscale.grpc_port) : hsCfg.grpcPort;
      setHsCfg((prev) => ({
        ...prev,
        containerName: deployment.headscale?.container_name || prev.containerName,
        httpPort: detectedHTTPPort,
        grpcPort: detectedGRPCPort,
      }));
      setExistingHTTPAddr(`127.0.0.1:${detectedHTTPPort}`);
      setExistingGRPCAddr(`127.0.0.1:${detectedGRPCPort}`);
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
  }, [hsCfg.grpcPort, hsCfg.httpPort, setupProfile]);

  const runPreflight = useCallback(async () => {
    setPreflightRunning(true);
    try {
      const data = (await api.post(
        '/setup/preflight',
        {
          panel_domain: proxyCfg.headscaleHost ? `${proxyCfg.headscaleHost}/panel` : proxyCfg.panelDomain,
          headscale_host: proxyCfg.headscaleHost,
          derp_host: derpCfg.enabled ? proxyCfg.derpHost : '',
          backend_port: '8080',
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
          headscale_http_addr: existingHTTPAddr.trim(),
          headscale_grpc_addr: existingGRPCAddr.trim(),
          api_key: hsCfg.apiKey,
          strict_api: false,
          grpc_allow_insecure: true,
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
  }, [buildSetupHeaders, existingGRPCAddr, existingHTTPAddr, hsCfg.apiKey, t]);

  const runStrictHeadscaleCheck = useCallback(async (): Promise<boolean> => {
    const grpcAddr = setupProfile === 'existing'
      ? existingGRPCAddr.trim()
      : `127.0.0.1:${hsCfg.grpcPort || '28081'}`;

    // Use polling endpoint - will retry up to 10 times with 3s interval
    try {
      const data = (await api.post(
        '/setup/connectivity-poll',
        {
          headscale_grpc_addr: grpcAddr,
          api_key: hsCfg.apiKey,
          grpc_allow_insecure: true,
          max_attempts: 10,
          interval_seconds: 3,
        },
        { headers: buildSetupHeaders(), timeout: 60000 },
      )) as { ready?: boolean; attempts?: number; detail?: string };

      const passed = Boolean(data.ready);
      setConnectivityPassed(passed);
      setConnectivityResults([{
        name: 'headscale_api',
        address: grpcAddr,
        reachable: passed,
        detail: data.detail || '',
      }]);
      return passed;
    } catch {
      // Fallback to single check
      const data = (await api.post(
        '/setup/connectivity-check',
        {
          headscale_http_addr: setupProfile === 'existing' ? existingHTTPAddr.trim() : `127.0.0.1:${hsCfg.httpPort || '28080'}`,
          headscale_grpc_addr: grpcAddr,
          api_key: hsCfg.apiKey,
          strict_api: true,
          grpc_allow_insecure: true,
        },
        { headers: buildSetupHeaders() },
      )) as { checks?: Array<{ name: string; address: string; reachable: boolean; detail: string }>; all_reachable?: boolean };

      const checks = Array.isArray(data.checks) ? data.checks : [];
      setConnectivityResults(checks);
      const passed = Boolean(data.all_reachable);
      setConnectivityPassed(passed);
      return passed;
    }
  }, [buildSetupHeaders, existingGRPCAddr, existingHTTPAddr, hsCfg.apiKey, hsCfg.grpcPort, hsCfg.httpPort, setupProfile]);

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
          panel_domain: proxyCfg.headscaleHost,
          headscale_host: proxyCfg.headscaleHost,
          derp_host: proxyCfg.derpHost,
          enable_ssl: proxyCfg.enableSSL,
          ssl_cert_mode: proxyCfg.sslCertMode,
          deploy_certbot: proxyCfg.enableSSL && proxyCfg.sslCertMode === 'certbot',
          certbot_container_name: proxyCfg.certbotContainerName,
          certbot_email: proxyCfg.certbotEmail,
          network_subnet: '172.20.200.0/24',
          write_file: true,
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
      .catch(() => {})
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
    if (setupProfile === 'existing') {
      return connectivityPassed;
    }
    return true;
  }, [preflight, setupProfile, connectivityPassed]);

  const adminLocked = userCount > 0 && manageExistingMode && !adminResetMode;

  const coreConfigured = useMemo(() => {
    if (!hsCfg.containerName.trim() || !hsCfg.httpPort.trim() || !hsCfg.grpcPort.trim() || !hsCfg.apiKey.trim()) {
      return false;
    }
    if (hsCfg.databaseDriver === 'postgres' && !hsCfg.databaseURL.trim()) {
      return false;
    }
    return true;
  }, [hsCfg.apiKey, hsCfg.containerName, hsCfg.databaseDriver, hsCfg.databaseURL, hsCfg.grpcPort, hsCfg.httpPort]);

  const adminConfigured = useMemo(() => {
    if (adminLocked) return true;
    return Boolean(adminForm.username.trim() && adminForm.password.trim());
  }, [adminForm.password, adminForm.username, adminLocked]);

  const networkConfigured = useMemo(() => {
    if (!proxyCfg.headscaleHost.trim()) {
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
    if (proxyMode === 'built_in' && proxyCfg.enableSSL && proxyCfg.sslCertMode === 'certbot' && !proxyCfg.certbotEmail.trim()) {
      return false;
    }
    return true;
  }, [derpCfg.derpDomain, derpCfg.derpPort, derpCfg.enabled, derpCfg.stunPort, proxyCfg.certbotEmail, proxyCfg.derpHost, proxyCfg.enableSSL, proxyCfg.headscaleHost, proxyCfg.panelDomain, proxyCfg.sslCertMode, proxyMode]);

  const provisionConfigured = deployStatus === 'success';

  // Dynamic stage order: existing profile skips controller & network
  const stageOrder = useMemo<Array<{ key: Stage; label: string; subtitle: string; icon: LucideIcon }>>(() => {
    if (setupProfile === 'existing') {
      return [
        { key: 'check', label: t.setup.stageCheck, subtitle: t.setup.stageCheckSub, icon: Activity },
        { key: 'admin', label: t.setup.stageAdmin, subtitle: t.setup.stageAdminSub, icon: UserPlus },
      ];
    }
    return [
      { key: 'check', label: t.setup.stageCheck, subtitle: t.setup.stageCheckSub, icon: Activity },
      { key: 'controller', label: t.setup.stageController, subtitle: t.setup.stageControllerSub, icon: Shield },
      { key: 'network', label: t.setup.stageNetwork, subtitle: t.setup.stageNetworkSub, icon: Network },
      { key: 'admin', label: t.setup.stageAdmin, subtitle: t.setup.stageAdminSub, icon: UserPlus },
      { key: 'provision', label: t.setup.stageProvision, subtitle: t.setup.stageProvisionSub, icon: PlayCircle },
    ];
  }, [setupProfile, t.setup]);

  const stageConfigured: Record<Stage, boolean> = {
    check: preflightConfigured,
    controller: coreConfigured,
    network: networkConfigured,
    admin: adminConfigured,
    provision: provisionConfigured,
  };

  const stageIndex = useMemo<Record<Stage, number>>(() => {
    const map: Record<Stage, number> = { check: -1, controller: -1, network: -1, admin: -1, provision: -1 };
    stageOrder.forEach((s, i) => { map[s.key] = i; });
    return map;
  }, [stageOrder]);

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
      admin: 'pending',
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
    const targetIdx = stageIndex[target];
    if (targetIdx < 0) return false; // stage not in current flow
    const activeIdx = stageIndex[activeStage];

    if (targetIdx < linearCompletedCount) {
      return true;
    }
    if (targetIdx <= activeIdx) {
      return true;
    }
    if (targetIdx !== activeIdx + 1) {
      return false;
    }
    return stageConfigured[stageOrder[activeIdx].key];
  }, [activeStage, linearCompletedCount, stageConfigured, stageIndex, stageOrder]);

  const jumpToStage = (target: Stage) => {
    if (!canEnterStage(target)) {
      setInlineError(t.setup.completePrevious);
      return;
    }
    setInlineError('');
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
        headscale_host: proxyCfg.headscaleHost,
        derp_domain: derpCfg.derpDomain,
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
  }, [buildSetupHeaders, composePreview, derpCfg.derpDomain, fetchSetupToken, proxyCfg.headscaleHost, t.setup.phaseGeneratingConfig]);

  const requestReverseProxyConfig = useCallback(async () => {
    const setupDeployToken = await fetchSetupToken('deploy');

    const enableCertbot = proxyMode === 'built_in' && proxyCfg.enableSSL && proxyCfg.sslCertMode === 'certbot';
    const data = (await api.post(
      '/setup/reverse-proxy/config',
      {
        panel_domain: proxyCfg.headscaleHost,
        headscale_host: proxyCfg.headscaleHost,
        derp_host: derpCfg.enabled ? proxyCfg.derpHost : '',
        headscale_port: hsCfg.httpPort,
        derp_port: derpCfg.enabled ? derpCfg.derpPort : '',
        derp_stun_port: derpCfg.enabled ? derpCfg.stunPort : '',
        enable_ssl: proxyCfg.enableSSL,
        ssl_cert_mode: proxyCfg.sslCertMode,
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
  }, [buildSetupHeaders, derpCfg.derpPort, derpCfg.enabled, derpCfg.stunPort, fetchSetupToken, hsCfg.httpPort, proxyCfg.derpHost, proxyCfg.enableSSL, proxyCfg.headscaleHost, proxyCfg.panelDomain, proxyCfg.sslCertMode, proxyMode]);

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
        DERP_CERT_MODE: derpCfg.certMode,
        DERP_VERIFY_CLIENTS: String(derpCfg.verifyClients),
      },
      network_name: 'private',
      restart_policy: 'unless-stopped',
    };
  }, [derpCfg]);

  const buildNginxDeployRequest = useCallback(() => {
    const ports: Record<string, string> = { '80': '80' };
    if (proxyCfg.enableSSL) {
      ports['443'] = '443';
    }
    const volumes: Record<string, string> = {
      './deploy/nginx/conf.d': '/etc/nginx/conf.d',
      [`/usr/share/zoneinfo/${hsCfg.timezone}`]: '/etc/localtime',
    };
    if (proxyCfg.enableSSL) {
      volumes['./deploy/nginx/certbot/www'] = '/var/www/certbot';
      volumes['./deploy/nginx/certbot/conf'] = '/etc/letsencrypt';
    }
    return {
      image: 'nginx:1.27-alpine',
      container_name: proxyCfg.nginxContainerName,
      ports,
      volumes,
      network_name: 'private',
      restart_policy: 'unless-stopped',
    };
  }, [hsCfg.timezone, proxyCfg.enableSSL, proxyCfg.nginxContainerName]);

  const buildCertbotDeployRequest = useCallback(() => {
    const domains = [proxyCfg.headscaleHost, derpCfg.enabled ? proxyCfg.derpHost : '']
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
    if (setupProfile === 'fresh' && (!coreConfigured || !networkConfigured)) {
      setInlineError(t.setup.completePrevious);
      return;
    }
    if (!adminConfigured) {
      setInlineError(t.setup.completePrevious);
      return;
    }
    setInlineError('');

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

      if (derpCfg.enabled && derpCfg.autoDeploy) {
        await deployOneService(t.setup.serviceDerp, buildDerpDeployRequest());
        deployedState.derper = true;
      }

      setProvisionPhase('starting');
      setPhaseText(t.setup.phaseStartingContainer);

      await deployOneService(t.setup.serviceHeadscale, buildHeadscaleDeployRequest());
      deployedState.headscale = true;

      if (proxyMode === 'built_in') {
        await deployOneService(t.setup.serviceNginx, buildNginxDeployRequest());
        deployedState.nginx = true;
        if (proxyCfg.enableSSL && proxyCfg.sslCertMode === 'certbot') {
          await deployOneService(t.setup.serviceCertbot, buildCertbotDeployRequest());
          deployedState.certbot = true;
        }
      }

      setProvisionPhase('finalizing');
      setPhaseText(t.setup.phaseFinalizing);

      const headscaleReady = await runStrictHeadscaleCheck();
      if (!headscaleReady) {
        throw new Error(t.setup.connectionFailed);
      }

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
      setInlineError('');
      toast.success(t.setup.provisionCompleted);
    } catch (err: unknown) {
      const message = getErrorMessage(err, t.setup.provisionFailed);
      setDeployStatus('error');
      setProvisionPhase('error');
      setPhaseText(message);
      setInlineError(message);
      setDeployLog((prev) => [...prev, { step: 'error', message, error: message }]);
    }
  }, [adminConfigured, adminForm, adminLocked, buildCertbotDeployRequest, buildDerpDeployRequest, buildHeadscaleDeployRequest, buildNginxDeployRequest, buildSetupHeaders, coreConfigured, deployOneService, derpCfg.autoDeploy, derpCfg.enabled, fetchSetupToken, generateComposeFile, networkConfigured, proxyCfg.enableSSL, proxyCfg.sslCertMode, proxyMode, requestReverseProxyConfig, runStrictHeadscaleCheck, setupProfile, t.setup]);

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] p-4 md:p-6">
        <div className="mb-3 flex items-center justify-between">
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
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
          <aside className="rounded-xl border bg-card shadow-sm p-5 sticky top-4 h-fit">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-primary/10">
                <Activity className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground tracking-tight">{t.setup.consoleTitle}</p>
                <p className="text-[11px] text-muted-foreground">{t.setup.consoleSubtitle}</p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/50 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t.setup.progress}</p>
                <span className="text-xs font-semibold text-primary">{progressValue}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            </div>

            <div className="mt-5 space-y-1.5">
              {stageOrder.map((stage, idx) => {
                const Icon = stage.icon;
                const status = stageStatus[stage.key];
                const locked = !canEnterStage(stage.key);
                const isActive = activeStage === stage.key;
                const statusLabel = getStageStatusLabel(status, locked, t.setup);
                const statusTone = status === 'configured'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : status === 'processing'
                    ? 'text-primary'
                    : 'text-muted-foreground';

                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => jumpToStage(stage.key)}
                    className={`w-full rounded-lg border px-3.5 py-3 text-left transition-all duration-200 ${
                      isActive
                        ? 'border-primary/30 bg-primary/5 shadow-sm'
                        : 'border-transparent hover:border-border hover:bg-muted/50'
                    }`}
                    disabled={locked}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 relative h-4 w-4 shrink-0">
                        <span
                          className="absolute inset-0 rounded-full border-2 transition-colors"
                          style={{
                            borderColor: status === 'configured' ? COLOR_STATUS_GREEN : isActive ? COLOR_BLUE : 'var(--border)',
                            backgroundColor: status === 'configured' ? 'rgba(16,185,129,0.1)' : isActive ? 'rgba(0,111,255,0.1)' : 'transparent',
                          }}
                        />
                        {status === 'configured' ? (
                          <Check className="absolute inset-0 m-auto h-3 w-3" style={{ color: COLOR_STATUS_GREEN }} />
                        ) : locked ? (
                          <Lock className="absolute inset-0 m-auto h-3 w-3 text-muted-foreground" />
                        ) : (
                          <span className="absolute inset-0 m-auto block h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{`${idx + 1}. ${stage.label}`}</p>
                          <span className={`text-[11px] font-medium ${statusTone}`}>{statusLabel}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
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
                    <h2 className="text-xl font-semibold text-foreground">{t.setup.checkTitle}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t.setup.checkDesc}</p>
                  </div>
                  <Badge
                    style={{
                      backgroundColor: existingSystem ? 'rgba(16,185,129,0.1)' : 'rgba(0,92,255,0.1)',
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
                    <p className="text-xs text-muted-foreground mt-1">{t.setup.bootstrapHint}</p>
                  </div>
                )}

                {setupProfile === 'existing' ? (
                  /* ── Existing Config Mode: Connectivity Check (no Docker) ── */
                  <>
                    <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Wifi className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-primary">{t.setup.connectivityCheck}</span>
                      </div>
                      <p className="text-xs text-primary/70">{t.setup.connectivityCheckDesc}</p>

                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">{t.setup.headscaleHTTPAddr}</Label>
                          <Input
                            className="mt-1"
                            value={existingHTTPAddr}
                            onChange={(e) => setExistingHTTPAddr(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t.setup.headscaleGRPCAddr}</Label>
                          <Input
                            className="mt-1"
                            value={existingGRPCAddr}
                            onChange={(e) => setExistingGRPCAddr(e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">{t.setup.apiKey}</Label>
                          <Input
                            className="mt-1 font-mono"
                            value={hsCfg.apiKey}
                            onChange={(e) => updateHS({ apiKey: e.target.value })}
                            placeholder="API Key"
                          />
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
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
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'
                                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                            }`}>
                              {r.reachable ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                              <span className="font-medium">{r.name}</span>
                              <span className="text-muted-foreground">{r.address}</span>
                              <span className="ml-auto">{r.reachable ? t.setup.reachable : t.setup.unreachable}</span>
                            </div>
                          ))}
                          {connectivityPassed ? (
                            <div className="flex items-center gap-2 rounded-lg p-3 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800">
                              <div className="relative h-6 w-6 shrink-0">
                                <span className="absolute inset-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 animate-ping" style={{ animationDuration: '1s', animationIterationCount: 1 }} />
                                <span className="absolute inset-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                </span>
                              </div>
                              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t.setup.connectionSuccess}</span>
                            </div>
                          ) : (
                            <div className="rounded-lg p-2 text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                              {t.setup.someUnreachable}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
                      <Server className="h-3.5 w-3.5 inline mr-1" />
                      {t.setup.skipDockerHint}
                    </div>
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-2">
                      <p>{t.setup.existingGrpcRequired}</p>
                      <pre className="bg-amber-100 dark:bg-amber-900/30 rounded p-2 text-[11px] overflow-x-auto">{`grpc_listen_addr: 0.0.0.0:50443
grpc_allow_insecure: true`}</pre>
                      <p>{t.setup.existingProxyHint}</p>
                    </div>
                  </>
                ) : (
                  /* ── Fresh Setup Mode: Docker Detection ── */
                  <>
                    <div className="mt-5">
                      <Card className={`${CARD_INNER_CLASS} p-4`}>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4" style={{ color: dockerAvailable ? COLOR_STATUS_GREEN : COLOR_BLUE }} />
                          <span className="text-sm font-medium text-foreground">{t.setup.docker}</span>
                        </div>
                        <p className="text-xs mt-2 text-muted-foreground">{statusText(preflight?.health?.docker_available ?? preflight?.docker?.ok, t.setup)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{preflight?.health?.docker_detail || preflight?.docker?.detail || '-'}</p>
                      </Card>
                    </div>
                    {!dockerAvailable && preflight && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                        <strong>{t.setup.dockerEnvWarning}</strong>
                      </div>
                    )}
                  </>
                )}

                <Card className={`mt-4 p-3 ${CARD_INNER_CLASS} rounded-lg`}>
                  <p className="text-xs font-medium text-foreground">{t.setup.existingFiles}</p>
                  <p className="text-xs mt-1 text-muted-foreground">{(preflight?.existing_files || []).join(', ') || t.setup.noExistingFiles}</p>
                </Card>

                {preflight?.has_existing_config && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300">
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
                      setManageExistingMode(setupProfile === 'existing' && existingSystem && userCount > 0);
                      jumpToStage(setupProfile === 'existing' ? 'admin' : 'controller');
                    }}
                  >
                    {setupProfile === 'existing' ? t.setup.continueToAdmin : t.setup.setupNewController}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </Card>
            )}

            {activeStage === 'controller' && (
              <Card className={`${CARD_BASE_CLASS} p-6 md:p-7 space-y-6`}>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">{t.setup.controllerTitle}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t.setup.controllerDesc}</p>
                </div>

                <Card className={`${CARD_INNER_CLASS} p-4 space-y-3`}>
                  <p className="text-sm font-semibold text-foreground">{t.setup.networkIdentity}</p>

                  <div>
                    <Label>{t.setup.headscaleDomain}</Label>
                    <Input
                      className="mt-1"
                      value={proxyCfg.headscaleHost}
                      onChange={(e) => updateProxy({ headscaleHost: e.target.value })}
                      placeholder="vpn.example.com"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">{t.setup.headscaleDomainHint}</p>
                  </div>
                </Card>

                <Card className={`${CARD_INNER_CLASS} p-4`}>
                  <p className="text-sm font-semibold text-foreground mb-3">{t.setup.headscaleService}</p>
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
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
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
                  <p className="text-xs text-muted-foreground mb-2">{t.setup.composePreview}</p>
                  <CommandPreview code={buildHeadscaleComposeService(hsCfg, derpCfg.enabled && derpCfg.autoDeploy)} onCopy={copyToClipboard} />
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
                  <h2 className="text-xl font-semibold text-foreground">{t.setup.networkTitle}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t.setup.networkDesc}</p>
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
                        <p className="text-sm font-semibold text-foreground">{t.setup.embeddedDerp}</p>
                        <p className="text-xs text-muted-foreground">{t.setup.embeddedDerpDesc}</p>
                      </div>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </button>

                  {derpExpanded && derpCfg.enabled && (
                    <div className="px-4 pb-4 space-y-3">
                      <label className="flex items-center gap-2 text-sm text-foreground">
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
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
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
                      <p className="text-sm font-semibold text-foreground">{t.setup.reverseProxy}</p>
                      <p className="text-xs text-muted-foreground">{t.setup.reverseProxyDesc}</p>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
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
                            className={`rounded-md border px-3 py-2 text-sm transition-colors ${proxyMode === option.key ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:bg-muted/50'}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>{t.setup.headscaleHost}</Label>
                          <Input className="mt-1" value={proxyCfg.headscaleHost} onChange={(e) => updateProxy({ headscaleHost: e.target.value })} />
                        </div>
                        <div>
                          <Label>{t.setup.derpHost}</Label>
                          <Input className="mt-1" value={proxyCfg.derpHost} onChange={(e) => updateProxy({ derpHost: e.target.value })} disabled={!derpCfg.enabled} />
                        </div>
                      </div>
                      <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">{t.setup.panelAccessPath}</p>
                        <p className="font-mono">{proxyCfg.headscaleHost ? `${proxyCfg.headscaleHost}/panel` : 'domain/panel'}</p>
                      </div>

                      {proxyMode === 'built_in' && (
                        <div className="space-y-2 text-sm text-foreground">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={proxyCfg.enableSSL}
                              onChange={(e) => updateProxy({ enableSSL: e.target.checked })}
                            />
                            {t.setup.enableSSL}
                          </label>
                          {proxyCfg.enableSSL && (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateProxy({ sslCertMode: 'certbot', deployCertbot: true })}
                                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${proxyCfg.sslCertMode === 'certbot' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:bg-muted/50'}`}
                                >
                                  {t.setup.enableLetsEncrypt}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateProxy({ sslCertMode: 'manual', deployCertbot: false })}
                                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${proxyCfg.sslCertMode === 'manual' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:bg-muted/50'}`}
                                >
                                  {t.setup.manualUpload}
                                </button>
                              </div>
                              {proxyCfg.sslCertMode === 'certbot' && (
                                <div>
                                  <Label>{t.setup.certbotEmail}</Label>
                                  <Input className="mt-1" value={proxyCfg.certbotEmail} onChange={(e) => updateProxy({ certbotEmail: e.target.value })} />
                                </div>
                              )}
                              {proxyCfg.sslCertMode === 'manual' && (
                                <p className="text-xs text-muted-foreground">
                                  {t.setup.manualCertHint}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {proxyMode === 'external' && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300">
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
                  <p className="text-xs text-muted-foreground mb-2">{t.setup.connectivityPreview}</p>
                  <CommandPreview code={composePreview} onCopy={copyToClipboard} />
                </div>

                <div className="flex justify-end">
                  <Button
                    style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 10px 22px rgba(0,92,255,0.28)' }}
                    disabled={!networkConfigured}
                    onClick={() => jumpToStage('admin')}
                  >
                    {t.setup.continueToAdmin}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </Card>
            )}

            {activeStage === 'admin' && (
              <Card className={`${CARD_BASE_CLASS} p-6 md:p-7 space-y-6`}>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">{t.setup.adminTitle}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t.setup.adminDesc}</p>
                </div>

                {setupProfile === 'existing' && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-primary">{t.setup.existingConfigPaths}</span>
                    </div>
                    <p className="text-xs text-primary/70">{t.setup.existingConfigPathsDesc}</p>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <span className="font-medium text-primary">{t.setup.panelConfigPath}</span>
                        <p className="mt-1 font-mono text-muted-foreground">{t.setup.panelConfigPathValue}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <span className="font-medium text-primary">{t.setup.headscaleConfigPath}</span>
                        <p className="mt-1 font-mono text-muted-foreground">{hsCfg.configPath || './headscale/config'}/config.yaml</p>
                      </div>
                      <div className="rounded-lg border bg-muted/50 p-3">
                        <span className="font-medium text-primary">{t.setup.derpConfigPath}</span>
                        <p className="mt-1 font-mono text-muted-foreground">{hsCfg.configPath || './headscale/config'}/derp.yaml</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                      {t.setup.existingConfigModifyHint}
                    </div>
                  </div>
                )}

                <Card className={`${CARD_INNER_CLASS} p-4 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{t.setup.administrator}</p>
                    {adminLocked && (
                      <button
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                        onClick={() => setAdminResetMode(true)}
                      >
                        {t.setup.resetPassword}
                      </button>
                    )}
                  </div>

                  {adminLocked ? (
                    <div className="rounded border bg-muted/50 p-3 text-xs text-muted-foreground">
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

                <div className="flex justify-end">
                  {setupProfile === 'existing' ? (
                    <div className="w-full space-y-4">
                      {deployStatus === 'success' ? (
                        <div className="flex flex-col items-center py-6">
                          <div className="relative h-16 w-16">
                            <span className="absolute inset-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 animate-ping" style={{ animationDuration: '1.5s', animationIterationCount: 1 }} />
                            <span className="absolute inset-0 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                              <Check className="h-8 w-8 text-emerald-500" />
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t.setup.provisionCompleted}</p>
                          <Button className="mt-4" variant="outline" onClick={() => setLocation('/login')}>
                            {t.setup.goToLogin}
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            className="w-full"
                            size="lg"
                            style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 12px 26px rgba(0,92,255,0.28)' }}
                            disabled={!adminConfigured || deployStatus === 'deploying'}
                            onClick={async () => {
                              setDeployStatus('deploying');
                              setProvisionPhase('finalizing');
                              setPhaseText(t.setup.phaseFinalizing);
                              setInlineError('');
                              try {
                                const headscaleReady = await runStrictHeadscaleCheck();
                                if (!headscaleReady) {
                                  throw new Error(t.setup.connectionFailed);
                                }
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
                                setInlineError('');
                                toast.success(t.setup.provisionCompleted);
                              } catch (err: unknown) {
                                const message = getErrorMessage(err, t.setup.provisionFailed);
                                setDeployStatus('error');
                                setProvisionPhase('error');
                                setPhaseText(message);
                                setInlineError(message);
                              }
                            }}
                          >
                            <Shield className="h-4 w-4 mr-2" />{t.setup.completeAfterConnectivity}
                          </Button>
                          {inlineError && deployStatus !== 'deploying' && (
                            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
                              {inlineError}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <Button
                      style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 10px 22px rgba(0,92,255,0.28)' }}
                      disabled={!adminConfigured}
                      onClick={() => jumpToStage('provision')}
                    >
                      {t.setup.continueToProvision}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {activeStage === 'provision' && (
              <Card className={`${CARD_BASE_CLASS} p-6 md:p-7 space-y-6`}>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">{t.setup.provisionTitle}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t.setup.provisionDesc}</p>
                </div>

                {/* Docker status indicator */}
                <div className={`rounded-lg border p-4 ${
                  dockerAvailable
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
                    : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                }`}>
                  <div className="flex items-center gap-2">
                    <Server className={`h-4 w-4 ${dockerAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                    <span className={`text-sm font-semibold ${dockerAvailable ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {dockerAvailable ? t.setup.dockerAvailable : t.setup.dockerNotAvailable}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${dockerAvailable ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-amber-600/70 dark:text-amber-400/70'}`}>
                    {dockerAvailable ? t.setup.dockerAvailableHint : t.setup.dockerNotAvailableHint}
                  </p>
                </div>

                <div className={`${CARD_INNER_CLASS} p-3`}>
                  <p className="text-sm font-semibold text-foreground mb-3">{t.setup.pendingChanges}</p>
                  <div className="space-y-2">
                    {pendingChanges.map((item) => (
                      <div key={item.name} className="grid grid-cols-1 md:grid-cols-[180px_1fr_1fr] gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
                        <p className="font-semibold text-foreground">{item.name}</p>
                        <p className="text-muted-foreground">{t.setup.current}: {item.current}</p>
                        <p className="text-foreground">{t.setup.target}: {item.target}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">{t.setup.targetCompose}</p>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copyToClipboard(composePreview)}>
                        <Copy className="h-3 w-3 mr-1" />{t.setup.copyCompose}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                        const blob = new Blob([composePreview], { type: 'text/yaml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'docker-compose.yml';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}>
                        <Download className="h-3 w-3 mr-1" />{t.setup.downloadCompose}
                      </Button>
                    </div>
                  </div>
                  <CommandPreview code={composePreview} onCopy={copyToClipboard} />
                </div>

                {dockerAvailable && setupProfile === 'fresh' ? (
                  /* ── Docker Available + Fresh: One-Click Deploy ── */
                  <Button
                    className="w-full"
                    size="lg"
                    style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 12px 26px rgba(0,92,255,0.28)' }}
                    disabled={deployStatus === 'deploying'}
                    onClick={runProvision}
                  >
                    <Rocket className="h-4 w-4 mr-2" />{t.setup.oneClickDeploy}
                  </Button>
                ) : setupProfile === 'fresh' ? (
                  /* ── Docker Not Available + Fresh: Generate Compose + Manual Admin ── */
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
                          <p className="text-sm font-semibold text-foreground">{t.setup.composeContent}</p>
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

                        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-3">
                          <p className="text-xs text-primary font-medium">{t.setup.manualDeployHint}</p>
                          <div className="mt-2">
                            <CommandPreview code={t.setup.manualDeployCmd} onCopy={copyToClipboard} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Create admin after manual deploy */}
                    {!adminLocked && (
                      <Button
                        className="w-full"
                        size="lg"
                        style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 12px 26px rgba(0,92,255,0.28)' }}
                        disabled={deployStatus === 'deploying' || !adminForm.username.trim() || !adminForm.password.trim()}
                        onClick={async () => {
                          setDeployStatus('deploying');
                          setProvisionPhase('finalizing');
                          setPhaseText(t.setup.phaseFinalizing);
                          setInlineError('');
                          try {
                            const headscaleReady = await runStrictHeadscaleCheck();
                            if (!headscaleReady) {
                              throw new Error(t.setup.connectionFailed);
                            }
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
                            setInlineError('');
                            toast.success(t.setup.provisionCompleted);
                          } catch (err: unknown) {
                            const message = getErrorMessage(err, t.setup.provisionFailed);
                            setDeployStatus('error');
                            setProvisionPhase('error');
                            setPhaseText(message);
                            setInlineError(message);
                          }
                        }}
                      >
                        <Shield className="h-4 w-4 mr-2" />{t.setup.completeAfterConnectivity}
                      </Button>
                    )}
                  </div>
                ) : (
                  /* ── Existing Config: Just create admin after connectivity check ── */
                  <div className="space-y-4">
                    {!adminLocked && (
                      <Button
                        className="w-full"
                        size="lg"
                        style={{ backgroundColor: COLOR_BLUE, boxShadow: '0 12px 26px rgba(0,92,255,0.28)' }}
                        disabled={deployStatus === 'deploying' || !adminForm.username.trim() || !adminForm.password.trim()}
                        onClick={async () => {
                          setDeployStatus('deploying');
                          setProvisionPhase('finalizing');
                          setPhaseText(t.setup.phaseFinalizing);
                          setInlineError('');
                          try {
                            const headscaleReady = await runStrictHeadscaleCheck();
                            if (!headscaleReady) {
                              throw new Error(t.setup.connectionFailed);
                            }
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
                            setInlineError('');
                            toast.success(t.setup.provisionCompleted);
                          } catch (err: unknown) {
                            const message = getErrorMessage(err, t.setup.provisionFailed);
                            setDeployStatus('error');
                            setProvisionPhase('error');
                            setPhaseText(message);
                            setInlineError(message);
                          }
                        }}
                      >
                        <Shield className="h-4 w-4 mr-2" />{t.setup.completeAfterConnectivity}
                      </Button>
                    )}
                  </div>
                )}

                {/* Inline error display - no blocking popups */}
                {inlineError && deployStatus !== 'deploying' && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
                    {inlineError}
                  </div>
                )}

                {(deployStatus === 'success' || deployStatus === 'error') && (
                  <div className="space-y-3">
                    {deployStatus === 'success' && (
                      <div className="flex flex-col items-center py-4">
                        <div className="relative h-16 w-16">
                          <span className="absolute inset-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 animate-ping" style={{ animationDuration: '1.5s', animationIterationCount: 1 }} />
                          <span className="absolute inset-0 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                            <Check className="h-8 w-8 text-emerald-500" />
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t.setup.provisionCompleted}</p>
                      </div>
                    )}
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <Card className={`${CARD_INNER_CLASS} p-3`}>{t.setup.composeFile}: {composePath || './deploy/docker-compose.setup.yaml'}</Card>
                      <Card className={`${CARD_INNER_CLASS} p-3`}>{t.setup.nginxConfigFile}: {nginxConfigPath || './deploy/nginx/conf.d/headscale-panel.setup.conf'}</Card>
                    </div>

                    {(proxyMode === 'external' || proxyMode === 'none') && proxyTargets.length > 0 && (
                      <Card className="p-3 border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300">
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
                        <p className="text-xs text-muted-foreground mb-2">{t.setup.generatedProxyConfig}</p>
                        <CommandPreview code={nginxConfigContent} onCopy={copyToClipboard} />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-2xl bg-card border px-8 py-8 text-center shadow-lg min-w-[320px] max-w-md">
            <div className="relative mx-auto h-16 w-16">
              <span className="absolute inset-0 rounded-full border-4 border-primary/20" />
              <span className="absolute inset-0 rounded-full animate-ping border-4 border-primary/30" style={{ animationDuration: '2s' }} />
              <span className="absolute inset-3 rounded-full bg-primary" />
            </div>
            <p className="text-base font-semibold text-foreground mt-5">{phaseText || t.setup.provisioning}</p>
            <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{provisionPhase}</p>
            {deployLog.length > 0 && (
              <div className="mt-3 text-left max-h-40 overflow-auto border rounded p-2 text-[11px] bg-muted/50">
                {deployLog.slice(-8).map((line, idx) => (
                  <div 
                    key={`${line.step}-${idx}`} 
                    className={`py-0.5 ${
                      line.error || line.step === 'error' 
                        ? 'text-red-600 dark:text-red-400 font-medium' 
                        : line.step === 'done' 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-muted-foreground'
                    }`}
                  >
                    {line.error || line.step === 'error' ? '❌ ' : line.step === 'done' ? '✅ ' : '▸ '}
                    {line.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
