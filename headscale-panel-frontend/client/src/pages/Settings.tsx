import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { headscaleConfigAPI, panelSettingsAPI } from '@/lib/api';
import api from '@/lib/api';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Plus, X, CheckCircle2, ShieldCheck, Database, Eye, EyeOff, Copy, Check } from 'lucide-react';

/* -- Helper Components -- */

function ArrayEditor({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const addItem = () => onChange([...value, '']);
  const removeItem = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const updateItem = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button variant="ghost" size="icon" onClick={() => removeItem(i)} className="shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem}>
        <Plus className="w-4 h-4 mr-1" />
        {placeholder || 'Add'}
      </Button>
    </div>
  );
}

function SectionCard({ title, description, children, actions }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

function FieldRow({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function SwitchRow({ label, description, checked, onCheckedChange }: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/* -- OIDC Form Types -- */

interface OIDCForm {
  enabled: boolean;
  only_start_if_oidc_is_available: boolean;
  issuer: string;
  client_id: string;
  client_secret: string;
  client_secret_path: string;
  scope: string[];
  email_verified_required: boolean;
  allowed_domains: string[];
  allowed_users: string[];
  allowed_groups: string[];
  strip_email_domain: boolean;
  expiry: string;
  use_expiry_from_token: boolean;
  pkce_enabled: boolean;
  pkce_method: string;
}

const defaultOIDCForm: OIDCForm = {
  enabled: false,
  only_start_if_oidc_is_available: false,
  issuer: '',
  client_id: '',
  client_secret: '',
  client_secret_path: '',
  scope: ['openid', 'profile', 'email'],
  email_verified_required: false,
  allowed_domains: [],
  allowed_users: [],
  allowed_groups: [],
  strip_email_domain: false,
  expiry: '180d',
  use_expiry_from_token: false,
  pkce_enabled: true,
  pkce_method: 'S256',
};

/* -- Main Component -- */

export default function Settings() {
  const t = useTranslation();

  // Panel connection state
  const [grpcAddr, setGrpcAddr] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [insecure, setInsecure] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // OIDC state
  const [oidcForm, setOidcForm] = useState<OIDCForm>(defaultOIDCForm);
  const [fullConfig, setFullConfig] = useState<any>(null);
  const [useBuiltinOidc, setUseBuiltinOidc] = useState(false);
  const [builtinOidcLoading, setBuiltinOidcLoading] = useState(false);

  // Loading
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingGrpc, setSavingGrpc] = useState(false);
  const [savingOidc, setSavingOidc] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // OIDC preview
  const [previewCopied, setPreviewCopied] = useState(false);

  /* -- Load panel connection settings -- */
  const loadConnectionSettings = useCallback(async () => {
    setLoadingConnection(true);
    try {
      const data: any = await panelSettingsAPI.getConnection();
      if (data) {
        setGrpcAddr(data.grpc_addr || '');
        setInsecure(data.insecure || false);
        setHasApiKey(!!data.has_api_key);
        setIsConnected(!!data.is_connected);
        setApiKeyInput('');
        setShowApiKeyInput(false);
      }
    } catch {
      toast.error(t.common.errors.requestFailed);
    } finally {
      setLoadingConnection(false);
    }
  }, [t]);

  /* -- Load headscale config (for OIDC section) -- */
  const loadHeadscaleConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      // First try to load saved panel OIDC settings
      const saved: any = await panelSettingsAPI.getOIDCSettings().catch(() => null);
      if (saved) {
        setOidcForm({
          enabled: saved.enabled ?? false,
          only_start_if_oidc_is_available: saved.only_start_if_oidc_is_available ?? false,
          issuer: saved.issuer || '',
          client_id: saved.client_id || '',
          client_secret: saved.client_secret || '',
          client_secret_path: saved.client_secret_path || '',
          scope: saved.scope?.length ? saved.scope : ['openid', 'profile', 'email'],
          email_verified_required: saved.email_verified_required ?? false,
          allowed_domains: saved.allowed_domains || [],
          allowed_users: saved.allowed_users || [],
          allowed_groups: saved.allowed_groups || [],
          strip_email_domain: saved.strip_email_domain ?? false,
          expiry: saved.expiry || '180d',
          use_expiry_from_token: saved.use_expiry_from_token ?? false,
          pkce_enabled: saved.pkce_enabled ?? true,
          pkce_method: saved.pkce_method || 'S256',
        });
      } else {
        // Fallback: try loading from headscale config file
        const data: any = await headscaleConfigAPI.get().catch(() => null);
        if (data) {
          setFullConfig(data);
          if (data.oidc) {
            const o = data.oidc;
            setOidcForm({
              enabled: !!(o.issuer || o.client_id),
              only_start_if_oidc_is_available: o.only_start_if_oidc_is_available || false,
              issuer: o.issuer || '',
              client_id: o.client_id || '',
              client_secret: o.client_secret || '',
              client_secret_path: o.client_secret_path || '',
              scope: o.scope?.length ? o.scope : ['openid', 'profile', 'email'],
              email_verified_required: o.email_verified_required || false,
              allowed_domains: o.allowed_domains || [],
              allowed_users: o.allowed_users || [],
              allowed_groups: o.allowed_groups || [],
              strip_email_domain: o.strip_email_domain || false,
              expiry: o.expiry || '180d',
              use_expiry_from_token: o.use_expiry_from_token || false,
              pkce_enabled: o.pkce?.enabled ?? true,
              pkce_method: o.pkce?.method || 'S256',
            });
          }
        }
      }
    } catch {
      // Config may not exist yet
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConnectionSettings();
    loadHeadscaleConfig();
  }, [loadConnectionSettings, loadHeadscaleConfig]);

  /* -- Generate OIDC YAML preview -- */
  const oidcYamlPreview = useMemo(() => {
    if (!oidcForm.enabled) return '';
    const lines: string[] = ['oidc:'];
    lines.push('  only_start_if_oidc_is_available: ' + oidcForm.only_start_if_oidc_is_available);
    lines.push('  issuer: "' + (oidcForm.issuer || 'https://sso.example.com') + '"');
    lines.push('  client_id: "' + (oidcForm.client_id || 'headscale') + '"');
    if (oidcForm.client_secret_path) {
      lines.push('  client_secret_path: "' + oidcForm.client_secret_path + '"');
    } else {
      const secret = oidcForm.client_secret === '******' ? '<your-secret>' : (oidcForm.client_secret || '<your-secret>');
      lines.push('  client_secret: "' + secret + '"');
    }
    if (oidcForm.scope.length > 0) {
      lines.push('  scope: [' + oidcForm.scope.filter(Boolean).map(s => '"' + s + '"').join(', ') + ']');
    }
    if (oidcForm.expiry) {
      lines.push('  expiry: "' + oidcForm.expiry + '"');
    }
    lines.push('  email_verified_required: ' + oidcForm.email_verified_required);
    lines.push('  strip_email_domain: ' + oidcForm.strip_email_domain);
    lines.push('  use_expiry_from_token: ' + oidcForm.use_expiry_from_token);
    if (oidcForm.allowed_domains.filter(Boolean).length > 0) {
      lines.push('  allowed_domains:');
      oidcForm.allowed_domains.filter(Boolean).forEach(d => lines.push('    - "' + d + '"'));
    }
    if (oidcForm.allowed_users.filter(Boolean).length > 0) {
      lines.push('  allowed_users:');
      oidcForm.allowed_users.filter(Boolean).forEach(u => lines.push('    - "' + u + '"'));
    }
    if (oidcForm.allowed_groups.filter(Boolean).length > 0) {
      lines.push('  allowed_groups:');
      oidcForm.allowed_groups.filter(Boolean).forEach(g => lines.push('    - "' + g + '"'));
    }
    lines.push('  pkce:');
    lines.push('    enabled: ' + oidcForm.pkce_enabled);
    lines.push('    method: ' + (oidcForm.pkce_method || 'S256'));
    return lines.join('\n');
  }, [oidcForm]);

  /* -- Handlers -- */

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const effectiveAddr = grpcAddr.trim() || undefined;
      const effectiveKey = apiKeyInput.trim() || undefined;
      const data: any = await api.post('/setup/connectivity-check', {
        headscale_grpc_addr: effectiveAddr,
        api_key: effectiveKey,
        strict_api: !!effectiveKey,
        grpc_allow_insecure: insecure,
      });
      const allOk = data?.all_reachable === true;
      if (allOk) {
        toast.success(t.settings.headscaleConnection.connectionTestDesc);
      } else {
        toast.error(t.setupWelcome.toastConnectivityFailed);
      }
    } catch {
      toast.error(t.common.errors.requestFailed);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveGrpc = async () => {
    if (!grpcAddr.trim()) {
      toast.error(t.setupWelcome.toastGrpcRequired);
      return;
    }
    setSavingGrpc(true);
    try {
      await panelSettingsAPI.saveConnection({
        grpc_addr: grpcAddr.trim(),
        api_key: apiKeyInput.trim() || undefined,
        insecure,
      });
      toast.success(t.settings.toast.connectionSaved);
      setApiKeyInput('');
      setShowApiKeyInput(false);
      loadConnectionSettings();
    } catch {
      toast.error(t.common.errors.requestFailed);
    } finally {
      setSavingGrpc(false);
    }
  };

  const handleToggleBuiltinOidc = async (enabled: boolean) => {
    setUseBuiltinOidc(enabled);
    if (enabled) {
      setBuiltinOidcLoading(true);
      try {
        const data: any = await panelSettingsAPI.enableBuiltinOIDC();
        if (data) {
          setOidcForm(prev => ({
            ...prev,
            enabled: true,
            issuer: data.issuer || '',
            client_id: data.client_id || '',
            client_secret: data.client_secret || '',
            scope: data.scope || ['openid', 'profile', 'email'],
          }));
          toast.success(t.settings.toast.builtinOidcEnabled);
        }
      } catch {
        toast.error(t.common.errors.requestFailed);
        setUseBuiltinOidc(false);
      } finally {
        setBuiltinOidcLoading(false);
      }
    }
  };

  const handleSyncData = async () => {
    setSyncing(true);
    try {
      await panelSettingsAPI.syncData();
      toast.success(t.settings.toast.syncSuccess);
    } catch {
      toast.error(t.settings.toast.syncFailed);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveOidc = async () => {
    setSavingOidc(true);
    try {
      await panelSettingsAPI.saveOIDCSettings(oidcForm);
      toast.success(t.settings.toast.oidcSettingsSaved);
    } catch {
      toast.error(t.common.errors.requestFailed);
    } finally {
      setSavingOidc(false);
    }
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(oidcYamlPreview);
    setPreviewCopied(true);
    toast.success(t.settings.oidcConfig.previewCopied);
    setTimeout(() => setPreviewCopied(false), 2000);
  };

  const loading = loadingConnection || loadingConfig;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.settings.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t.settings.description}</p>
          </div>
        </div>

        <Tabs defaultValue="grpc" className="space-y-4">
          <TabsList>
            <TabsTrigger value="grpc">{t.settings.tabs.headscale}</TabsTrigger>
            <TabsTrigger value="oidc">{t.settings.tabs.oidc}</TabsTrigger>
          </TabsList>

          {/* gRPC Connection Tab */}
          <TabsContent value="grpc" className="space-y-4">
            <SectionCard
              title={t.settings.headscaleConnection.title}
              description={t.settings.headscaleConnection.description}
              actions={
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <Badge variant="outline" className="text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-800">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {t.common.status.online}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-destructive border-destructive/30">
                      {t.common.status.offline}
                    </Badge>
                  )}
                </div>
              }
            >
              <FieldRow label={t.settings.headscaleConnection.serverUrlLabel} description={t.settings.headscaleConnection.serverUrlDesc}>
                <Input
                  value={grpcAddr}
                  onChange={(e) => setGrpcAddr(e.target.value)}
                  placeholder="127.0.0.1:50443"
                />
              </FieldRow>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t.settings.headscaleConnection.apiKeyLabel}</Label>
                  <div className="flex items-center gap-2">
                    {hasApiKey && !showApiKeyInput && (
                      <Badge variant="secondary" className="text-xs">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        {t.settings.headscaleConnection.apiKeyConfigured}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                    >
                      {showApiKeyInput ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                      {showApiKeyInput ? t.settings.headscaleConnection.hideApiKey : t.settings.headscaleConnection.changeApiKey}
                    </Button>
                  </div>
                </div>
                {showApiKeyInput && (
                  <Input
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={hasApiKey ? t.settings.headscaleConnection.apiKeyKeepPlaceholder : t.settings.headscaleConnection.apiKeyPlaceholder}
                    type="password"
                  />
                )}
                <p className="text-xs text-muted-foreground">{t.settings.headscaleConnection.apiKeyDesc}</p>
              </div>

              <SwitchRow
                label={t.settings.headscaleConnection.skipTlsLabel}
                description={t.settings.headscaleConnection.skipTlsDesc}
                checked={insecure}
                onCheckedChange={setInsecure}
              />

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleTestConnection} disabled={testingConnection}>
                  {testingConnection ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t.settings.headscaleConnection.testConnection}
                </Button>
                <Button onClick={handleSaveGrpc} disabled={savingGrpc}>
                  {savingGrpc ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {t.settings.headscaleConnection.saveSettings}
                </Button>
              </div>
            </SectionCard>

            {/* Data Sync Section */}
            <SectionCard
              title={t.settings.dataSync.title}
              description={t.settings.dataSync.description}
            >
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleSyncData} disabled={syncing}>
                  {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
                  {t.settings.dataSync.syncButton}
                </Button>
              </div>
            </SectionCard>
          </TabsContent>

          {/* OIDC Tab */}
          <TabsContent value="oidc" className="space-y-4">
            <SectionCard
              title={t.settings.oidcConfig.title}
              description={t.settings.oidcConfig.description}
            >
              <SwitchRow
                label={t.settings.oidcConfig.enableOidc}
                description={t.settings.oidcConfig.enableOidcDesc}
                checked={oidcForm.enabled}
                onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, enabled: v }))}
              />
              {oidcForm.enabled && (
                <div className="flex items-center justify-between py-1 border-t pt-3 mt-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t.settings.oidcConfig.useBuiltinOidc}</Label>
                    <p className="text-xs text-muted-foreground">{t.settings.oidcConfig.useBuiltinOidcDesc}</p>
                  </div>
                  <Button
                    variant={useBuiltinOidc ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleToggleBuiltinOidc(!useBuiltinOidc)}
                    disabled={builtinOidcLoading}
                  >
                    {builtinOidcLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                    {useBuiltinOidc ? t.settings.oidcConfig.builtinOidcActive : t.settings.oidcConfig.enableBuiltinBtn}
                  </Button>
                </div>
              )}
            </SectionCard>

            {oidcForm.enabled && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Left: OIDC Settings Form */}
                <Card className="p-6 space-y-4">
                  <h3 className="text-base font-semibold text-foreground">{t.settings.oidcConfig.settingsTitle}</h3>

                  <FieldRow label={t.settings.oidcConfig.issuerLabel}>
                    <Input
                      value={oidcForm.issuer}
                      onChange={(e) => setOidcForm(prev => ({ ...prev, issuer: e.target.value }))}
                      placeholder="https://sso.example.com"
                    />
                  </FieldRow>

                  <FieldRow label={t.settings.oidcConfig.clientIdLabel}>
                    <Input
                      value={oidcForm.client_id}
                      onChange={(e) => setOidcForm(prev => ({ ...prev, client_id: e.target.value }))}
                      placeholder="headscale"
                    />
                  </FieldRow>

                  <FieldRow label={t.settings.oidcConfig.clientSecretLabel}>
                    <Input
                      value={oidcForm.client_secret}
                      onChange={(e) => setOidcForm(prev => ({ ...prev, client_secret: e.target.value }))}
                      placeholder="--------"
                      type="password"
                    />
                  </FieldRow>

                  <FieldRow label={t.settings.oidcConfig.clientSecretPathLabel} description={t.settings.oidcConfig.clientSecretPathDesc}>
                    <Input
                      value={oidcForm.client_secret_path}
                      onChange={(e) => setOidcForm(prev => ({ ...prev, client_secret_path: e.target.value }))}
                      placeholder="/path/to/client_secret"
                    />
                  </FieldRow>

                  <FieldRow label={t.settings.oidcConfig.scopeLabel} description={t.settings.oidcConfig.scopeDesc}>
                    <ArrayEditor
                      value={oidcForm.scope}
                      onChange={(v) => setOidcForm(prev => ({ ...prev, scope: v }))}
                      placeholder="openid"
                    />
                  </FieldRow>

                  <FieldRow label={t.settings.oidcConfig.expiryLabel} description={t.settings.oidcConfig.expiryDesc}>
                    <Input
                      value={oidcForm.expiry}
                      onChange={(e) => setOidcForm(prev => ({ ...prev, expiry: e.target.value }))}
                      placeholder="180d"
                    />
                  </FieldRow>

                  <SwitchRow
                    label={t.settings.oidcConfig.onlyStartIfAvailable}
                    checked={oidcForm.only_start_if_oidc_is_available}
                    onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, only_start_if_oidc_is_available: v }))}
                  />

                  <SwitchRow
                    label={t.settings.oidcConfig.emailVerifiedRequired}
                    checked={oidcForm.email_verified_required}
                    onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, email_verified_required: v }))}
                  />

                  <SwitchRow
                    label={t.settings.oidcConfig.stripEmailDomain}
                    checked={oidcForm.strip_email_domain}
                    onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, strip_email_domain: v }))}
                  />

                  <SwitchRow
                    label={t.settings.oidcConfig.useExpiryFromToken}
                    checked={oidcForm.use_expiry_from_token}
                    onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, use_expiry_from_token: v }))}
                  />

                  <SwitchRow
                    label={t.settings.oidcConfig.pkceEnabled}
                    description={t.settings.oidcConfig.pkceDesc}
                    checked={oidcForm.pkce_enabled}
                    onCheckedChange={(v) => setOidcForm(prev => ({ ...prev, pkce_enabled: v }))}
                  />

                  {oidcForm.pkce_enabled && (
                    <FieldRow label={t.settings.oidcConfig.pkceMethod}>
                      <Input
                        value={oidcForm.pkce_method}
                        onChange={(e) => setOidcForm(prev => ({ ...prev, pkce_method: e.target.value }))}
                        placeholder="S256"
                      />
                    </FieldRow>
                  )}

                  <FieldRow label={t.settings.oidcConfig.allowedDomainsLabel} description={t.settings.oidcConfig.allowedDomainsDesc}>
                    <ArrayEditor
                      value={oidcForm.allowed_domains}
                      onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_domains: v }))}
                      placeholder="example.com"
                    />
                  </FieldRow>

                  <FieldRow label={t.settings.oidcConfig.allowedUsersLabel} description={t.settings.oidcConfig.allowedUsersDesc}>
                    <ArrayEditor
                      value={oidcForm.allowed_users}
                      onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_users: v }))}
                      placeholder="user@example.com"
                    />
                  </FieldRow>

                  <FieldRow label={t.settings.oidcConfig.allowedGroupsLabel} description={t.settings.oidcConfig.allowedGroupsDesc}>
                    <ArrayEditor
                      value={oidcForm.allowed_groups}
                      onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_groups: v }))}
                      placeholder="group-name"
                    />
                  </FieldRow>

                  <div className="pt-4 border-t">
                    <Button onClick={handleSaveOidc} disabled={savingOidc} className="w-full">
                      {savingOidc ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      {t.settings.oidcConfig.saveOidcSettings}
                    </Button>
                  </div>
                </Card>

                {/* Right: OIDC YAML Preview */}
                <Card className="p-6 space-y-4 xl:sticky xl:top-4 xl:self-start">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-foreground">{t.settings.oidcConfig.previewTitle}</h3>
                    <Button variant="ghost" size="sm" onClick={handleCopyPreview}>
                      {previewCopied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                      {previewCopied ? t.settings.oidcConfig.previewCopied : t.settings.oidcConfig.copyPreview}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.settings.oidcConfig.previewDesc}</p>
                  <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-auto max-h-[600px] whitespace-pre-wrap break-words">
                    {oidcYamlPreview || t.settings.oidcConfig.previewEmpty}
                  </pre>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
