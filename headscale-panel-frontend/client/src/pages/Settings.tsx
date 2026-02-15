import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { headscaleConfigAPI } from '@/lib/api';
import api from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Plus, X, AlertTriangle } from 'lucide-react';

interface GrpcConnectionForm {
  serverUrl: string;
  apiKey: string;
  skipTls: boolean;
}

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

function SectionCard({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
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

export default function Settings() {
  const t = useTranslation();
  const [grpcForm, setGrpcForm] = useState<GrpcConnectionForm>({
    serverUrl: '',
    apiKey: '',
    skipTls: false,
  });
  const [oidcForm, setOidcForm] = useState<OIDCForm>(defaultOIDCForm);
  const [fullConfig, setFullConfig] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingGrpc, setSavingGrpc] = useState(false);
  const [savingOidc, setSavingOidc] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const data: any = await headscaleConfigAPI.get();
      if (data) {
        setFullConfig(data);
        setGrpcForm({
          serverUrl: data.grpc_listen_addr || '',
          apiKey: '',
          skipTls: data.grpc_allow_insecure || false,
        });
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
    } catch {
      toast.error(t.common.errors.requestFailed);
    } finally {
      setLoadingConfig(false);
    }
  }, [t]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const data: any = await api.post('/setup/connectivity-check', {
        headscale_grpc_addr: grpcForm.serverUrl,
        api_key: grpcForm.apiKey,
        strict_api: !!grpcForm.apiKey,
        grpc_allow_insecure: grpcForm.skipTls,
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
    if (!fullConfig) return;
    setSavingGrpc(true);
    try {
      const updated = {
        ...fullConfig,
        grpc_listen_addr: grpcForm.serverUrl,
        grpc_allow_insecure: grpcForm.skipTls,
      };
      await headscaleConfigAPI.update(updated);
      toast.success(t.settings.toast.configSaved);
      toast.info(t.settings.toast.restartRequired, { duration: 6000, icon: <AlertTriangle className="w-4 h-4" /> });
      loadConfig();
    } catch {
      toast.error(t.common.errors.requestFailed);
    } finally {
      setSavingGrpc(false);
    }
  };

  const handleSaveOidc = async () => {
    if (!fullConfig) return;
    setSavingOidc(true);
    try {
      const oidcConfig: any = {};
      if (oidcForm.enabled) {
        oidcConfig.only_start_if_oidc_is_available = oidcForm.only_start_if_oidc_is_available;
        oidcConfig.issuer = oidcForm.issuer;
        oidcConfig.client_id = oidcForm.client_id;
        oidcConfig.client_secret = oidcForm.client_secret;
        if (oidcForm.client_secret_path) oidcConfig.client_secret_path = oidcForm.client_secret_path;
        oidcConfig.scope = oidcForm.scope.filter(Boolean);
        oidcConfig.email_verified_required = oidcForm.email_verified_required;
        if (oidcForm.allowed_domains.length) oidcConfig.allowed_domains = oidcForm.allowed_domains.filter(Boolean);
        if (oidcForm.allowed_users.length) oidcConfig.allowed_users = oidcForm.allowed_users.filter(Boolean);
        if (oidcForm.allowed_groups.length) oidcConfig.allowed_groups = oidcForm.allowed_groups.filter(Boolean);
        oidcConfig.strip_email_domain = oidcForm.strip_email_domain;
        oidcConfig.expiry = oidcForm.expiry;
        oidcConfig.use_expiry_from_token = oidcForm.use_expiry_from_token;
        oidcConfig.pkce = { enabled: oidcForm.pkce_enabled, method: oidcForm.pkce_method };
      }
      const updated = { ...fullConfig, oidc: oidcConfig };
      await headscaleConfigAPI.update(updated);
      toast.success(t.settings.toast.configSaved);
      toast.info(t.settings.toast.restartRequired, { duration: 6000, icon: <AlertTriangle className="w-4 h-4" /> });
      loadConfig();
    } catch {
      toast.error(t.common.errors.requestFailed);
    } finally {
      setSavingOidc(false);
    }
  };

  if (loadingConfig) {
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
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.settings.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.settings.description}</p>
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
            >
              <FieldRow label={t.settings.headscaleConnection.serverUrlLabel} description={t.settings.headscaleConnection.serverUrlDesc}>
                <Input
                  value={grpcForm.serverUrl}
                  onChange={(e) => setGrpcForm(prev => ({ ...prev, serverUrl: e.target.value }))}
                  placeholder="0.0.0.0:50443"
                />
              </FieldRow>

              <FieldRow label={t.settings.headscaleConnection.apiKeyLabel} description={t.settings.headscaleConnection.apiKeyDesc}>
                <Input
                  value={grpcForm.apiKey}
                  onChange={(e) => setGrpcForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={t.settings.headscaleConnection.apiKeyPlaceholder}
                  type="password"
                />
              </FieldRow>

              <SwitchRow
                label={t.settings.headscaleConnection.skipTlsLabel}
                description={t.settings.headscaleConnection.skipTlsDesc}
                checked={grpcForm.skipTls}
                onCheckedChange={(v) => setGrpcForm(prev => ({ ...prev, skipTls: v }))}
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
                <div className="space-y-4 pt-2 border-t border-border">
                  {/* Basic */}
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
                      placeholder="••••••••"
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

                  {/* Scope */}
                  <FieldRow label={t.settings.oidcConfig.scopeLabel} description={t.settings.oidcConfig.scopeDesc}>
                    <ArrayEditor
                      value={oidcForm.scope}
                      onChange={(v) => setOidcForm(prev => ({ ...prev, scope: v }))}
                      placeholder="openid"
                    />
                  </FieldRow>

                  {/* Expiry */}
                  <FieldRow label={t.settings.oidcConfig.expiryLabel} description={t.settings.oidcConfig.expiryDesc}>
                    <Input
                      value={oidcForm.expiry}
                      onChange={(e) => setOidcForm(prev => ({ ...prev, expiry: e.target.value }))}
                      placeholder="180d"
                    />
                  </FieldRow>

                  {/* Toggles */}
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

                  {/* PKCE */}
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

                  {/* Allowed Domains */}
                  <FieldRow label={t.settings.oidcConfig.allowedDomainsLabel} description={t.settings.oidcConfig.allowedDomainsDesc}>
                    <ArrayEditor
                      value={oidcForm.allowed_domains}
                      onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_domains: v }))}
                      placeholder="example.com"
                    />
                  </FieldRow>

                  {/* Allowed Users */}
                  <FieldRow label={t.settings.oidcConfig.allowedUsersLabel} description={t.settings.oidcConfig.allowedUsersDesc}>
                    <ArrayEditor
                      value={oidcForm.allowed_users}
                      onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_users: v }))}
                      placeholder="user@example.com"
                    />
                  </FieldRow>

                  {/* Allowed Groups */}
                  <FieldRow label={t.settings.oidcConfig.allowedGroupsLabel} description={t.settings.oidcConfig.allowedGroupsDesc}>
                    <ArrayEditor
                      value={oidcForm.allowed_groups}
                      onChange={(v) => setOidcForm(prev => ({ ...prev, allowed_groups: v }))}
                      placeholder="group-name"
                    />
                  </FieldRow>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button onClick={handleSaveOidc} disabled={savingOidc}>
                  {savingOidc ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {t.common.actions.save}
                </Button>
              </div>
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
