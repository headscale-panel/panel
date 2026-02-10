import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { headscaleConfigAPI } from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Eye, Save, RotateCcw, Plus, X } from 'lucide-react';

interface HeadscaleConfig {
  server_url: string;
  listen_addr: string;
  metrics_listen_addr: string;
  grpc_listen_addr: string;
  grpc_allow_insecure: boolean;
  noise: { private_key_path: string };
  prefixes: { v4: string; v6: string; allocation: string };
  derp: {
    server: {
      enabled: boolean;
      region_id: number;
      region_code: string;
      region_name: string;
      stun_listen_addr: string;
    };
    urls: string[];
    paths: string[];
    auto_update_enabled: boolean;
    update_frequency: string;
  };
  database: {
    type: string;
    sqlite: { path: string; write_ahead_log: boolean };
    postgres: {
      host: string;
      port: number;
      name: string;
      user: string;
      pass: string;
      max_open_conns: number;
      max_idle_conns: number;
      conn_max_idle_time_secs: number;
    };
  };
  dns: {
    base_domain: string;
    magic_dns: boolean;
    override_local_dns: boolean;
    nameservers: { global: string[]; split: Record<string, string[]> };
    search_domains: string[];
    extra_records: { name: string; type: string; value: string }[];
    extra_records_path: string;
  };
  policy: { mode: string; path: string };
  oidc: {
    only_start_if_oidc_is_available: boolean;
    issuer: string;
    client_id: string;
    client_secret: string;
    scope: string[];
    allowed_domains: string[];
    allowed_users: string[];
    strip_email_domain: boolean;
    pkce: { enabled: boolean; method: string };
  };
  logtail: { enabled: boolean };
  randomize_client_port: boolean;
}

const defaultConfig: HeadscaleConfig = {
  server_url: 'https://hs.bokro.cn',
  listen_addr: '0.0.0.0:8080',
  metrics_listen_addr: '0.0.0.0:9090',
  grpc_listen_addr: '0.0.0.0:50443',
  grpc_allow_insecure: true,
  noise: { private_key_path: './noise_private.key' },
  prefixes: { v4: '100.100.0.0/16', v6: 'fd7a:115c:a1e0::/48', allocation: 'sequential' },
  derp: {
    server: {
      enabled: false,
      region_id: 999,
      region_code: 'headscale',
      region_name: 'Headscale Embedded DERP',
      stun_listen_addr: '0.0.0.0:3478',
    },
    urls: [],
    paths: ['/etc/headscale/derp.yaml'],
    auto_update_enabled: true,
    update_frequency: '24h',
  },
  database: {
    type: 'sqlite',
    sqlite: { path: '/var/lib/headscale/db.sqlite', write_ahead_log: true },
    postgres: { host: '', port: 5432, name: '', user: '', pass: '', max_open_conns: 0, max_idle_conns: 0, conn_max_idle_time_secs: 0 },
  },
  dns: {
    base_domain: 'bokro.network',
    magic_dns: true,
    override_local_dns: true,
    nameservers: { global: ['223.5.5.5', '114.114.114.114', '2400:3200::1', '2400:3200:baba::1'], split: {} },
    search_domains: [],
    extra_records: [],
    extra_records_path: '/var/lib/headscale/extra-records.json',
  },
  policy: { mode: 'database', path: '' },
  oidc: {
    only_start_if_oidc_is_available: false,
    issuer: 'https://auth.bokro.cn',
    client_id: '',
    client_secret: '',
    scope: ['openid', 'profile', 'email', 'groups'],
    allowed_domains: [],
    allowed_users: [],
    strip_email_domain: false,
    pkce: { enabled: false, method: 'S256' },
  },
  logtail: { enabled: false },
  randomize_client_port: false,
};

export default function Settings() {
  const t = useTranslation();
  const [settings, setSettings] = useState({
    headscaleUrl: 'https://hs.bokro.cn',
    headscaleApiKey: '*********************',
    headscaleInsecure: true,
    systemName: 'Headscale Panel',
    systemUrl: 'http://localhost',
    enableRegistration: true,
    enableNotifications: true,
    enableBuiltinOIDC: false,
    sessionTimeout: 24,
    requireMfa: false,
    passwordMinLength: 8,
    oidcTokenExpiry: 3600,
    oidcRefreshTokenExpiry: 720,
    oidcAllowRegistration: true,
  });

  const [hsConfig, setHsConfig] = useState<HeadscaleConfig>(defaultConfig);
  const [hsLoading, setHsLoading] = useState(false);
  const [hsSaving, setHsSaving] = useState(false);
  const [yamlPreview, setYamlPreview] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const loadHeadscaleConfig = useCallback(async () => {
    try {
      setHsLoading(true);
      const data: any = await headscaleConfigAPI.get();
      if (data) {
        setHsConfig({ ...defaultConfig, ...data });
      }
    } catch {
      // Config file may not exist yet, use defaults
    } finally {
      setHsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHeadscaleConfig();
  }, [loadHeadscaleConfig]);

  const handleSave = (section: string) => {
    toast.success(t.settings.toast.settingsSaved.replace('{section}', section));
  };

  const handleSaveHsConfig = async () => {
    try {
      setHsSaving(true);
      await headscaleConfigAPI.update(hsConfig);
      toast.success(t.settings.toast.configSaved);
    } catch {
      // Error already handled by interceptor
    } finally {
      setHsSaving(false);
    }
  };

  const handlePreviewYaml = async () => {
    try {
      const data: any = await headscaleConfigAPI.preview(hsConfig);
      setYamlPreview(data?.yaml || '');
      setShowPreview(true);
    } catch {
      // Error already handled
    }
  };

  const updateHsConfig = (path: string, value: any) => {
    setHsConfig((prev) => {
      const keys = path.split('.');
      const newConfig = JSON.parse(JSON.stringify(prev));
      let obj: any = newConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return newConfig;
    });
  };

  const addToStringArray = (path: string) => {
    const keys = path.split('.');
    let obj: any = hsConfig;
    for (const k of keys) obj = obj[k];
    const arr = Array.isArray(obj) ? [...obj] : [];
    arr.push('');
    updateHsConfig(path, arr);
  };

  const removeFromStringArray = (path: string, index: number) => {
    const keys = path.split('.');
    let obj: any = hsConfig;
    for (const k of keys) obj = obj[k];
    const arr = Array.isArray(obj) ? [...obj] : [];
    arr.splice(index, 1);
    updateHsConfig(path, arr);
  };

  const updateStringArrayItem = (path: string, index: number, value: string) => {
    const keys = path.split('.');
    let obj: any = hsConfig;
    for (const k of keys) obj = obj[k];
    const arr = Array.isArray(obj) ? [...obj] : [];
    arr[index] = value;
    updateHsConfig(path, arr);
  };

  const renderStringArrayEditor = (label: string, path: string, placeholder: string) => {
    const keys = path.split('.');
    let arr: any = hsConfig;
    for (const k of keys) arr = arr?.[k];
    if (!Array.isArray(arr)) arr = [];

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{label}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => addToStringArray(path)}>
            <Plus className="w-3 h-3 mr-1" /> {t.common.actions.add}
          </Button>
        </div>
        {arr.map((item: string, i: number) => (
          <div key={i} className="flex gap-2">
            <Input
              value={item}
              onChange={(e) => updateStringArrayItem(path, i, e.target.value)}
              placeholder={placeholder}
              className="flex-1"
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeFromStringArray(path, i)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.settings.title}</h1>
          <p className="text-muted-foreground mt-1">
            {t.settings.description}
          </p>
        </div>

        <Tabs defaultValue="headscale" className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="headscale">{t.settings.tabs.headscale}</TabsTrigger>
            <TabsTrigger value="hsconfig">{t.settings.tabs.hsconfig}</TabsTrigger>
            <TabsTrigger value="system">{t.settings.tabs.system}</TabsTrigger>
            <TabsTrigger value="security">{t.settings.tabs.security}</TabsTrigger>
            <TabsTrigger value="oidc">{t.settings.tabs.oidc}</TabsTrigger>
          </TabsList>

          {/* Headscale Connection Tab */}
          <TabsContent value="headscale" className="space-y-4">
            <Card className="p-6 gap-0">
              <div className="pb-4 border-b border-border/60">
                <h2 className="text-lg font-semibold">{t.settings.headscaleConnection.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.settings.headscaleConnection.description}
                </p>
              </div>

              <div className="pt-5 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="headscale-url">{t.settings.headscaleConnection.serverUrlLabel}</Label>
                  <Input
                    id="headscale-url"
                    value={settings.headscaleUrl}
                    onChange={(e) =>
                      setSettings({ ...settings, headscaleUrl: e.target.value })
                    }
                    placeholder="https://hs.bokro.cn"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.settings.headscaleConnection.serverUrlDesc}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="headscale-api-key">{t.settings.headscaleConnection.apiKeyLabel}</Label>
                  <Input
                    id="headscale-api-key"
                    type="password"
                    value={settings.headscaleApiKey}
                    onChange={(e) =>
                      setSettings({ ...settings, headscaleApiKey: e.target.value })
                    }
                    placeholder={t.settings.headscaleConnection.apiKeyPlaceholder}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.settings.headscaleConnection.apiKeyDesc}
                  </p>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <Label htmlFor="headscale-insecure" className="cursor-pointer text-sm">
                      {t.settings.headscaleConnection.skipTlsLabel}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.settings.headscaleConnection.skipTlsDesc}</p>
                  </div>
                  <Switch
                    id="headscale-insecure"
                    checked={settings.headscaleInsecure}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, headscaleInsecure: checked })
                    }
                  />
                </div>

                <Button onClick={() => handleSave('Headscale')} className="w-full">
                  {t.settings.headscaleConnection.saveSettings}
                </Button>
              </div>
            </Card>

            <Card className="p-6 gap-0">
              <h3 className="text-lg font-semibold pb-4 border-b border-border/60">{t.settings.headscaleConnection.connectionTestTitle}</h3>
              <p className="text-sm text-muted-foreground pt-5 mb-4">
                {t.settings.headscaleConnection.connectionTestDesc}
              </p>
              <Button variant="outline" className="w-full">
                {t.settings.headscaleConnection.testConnection}
              </Button>
            </Card>
          </TabsContent>

          {/* Headscale Config Tab */}
          <TabsContent value="hsconfig" className="space-y-4">
            {hsLoading ? (
              <Card className="p-12 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-muted-foreground">{t.settings.hsconfig.loading}</span>
              </Card>
            ) : (
              <>
                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleSaveHsConfig} disabled={hsSaving}>
                    {hsSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {t.settings.hsconfig.saveToConfig}
                  </Button>
                  <Button variant="outline" onClick={handlePreviewYaml}>
                    <Eye className="w-4 h-4 mr-2" />
                    {t.settings.hsconfig.previewYaml}
                  </Button>
                  <Button variant="outline" onClick={() => { setHsConfig(defaultConfig); toast.info(t.settings.toast.resetToDefault); }}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {t.settings.hsconfig.resetDefault}
                  </Button>
                </div>

                {/* YAML Preview Modal */}
                {showPreview && (
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{t.settings.hsconfig.yamlPreview}</h3>
                      <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-96 whitespace-pre-wrap font-mono">
                      {yamlPreview}
                    </pre>
                  </Card>
                )}

                {/* Server Settings */}
                <Card className="p-6 gap-0">
                  <div className="pb-4 border-b border-border/60">
                    <h3 className="text-lg font-semibold">{t.settings.hsconfig.serverSettings}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.hsconfig.serverSettingsDesc}</p>
                  </div>
                  <div className="pt-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Server URL</Label>
                        <Input value={hsConfig.server_url} onChange={(e) => updateHsConfig('server_url', e.target.value)} placeholder="https://hs.bokro.cn" />
                        <p className="text-xs text-muted-foreground">{t.settings.hsconfig.publicServiceUrl}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Listen Address</Label>
                        <Input value={hsConfig.listen_addr} onChange={(e) => updateHsConfig('listen_addr', e.target.value)} placeholder="0.0.0.0:8080" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Metrics Listen Address</Label>
                        <Input value={hsConfig.metrics_listen_addr} onChange={(e) => updateHsConfig('metrics_listen_addr', e.target.value)} placeholder="0.0.0.0:9090" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>gRPC Listen Address</Label>
                        <Input value={hsConfig.grpc_listen_addr} onChange={(e) => updateHsConfig('grpc_listen_addr', e.target.value)} placeholder="0.0.0.0:50443" />
                      </div>
                    </div>
                    <div className="divide-y divide-border/40">
                      <div className="flex items-center justify-between py-3">
                        <Label className="cursor-pointer">{t.settings.hsconfig.allowGrpcInsecure}</Label>
                        <Switch checked={hsConfig.grpc_allow_insecure} onCheckedChange={(v) => updateHsConfig('grpc_allow_insecure', v)} />
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <Label className="cursor-pointer">{t.settings.hsconfig.randomizeClientPort}</Label>
                        <Switch checked={hsConfig.randomize_client_port} onCheckedChange={(v) => updateHsConfig('randomize_client_port', v)} />
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Noise Config */}
                <Card className="p-6 gap-0">
                  <h3 className="text-lg font-semibold pb-4 border-b border-border/60">{t.settings.hsconfig.noiseConfig}</h3>
                  <div className="pt-5 space-y-1.5">
                    <Label>Private Key Path</Label>
                    <Input value={hsConfig.noise.private_key_path} onChange={(e) => updateHsConfig('noise.private_key_path', e.target.value)} placeholder="./noise_private.key" />
                  </div>
                </Card>

                {/* IP Prefixes */}
                <Card className="p-6 gap-0">
                  <div className="pb-4 border-b border-border/60">
                    <h3 className="text-lg font-semibold">{t.settings.hsconfig.ipPrefixes}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.hsconfig.ipPrefixesDesc}</p>
                  </div>
                  <div className="pt-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>{t.settings.hsconfig.ipv4Prefix}</Label>
                        <Input value={hsConfig.prefixes.v4} onChange={(e) => updateHsConfig('prefixes.v4', e.target.value)} placeholder="100.100.0.0/16" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t.settings.hsconfig.ipv6Prefix}</Label>
                        <Input value={hsConfig.prefixes.v6} onChange={(e) => updateHsConfig('prefixes.v6', e.target.value)} placeholder="fd7a:115c:a1e0::/48" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t.settings.hsconfig.allocationStrategy}</Label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        value={hsConfig.prefixes.allocation}
                        onChange={(e) => updateHsConfig('prefixes.allocation', e.target.value)}
                      >
                        <option value="sequential">sequential</option>
                        <option value="random">random</option>
                      </select>
                    </div>
                  </div>
                </Card>

                {/* DERP */}
                <Card className="p-6 gap-0">
                  <div className="pb-4 border-b border-border/60">
                    <h3 className="text-lg font-semibold">{t.settings.hsconfig.derpConfig}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.hsconfig.derpConfigDesc}</p>
                  </div>
                  <div className="pt-5 space-y-5">
                    <div className="flex items-center justify-between py-3">
                      <Label className="cursor-pointer">{t.settings.hsconfig.enableEmbeddedDerp}</Label>
                      <Switch checked={hsConfig.derp.server.enabled} onCheckedChange={(v) => updateHsConfig('derp.server.enabled', v)} />
                    </div>
                    {hsConfig.derp.server.enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                        <div className="space-y-1.5">
                          <Label>Region ID</Label>
                          <Input type="number" value={hsConfig.derp.server.region_id} onChange={(e) => updateHsConfig('derp.server.region_id', parseInt(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Region Code</Label>
                          <Input value={hsConfig.derp.server.region_code} onChange={(e) => updateHsConfig('derp.server.region_code', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Region Name</Label>
                          <Input value={hsConfig.derp.server.region_name} onChange={(e) => updateHsConfig('derp.server.region_name', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>STUN Listen Address</Label>
                          <Input value={hsConfig.derp.server.stun_listen_addr} onChange={(e) => updateHsConfig('derp.server.stun_listen_addr', e.target.value)} />
                        </div>
                      </div>
                    )}
                    {renderStringArrayEditor('DERP Map URLs', 'derp.urls', 'https://controlplane.tailscale.com/derpmap/default')}
                    {renderStringArrayEditor(t.settings.hsconfig.derpMapPathsLocal, 'derp.paths', '/etc/headscale/derp.yaml')}
                    <div className="flex items-center justify-between py-3">
                      <Label className="cursor-pointer">{t.settings.hsconfig.autoUpdateDerpMap}</Label>
                      <Switch checked={hsConfig.derp.auto_update_enabled} onCheckedChange={(v) => updateHsConfig('derp.auto_update_enabled', v)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t.settings.hsconfig.updateFrequency}</Label>
                      <Input value={hsConfig.derp.update_frequency} onChange={(e) => updateHsConfig('derp.update_frequency', e.target.value)} placeholder="24h" />
                    </div>
                  </div>
                </Card>

                {/* Database */}
                <Card className="p-6 gap-0">
                  <h3 className="text-lg font-semibold pb-4 border-b border-border/60">{t.settings.hsconfig.databaseConfig}</h3>
                  <div className="pt-5 space-y-4">
                    <div className="space-y-1.5">
                      <Label>{t.settings.hsconfig.databaseType}</Label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        value={hsConfig.database.type}
                        onChange={(e) => updateHsConfig('database.type', e.target.value)}
                      >
                        <option value="sqlite">SQLite</option>
                        <option value="postgres">PostgreSQL</option>
                      </select>
                    </div>
                    {hsConfig.database.type === 'sqlite' && (
                      <div className="space-y-1.5">
                        <Label>{t.settings.hsconfig.sqlitePath}</Label>
                        <Input value={hsConfig.database.sqlite.path} onChange={(e) => updateHsConfig('database.sqlite.path', e.target.value)} placeholder="/var/lib/headscale/db.sqlite" />
                      </div>
                    )}
                    {hsConfig.database.type === 'postgres' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Host</Label>
                          <Input value={hsConfig.database.postgres.host} onChange={(e) => updateHsConfig('database.postgres.host', e.target.value)} placeholder="localhost" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Port</Label>
                          <Input type="number" value={hsConfig.database.postgres.port} onChange={(e) => updateHsConfig('database.postgres.port', parseInt(e.target.value) || 5432)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Database Name</Label>
                          <Input value={hsConfig.database.postgres.name} onChange={(e) => updateHsConfig('database.postgres.name', e.target.value)} placeholder="headscale" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>User</Label>
                          <Input value={hsConfig.database.postgres.user} onChange={(e) => updateHsConfig('database.postgres.user', e.target.value)} />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <Label>Password</Label>
                          <Input type="password" value={hsConfig.database.postgres.pass} onChange={(e) => updateHsConfig('database.postgres.pass', e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* DNS */}
                <Card className="p-6 gap-0">
                  <div className="pb-4 border-b border-border/60">
                    <h3 className="text-lg font-semibold">{t.settings.hsconfig.dnsConfig}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.hsconfig.dnsConfigDesc}</p>
                  </div>
                  <div className="pt-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Base Domain</Label>
                        <Input value={hsConfig.dns.base_domain} onChange={(e) => updateHsConfig('dns.base_domain', e.target.value)} placeholder="bokro.network" />
                        <p className="text-xs text-muted-foreground">{t.settings.hsconfig.baseDomainDesc}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Extra Records Path</Label>
                        <Input value={hsConfig.dns.extra_records_path} onChange={(e) => updateHsConfig('dns.extra_records_path', e.target.value)} placeholder="/var/lib/headscale/extra-records.json" />
                        <p className="text-xs text-muted-foreground">{t.settings.hsconfig.extraRecordsPathDesc}</p>
                      </div>
                    </div>
                    <div className="divide-y divide-border/40">
                      <div className="flex items-center justify-between py-3">
                        <Label className="cursor-pointer">{t.settings.hsconfig.enableMagicDns}</Label>
                        <Switch checked={hsConfig.dns.magic_dns} onCheckedChange={(v) => updateHsConfig('dns.magic_dns', v)} />
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <Label className="cursor-pointer">{t.settings.hsconfig.overrideLocalDns}</Label>
                        <Switch checked={hsConfig.dns.override_local_dns} onCheckedChange={(v) => updateHsConfig('dns.override_local_dns', v)} />
                      </div>
                    </div>
                    {renderStringArrayEditor(t.settings.hsconfig.globalNameservers, 'dns.nameservers.global', '223.5.5.5')}
                    {renderStringArrayEditor('Search Domains', 'dns.search_domains', 'bokro.network')}
                  </div>
                </Card>

                {/* Policy */}
                <Card className="p-6 gap-0">
                  <h3 className="text-lg font-semibold pb-4 border-b border-border/60">{t.settings.hsconfig.policyConfig}</h3>
                  <div className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Policy Mode</Label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        value={hsConfig.policy.mode}
                        onChange={(e) => updateHsConfig('policy.mode', e.target.value)}
                      >
                        <option value="file">file</option>
                        <option value="database">database</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Policy Path</Label>
                      <Input value={hsConfig.policy.path} onChange={(e) => updateHsConfig('policy.path', e.target.value)} placeholder="/etc/headscale/acl.json" />
                    </div>
                  </div>
                </Card>

                {/* OIDC */}
                <Card className="p-6 gap-0">
                  <div className="pb-4 border-b border-border/60">
                    <h3 className="text-lg font-semibold">{t.settings.hsconfig.oidcConfigTitle}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.hsconfig.oidcConfigDesc}</p>
                  </div>
                  <div className="pt-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Issuer</Label>
                        <Input value={hsConfig.oidc.issuer} onChange={(e) => updateHsConfig('oidc.issuer', e.target.value)} placeholder="https://auth.bokro.cn" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Client ID</Label>
                        <Input value={hsConfig.oidc.client_id} onChange={(e) => updateHsConfig('oidc.client_id', e.target.value)} />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label>Client Secret</Label>
                        <Input type="password" value={hsConfig.oidc.client_secret} onChange={(e) => updateHsConfig('oidc.client_secret', e.target.value)} />
                      </div>
                    </div>
                    {renderStringArrayEditor('Scopes', 'oidc.scope', 'openid')}
                    {renderStringArrayEditor('Allowed Domains', 'oidc.allowed_domains', 'example.com')}
                    {renderStringArrayEditor('Allowed Users', 'oidc.allowed_users', 'user@example.com')}
                    <div className="divide-y divide-border/40">
                      <div className="flex items-center justify-between py-3">
                        <Label className="cursor-pointer">{t.settings.hsconfig.onlyStartIfOidcAvailable}</Label>
                        <Switch checked={hsConfig.oidc.only_start_if_oidc_is_available} onCheckedChange={(v) => updateHsConfig('oidc.only_start_if_oidc_is_available', v)} />
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <Label className="cursor-pointer">{t.settings.hsconfig.stripEmailDomain}</Label>
                        <Switch checked={hsConfig.oidc.strip_email_domain} onCheckedChange={(v) => updateHsConfig('oidc.strip_email_domain', v)} />
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Log Tail */}
                <Card className="p-6 gap-0">
                  <h3 className="text-lg font-semibold pb-4 border-b border-border/60">{t.settings.hsconfig.logTail}</h3>
                  <div className="pt-5 flex items-center justify-between py-3">
                    <div>
                      <Label className="cursor-pointer">{t.settings.hsconfig.enableLogTail}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.settings.hsconfig.logTailDesc}</p>
                    </div>
                    <Switch checked={hsConfig.logtail.enabled} onCheckedChange={(v) => updateHsConfig('logtail.enabled', v)} />
                  </div>
                </Card>

                {/* Bottom Save Button */}
                <div className="flex gap-2">
                  <Button onClick={handleSaveHsConfig} disabled={hsSaving} className="flex-1">
                    {hsSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {t.settings.hsconfig.saveToConfig}
                  </Button>
                  <Button variant="outline" onClick={handlePreviewYaml}>
                    <Eye className="w-4 h-4 mr-2" />
                    {t.settings.hsconfig.preview}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* System Settings Tab */}
          <TabsContent value="system" className="space-y-4">
            <Card className="p-6 gap-0">
              <div className="pb-4 border-b border-border/60">
                <h2 className="text-lg font-semibold">{t.settings.systemSettings.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.settings.systemSettings.description}
                </p>
              </div>

              <div className="pt-5 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="system-name">{t.settings.systemSettings.systemName}</Label>
                  <Input
                    id="system-name"
                    value={settings.systemName}
                    onChange={(e) =>
                      setSettings({ ...settings, systemName: e.target.value })
                    }
                    placeholder="Headscale Panel"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="system-url">{t.settings.systemSettings.systemUrl}</Label>
                  <Input
                    id="system-url"
                    value={settings.systemUrl}
                    onChange={(e) =>
                      setSettings({ ...settings, systemUrl: e.target.value })
                    }
                    placeholder="http://localhost"
                  />
                </div>

                <div className="divide-y divide-border/40">
                  <div className="flex items-center justify-between py-3">
                    <Label htmlFor="enable-registration" className="cursor-pointer">
                      {t.settings.systemSettings.allowRegistration}
                    </Label>
                    <Switch
                      id="enable-registration"
                      checked={settings.enableRegistration}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, enableRegistration: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <Label htmlFor="enable-notifications" className="cursor-pointer">
                      {t.settings.systemSettings.enableNotifications}
                    </Label>
                    <Switch
                      id="enable-notifications"
                      checked={settings.enableNotifications}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, enableNotifications: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <div>
                      <Label htmlFor="enable-builtin-oidc" className="cursor-pointer">
                        {t.settings.systemSettings.enableBuiltinOidc}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.settings.systemSettings.builtinOidcDesc}
                      </p>
                    </div>
                    <Switch
                      id="enable-builtin-oidc"
                      checked={settings.enableBuiltinOIDC}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, enableBuiltinOIDC: checked })
                      }
                    />
                  </div>
                </div>

                <Button onClick={() => handleSave('system')} className="w-full">
                  {t.settings.systemSettings.saveSettings}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Security Settings Tab */}
          <TabsContent value="security" className="space-y-4">
            <Card className="p-6 gap-0">
              <div className="pb-4 border-b border-border/60">
                <h2 className="text-lg font-semibold">{t.settings.securitySettings.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.settings.securitySettings.description}
                </p>
              </div>

              <div className="pt-5 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="session-timeout">{t.settings.securitySettings.sessionTimeout}</Label>
                  <Input
                    id="session-timeout"
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sessionTimeout: parseInt(e.target.value),
                      })
                    }
                    min="1"
                    max="720"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.settings.securitySettings.sessionTimeoutDesc}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password-min-length">{t.settings.securitySettings.passwordMinLength}</Label>
                  <Input
                    id="password-min-length"
                    type="number"
                    value={settings.passwordMinLength}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        passwordMinLength: parseInt(e.target.value),
                      })
                    }
                    min="6"
                    max="32"
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <Label htmlFor="require-mfa" className="cursor-pointer">
                    {t.settings.securitySettings.requireMfa}
                  </Label>
                  <Switch
                    id="require-mfa"
                    checked={settings.requireMfa}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, requireMfa: checked })
                    }
                  />
                </div>

                <Button onClick={() => handleSave('security')} className="w-full">
                  {t.settings.securitySettings.saveSettings}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* OIDC Configuration Tab */}
          <TabsContent value="oidc" className="space-y-4">
            <Card className="p-6 gap-0">
              <div className="pb-4 border-b border-border/60">
                <h2 className="text-lg font-semibold">{t.settings.oidcSettings.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.settings.oidcSettings.description}
                </p>
              </div>

              <div className="pt-5 space-y-5">
                <div className="flex items-center justify-between py-3">
                  <Label htmlFor="oidc-enabled" className="cursor-pointer">
                    {t.settings.oidcSettings.enableProvider}
                  </Label>
                  <Switch
                    id="oidc-enabled"
                    checked={settings.enableBuiltinOIDC}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, enableBuiltinOIDC: checked })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Issuer URL</Label>
                  <Input
                    value={settings.systemUrl}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.settings.oidcSettings.issuerUrlDesc}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Discovery Endpoint</Label>
                  <Input
                    value={`${settings.systemUrl}/.well-known/openid-configuration`}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.settings.oidcSettings.discoveryDesc}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-token-expiry">{t.settings.oidcSettings.accessTokenExpiry}</Label>
                    <Input
                      id="oidc-token-expiry"
                      type="number"
                      value={settings.oidcTokenExpiry}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          oidcTokenExpiry: parseInt(e.target.value),
                        })
                      }
                      min="300"
                      max="86400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-refresh-expiry">{t.settings.oidcSettings.refreshTokenExpiry}</Label>
                    <Input
                      id="oidc-refresh-expiry"
                      type="number"
                      value={settings.oidcRefreshTokenExpiry}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          oidcRefreshTokenExpiry: parseInt(e.target.value),
                        })
                      }
                      min="1"
                      max="8760"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between py-3">
                  <Label htmlFor="oidc-allow-registration" className="cursor-pointer">
                    {t.settings.oidcSettings.allowAutoRegistration}
                  </Label>
                  <Switch
                    id="oidc-allow-registration"
                    checked={settings.oidcAllowRegistration}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, oidcAllowRegistration: checked })
                    }
                  />
                </div>

                <Button onClick={() => handleSave('OIDC')} className="w-full">
                  {t.settings.oidcSettings.saveSettings}
                </Button>
              </div>
            </Card>

            <Card className="p-6 gap-0">
              <h3 className="text-lg font-semibold pb-4 border-b border-border/60">{t.settings.oidcSettings.oauth2Management}</h3>
              <p className="text-sm text-muted-foreground pt-5 mb-4">
                {t.settings.oidcSettings.oauth2Desc}
              </p>
              <Button variant="outline" className="w-full" onClick={() => toast.info(t.settings.toast.goToOauth2)}>
                {t.settings.oidcSettings.manageClients}
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
