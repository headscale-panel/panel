import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function OIDCSettings() {
  const t = useTranslation();
  const [useBuiltIn, setUseBuiltIn] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(t.oidcSettingsPage.copied);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.oidcSettingsPage.title}</h1>
          <p className="text-muted-foreground mt-1">
            {t.oidcSettingsPage.description}
          </p>
        </div>

        <Tabs defaultValue="provider" className="space-y-6">
          <TabsList>
            <TabsTrigger value="provider">{t.oidcSettingsPage.tabs.provider}</TabsTrigger>
            <TabsTrigger value="clients">{t.oidcSettingsPage.tabs.clients}</TabsTrigger>
          </TabsList>

          {/* OIDC Provider Tab */}
          <TabsContent value="provider" className="space-y-6">
            {/* Provider Type Selection */}
            <Card className="p-6 transition-all hover:shadow-md">
              <h2 className="text-xl font-semibold mb-4">{t.oidcSettingsPage.providerType.title}</h2>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={useBuiltIn}
                  onCheckedChange={setUseBuiltIn}
                  id="provider-type"
                />
                <Label htmlFor="provider-type" className="cursor-pointer">
                  {useBuiltIn ? t.oidcSettingsPage.providerType.builtIn : t.oidcSettingsPage.providerType.thirdParty}
                </Label>
              </div>
            </Card>

            {/* Built-in OIDC Server */}
            {useBuiltIn && (
              <Card className="p-6 space-y-6 animate-in slide-in-from-top duration-300">
                <div>
                  <h2 className="text-xl font-semibold mb-2">{t.oidcSettingsPage.builtIn.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t.oidcSettingsPage.builtIn.description}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Issuer URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value="http://localhost/oidc"
                        readOnly
                        className="font-mono"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy('http://localhost/oidc')}
                      >
                        {copied ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Discovery URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value="http://localhost/oidc/.well-known/openid-configuration"
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          handleCopy(
                            'http://localhost/oidc/.well-known/openid-configuration'
                          )
                        }
                      >
                        {copied ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="token-expiry">{t.oidcSettingsPage.builtIn.tokenExpiry}</Label>
                      <Input
                        id="token-expiry"
                        type="number"
                        defaultValue="24"
                        min="1"
                        max="720"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="refresh-token">{t.oidcSettingsPage.builtIn.refreshTokenExpiry}</Label>
                      <Input
                        id="refresh-token"
                        type="number"
                        defaultValue="30"
                        min="1"
                        max="365"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch id="allow-registration" defaultChecked />
                    <Label htmlFor="allow-registration" className="cursor-pointer">
                      {t.oidcSettingsPage.builtIn.allowRegistration}
                    </Label>
                  </div>

                  <Button className="w-full">{t.oidcSettingsPage.builtIn.saveConfig}</Button>
                </div>
              </Card>
            )}

            {/* Third-party OIDC Provider */}
            {!useBuiltIn && (
              <Card className="p-6 space-y-6 animate-in slide-in-from-top duration-300">
                <div>
                  <h2 className="text-xl font-semibold mb-2">
                    {t.oidcSettingsPage.thirdParty.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t.oidcSettingsPage.thirdParty.description}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="provider-name">{t.oidcSettingsPage.thirdParty.providerName}</Label>
                    <Input
                      id="provider-name"
                      placeholder={t.oidcSettingsPage.thirdParty.providerNamePlaceholder}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="issuer-url">Issuer URL</Label>
                    <Input
                      id="issuer-url"
                      placeholder="https://your-domain.auth0.com"
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="client-id">Client ID</Label>
                    <Input id="client-id" placeholder="your-client-id" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="client-secret">Client Secret</Label>
                    <Input
                      id="client-secret"
                      type="password"
                      placeholder="your-client-secret"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="redirect-uri">Redirect URI</Label>
                    <Input
                      id="redirect-uri"
                      value="http://localhost/auth/callback"
                      readOnly
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scopes">{t.oidcSettingsPage.thirdParty.scopes}</Label>
                    <Input
                      id="scopes"
                      defaultValue="openid, profile, email"
                      placeholder="openid, profile, email"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button className="flex-1">{t.oidcSettingsPage.thirdParty.testConnection}</Button>
                    <Button className="flex-1" variant="outline">
                      {t.oidcSettingsPage.thirdParty.saveConfig}
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* OAuth2 Clients Tab */}
          <TabsContent value="clients" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">{t.oidcSettingsPage.clients.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.oidcSettingsPage.clients.description}
                </p>
              </div>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                {t.oidcSettingsPage.clients.addClient}
              </Button>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.oidcSettingsPage.clients.clientName}</TableHead>
                    <TableHead>Client ID</TableHead>
                    <TableHead>Redirect URIs</TableHead>
                    <TableHead>{t.oidcSettingsPage.clients.createdAt}</TableHead>
                    <TableHead className="text-right">{t.oidcSettingsPage.clients.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">Headscale</TableCell>
                    <TableCell className="font-mono text-sm">
                      headscale-client
                    </TableCell>
                    <TableCell className="text-sm">
                      http://localhost/auth/callback
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      2024-01-01
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm">
                          {t.common.actions.edit}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>

            {/* Add Client Form */}
            <Card className="p-6 space-y-6">
              <h3 className="text-lg font-semibold">{t.oidcSettingsPage.clients.createTitle}</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-client-name">{t.oidcSettingsPage.clients.clientNameLabel}</Label>
                  <Input
                    id="new-client-name"
                    placeholder={t.oidcSettingsPage.clients.clientNamePlaceholder}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-client-id">{t.oidcSettingsPage.clients.clientIdLabel}</Label>
                  <Input
                    id="new-client-id"
                    placeholder="my-app-client"
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-redirect-uris">
                    {t.oidcSettingsPage.clients.redirectUrisLabel}
                  </Label>
                  <Textarea
                    id="new-redirect-uris"
                    placeholder="http://localhost:3000/callback&#10;https://myapp.com/callback"
                    rows={4}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grant-types">Grant Types</Label>
                  <Select defaultValue="authorization_code">
                    <SelectTrigger id="grant-types">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="authorization_code">
                        Authorization Code
                      </SelectItem>
                      <SelectItem value="implicit">Implicit</SelectItem>
                      <SelectItem value="client_credentials">
                        Client Credentials
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch id="require-pkce" defaultChecked />
                  <Label htmlFor="require-pkce" className="cursor-pointer">
                    {t.oidcSettingsPage.clients.requirePkce}
                  </Label>
                </div>

                <Button className="w-full">{t.oidcSettingsPage.clients.createClient}</Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
