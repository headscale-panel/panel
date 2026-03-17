import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useSearch } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit,
  Filter,
  Key,
  Laptop,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Terminal,
  Trash2,
  User,
  XCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import DashboardLayout from '@/components/DashboardLayout';
import { devicesAPI, usersAPI, headscaleConfigAPI } from '@/lib/api';
import { useTranslation } from '@/i18n/index';

interface Device {
  id: number;
  machine_key: string;
  node_key: string;
  disco_key: string;
  ip_addresses: string[];
  name: string;
  given_name: string;
  user: {
    id: number;
    name: string;
    display_name: string;
    email: string;
  } | null;
  online: boolean;
  last_seen: string | null;
  expiry: string | null;
  created_at: string | null;
  register_method: string;
  tags: string[];
  approved_routes: string[];
  available_routes: string[];
}

interface HeadscaleUser {
  id: string;
  name: string;
}

interface DeployParams {
  loginServer: string;
  hostname: string;
  acceptDns: boolean;
  acceptRoutes: boolean;
  advertiseExitNode: boolean;
  advertiseRoutes: string;
  advertiseTags: string;
  ssh: boolean;
  shieldsUp: boolean;
  exitNode: string;
  exitNodeAllowLan: boolean;
  forceReauth: boolean;
  reset: boolean;
  advertiseConnector: boolean;
  operator: string;
  netfilterMode: string;
  snatSubnetRoutes: boolean;
  statefulFiltering: boolean;
}

const defaultDeployParams: DeployParams = {
  loginServer: '',
  hostname: '',
  acceptDns: true,
  acceptRoutes: false,
  advertiseExitNode: false,
  advertiseRoutes: '',
  advertiseTags: '',
  ssh: false,
  shieldsUp: false,
  exitNode: '',
  exitNodeAllowLan: false,
  forceReauth: false,
  reset: false,
  advertiseConnector: false,
  operator: '',
  netfilterMode: '',
  snatSubnetRoutes: true,
  statefulFiltering: false,
};

export default function Devices() {
  const t = useTranslation();
  const search = useSearch();
  const [devices, setDevices] = useState<Device[]>([]);
  const [headscaleUsers, setHeadscaleUsers] = useState<HeadscaleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUser, setFilterUser] = useState(() => {
    const params = new URLSearchParams(search);
    return params.get('user') || 'all';
  });
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');

  const [addDeviceDialogOpen, setAddDeviceDialogOpen] = useState(false);
  const [addDeviceTab, setAddDeviceTab] = useState('preauth');
  const [addDeviceUser, setAddDeviceUser] = useState('');
  const [addDeviceReusable, setAddDeviceReusable] = useState(false);
  const [addDeviceEphemeral, setAddDeviceEphemeral] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [machineKey, setMachineKey] = useState('');
  const [registeringNode, setRegisteringNode] = useState(false);
  const [deployParams, setDeployParams] = useState<DeployParams>({ ...defaultDeployParams });
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [devicesRes, usersRes, configRes] = await Promise.all([
        devicesAPI.list(),
        usersAPI.list({ pageSize: 100 }),
        headscaleConfigAPI.get().catch(() => null),
      ]);
      // API returns { list: [], total: ... }
      setDevices((devicesRes as any).list || []);
      if (configRes && (configRes as any).server_url) {
        setServerUrl((configRes as any).server_url);
      }

      // Users API returns a flat array now
      const userList = Array.isArray(usersRes) ? usersRes : (usersRes as any) || [];
      const uniqueUsers = Array.from(new Set(userList.map((u: any) => u.name)))
        .map((name) => ({ id: name as string, name: name as string }));
      setHeadscaleUsers(uniqueUsers);
    } catch (error: any) {
      console.error(error);
      toast.error(t.devices.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyIP = (ip: string) => {
    navigator.clipboard.writeText(ip);
    toast.success(t.devices.ipCopied);
  };

  const handleRename = async () => {
    if (!selectedDevice || !newName.trim()) return;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(newName.trim())) {
      setNameError(t.devices.nameLowercaseError);
      return;
    }
    try {
      await devicesAPI.rename(selectedDevice.id.toString(), newName);
      toast.success(t.devices.renameSuccess);
      setRenameDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(t.devices.renameFailed + (error.message || t.common.errors.unknownError));
    }
  };

  const handleGenerateKey = async () => {
    if (!addDeviceUser) {
      toast.error(t.devices.selectUserFirst);
      return;
    }
    try {
      const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res: any = await usersAPI.createPreAuthKey(addDeviceUser, addDeviceReusable, addDeviceEphemeral, expiration);
      const key = res?.preAuthKey?.key || res?.key || res?.preauthkey?.key || '';
      if (key) {
        setGeneratedKey(key);
        toast.success(t.devices.keyGenerated);
      } else {
        toast.error(t.devices.keyGenerateFailed);
      }
    } catch (error: any) {
      toast.error(t.devices.keyGenerateFailed + (error.message ? ': ' + error.message : ''));
    }
  };

  const handleRegisterNode = async () => {
    if (!addDeviceUser || !machineKey.trim()) {
      toast.error(t.devices.machineKeyRequired);
      return;
    }
    setRegisteringNode(true);
    try {
      await devicesAPI.registerNode(addDeviceUser, machineKey.trim());
      toast.success(t.devices.registerNodeSuccess);
      setAddDeviceDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(t.devices.registerNodeFailed + (error.message ? ': ' + error.message : ''));
    } finally {
      setRegisteringNode(false);
    }
  };

  const buildTailscaleCommand = useMemo(() => {
    const parts = ['tailscale up'];
    const p = deployParams;

    if (p.loginServer) parts.push(`--login-server=${p.loginServer}`);
    if (generatedKey && addDeviceTab === 'preauth') parts.push(`--auth-key=${generatedKey}`);
    if (p.hostname) parts.push(`--hostname=${p.hostname}`);
    if (!p.acceptDns) parts.push('--accept-dns=false');
    if (p.acceptRoutes) parts.push('--accept-routes');
    if (p.advertiseExitNode) parts.push('--advertise-exit-node');
    if (p.advertiseRoutes) parts.push(`--advertise-routes=${p.advertiseRoutes}`);
    if (p.advertiseTags) parts.push(`--advertise-tags=${p.advertiseTags}`);
    if (p.ssh) parts.push('--ssh');
    if (p.shieldsUp) parts.push('--shields-up');
    if (p.exitNode) parts.push(`--exit-node=${p.exitNode}`);
    if (p.exitNodeAllowLan) parts.push('--exit-node-allow-lan-access');
    if (p.forceReauth) parts.push('--force-reauth');
    if (p.reset) parts.push('--reset');
    if (p.advertiseConnector) parts.push('--advertise-connector');
    if (p.operator) parts.push(`--operator=${p.operator}`);
    if (p.netfilterMode && p.netfilterMode !== 'on') parts.push(`--netfilter-mode=${p.netfilterMode}`);
    if (!p.snatSubnetRoutes) parts.push('--snat-subnet-routes=false');
    if (p.statefulFiltering) parts.push('--stateful-filtering');

    return parts.join(' \\\n  ');
  }, [deployParams, generatedKey, addDeviceTab]);

  const handleDelete = async (device: Device) => {
    if (confirm(t.devices.confirmDelete.replace('{name}', device.given_name || device.name))) {
      try {
        await devicesAPI.delete(device.id.toString());
        toast.success(t.devices.deleteSuccess);
        loadData();
      } catch (error: any) {
        toast.error(t.devices.deleteFailed);
      }
    }
  };

  const openRenameDialog = (device: Device) => {
    setSelectedDevice(device);
    setNewName(device.given_name || device.name);
    setNameError('');
    setRenameDialogOpen(true);
  };

  const filteredDevices = devices.filter((device) => {
    if (filterUser !== 'all' && device.user?.name !== filterUser) return false;

    if (filterStatus !== 'all') {
      if (filterStatus === 'online' && !device.online) return false;
      if (filterStatus === 'offline' && device.online) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        device.name.toLowerCase().includes(q) ||
        (device.given_name && device.given_name.toLowerCase().includes(q)) ||
        (device.user?.name && device.user.name.toLowerCase().includes(q)) ||
        device.ip_addresses?.some((ip) => ip.includes(q))
      );
    }
    return true;
  });

  const stats = {
    total: devices.length,
    online: devices.filter((d) => d.online).length,
    offline: devices.filter((d) => !d.online).length,
  };

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Page Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t.devices.title}</h1>
              <p className="text-muted-foreground mt-1">{t.devices.description}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {t.common.actions.refresh}
              </Button>
              <Button onClick={() => { setAddDeviceUser(''); setAddDeviceReusable(false); setAddDeviceEphemeral(false); setGeneratedKey(''); setMachineKey(''); setRegisteringNode(false); setDeployParams({ ...defaultDeployParams, loginServer: serverUrl }); setShowAdvancedParams(false); setAddDeviceTab('preauth'); setAddDeviceDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                {t.devices.addDevice}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.devices.totalDevices}</p>
                  <p className="text-2xl font-bold mt-1">{stats.total}</p>
                </div>
                <Server className="h-8 w-8 opacity-80 text-blue-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.devices.onlineDevices}</p>
                  <p className="text-2xl font-bold mt-1">{stats.online}</p>
                </div>
                <Wifi className="h-8 w-8 opacity-80 text-green-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.devices.offlineDevices}</p>
                  <p className="text-2xl font-bold mt-1">{stats.offline}</p>
                </div>
                <WifiOff className="h-8 w-8 opacity-80 text-gray-400" />
              </div>
            </Card>
          </div>

          {/* Filters */}
          <Card className="p-6 gap-0">
            <div className="flex items-center gap-2 pb-4 border-b border-border/60">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{t.devices.filterTitle}</h2>
            </div>
            <div className="pt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>{t.devices.filterByUser}</Label>
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.devices.allUsers}</SelectItem>
                    {headscaleUsers.map((user) => (
                      <SelectItem key={user.id} value={user.name}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t.devices.filterByStatus}</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.devices.allStatus}</SelectItem>
                    <SelectItem value="online">{t.common.status.online}</SelectItem>
                    <SelectItem value="offline">{t.common.status.offline}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t.devices.search}</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t.devices.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Devices Table */}
          <Card className="p-0 gap-0">
            <div className="px-6 py-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.devices.tableStatus}</TableHead>
                  <TableHead>{t.devices.tableName}</TableHead>
                  <TableHead>{t.devices.tableIp}</TableHead>
                  <TableHead>{t.devices.tableOwner}</TableHead>
                  <TableHead>{t.devices.tableLastOnline}</TableHead>
                  <TableHead>{t.devices.tableActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t.common.status.loading}
                    </TableCell>
                  </TableRow>
                ) : filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t.devices.noData}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDevices.map((device) => (
                    <TableRow key={device.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell>
                        {device.online ? (
                          <Badge className="bg-green-500">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t.common.status.online}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 mr-1" />
                            {t.common.status.offline}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Laptop className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{device.given_name || device.name}</p>
                            {device.given_name && device.given_name !== device.name && (
                              <p className="text-xs text-muted-foreground font-mono">{device.name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {device.ip_addresses?.slice(0, 2).map((ip) => (
                            <Tooltip key={ip}>
                              <TooltipTrigger asChild>
                                <code
                                  className="text-xs bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:bg-muted/80 inline-block"
                                  onClick={() => handleCopyIP(ip)}
                                >
                                  {ip}
                                </code>
                              </TooltipTrigger>
                              <TooltipContent>{t.devices.clickToCopy}</TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{device.user?.name || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {device.last_seen
                          ? new Date(device.last_seen).toLocaleString('zh-CN')
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openRenameDialog(device)}>
                              <Edit className="w-4 h-4 mr-2" />
                              {t.devices.rename}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(device)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t.devices.deleteDevice}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </Card>

          {/* Rename Dialog */}
          <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.devices.renameDialogTitle}</DialogTitle>
                <DialogDescription>
                  {t.devices.renameDialogDesc.replace('{name}', selectedDevice?.name || '')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="device-name">{t.devices.newNameLabel}</Label>
                  <Input
                    id="device-name"
                    value={newName}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase();
                      setNewName(val);
                      if (val && !/^[a-z0-9][a-z0-9-]*$/.test(val)) {
                        setNameError(t.devices.nameLowercaseError);
                      } else {
                        setNameError('');
                      }
                    }}
                    className="mt-1"
                  />
                  {nameError && <p className="text-sm text-destructive mt-1">{nameError}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{t.devices.nameLowercaseHint}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleRename} disabled={!!nameError}>{t.common.actions.save}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Device Dialog */}
          <Dialog open={addDeviceDialogOpen} onOpenChange={setAddDeviceDialogOpen}>
            <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t.devices.addDeviceTitle}</DialogTitle>
                <DialogDescription>{t.devices.addDeviceDesc}</DialogDescription>
              </DialogHeader>

              <Tabs value={addDeviceTab} onValueChange={(v) => { setAddDeviceTab(v); setGeneratedKey(''); setMachineKey(''); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preauth">
                    <Key className="h-4 w-4 mr-2" />{t.devices.tabPreAuth}
                  </TabsTrigger>
                  <TabsTrigger value="machinekey">
                    <Terminal className="h-4 w-4 mr-2" />{t.devices.tabMachineKey}
                  </TabsTrigger>
                </TabsList>

                {/* Pre-Auth Key Tab */}
                <TabsContent value="preauth" className="space-y-4 mt-4">
                  <div>
                    <Label>{t.devices.selectUser}</Label>
                    <Select value={addDeviceUser} onValueChange={setAddDeviceUser}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={t.devices.selectUserPlaceholder} /></SelectTrigger>
                      <SelectContent>
                        {headscaleUsers.map((user) => (
                          <SelectItem key={user.id} value={user.name}>{user.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t.devices.reusableKey}</Label>
                      <p className="text-xs text-muted-foreground">{t.devices.reusableKeyDesc}</p>
                    </div>
                    <Switch checked={addDeviceReusable} onCheckedChange={setAddDeviceReusable} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t.devices.ephemeralKey}</Label>
                      <p className="text-xs text-muted-foreground">{t.devices.ephemeralKeyDesc}</p>
                    </div>
                    <Switch checked={addDeviceEphemeral} onCheckedChange={setAddDeviceEphemeral} />
                  </div>
                  {!generatedKey && (
                    <Button onClick={handleGenerateKey} className="w-full" disabled={!addDeviceUser}>
                      <Key className="h-4 w-4 mr-2" />{t.devices.generateKey}
                    </Button>
                  )}
                  {generatedKey && (
                    <div className="space-y-2">
                      <Label>{t.devices.preAuthKey}</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={generatedKey} className="font-mono text-xs" />
                        <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(generatedKey); toast.success(t.devices.keyCopied); }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.devices.keyExpireHint}</p>
                    </div>
                  )}
                </TabsContent>

                {/* Machine Key Tab */}
                <TabsContent value="machinekey" className="space-y-4 mt-4">
                  <div>
                    <Label>{t.devices.selectUser}</Label>
                    <Select value={addDeviceUser} onValueChange={setAddDeviceUser}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={t.devices.selectUserPlaceholder} /></SelectTrigger>
                      <SelectContent>
                        {headscaleUsers.map((user) => (
                          <SelectItem key={user.id} value={user.name}>{user.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t.devices.machineKeyLabel}</Label>
                    <Input
                      placeholder={t.devices.machineKeyPlaceholder}
                      value={machineKey}
                      onChange={(e) => setMachineKey(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t.devices.machineKeyHint}</p>
                  </div>
                  <Button onClick={handleRegisterNode} className="w-full" disabled={!addDeviceUser || !machineKey.trim() || registeringNode}>
                    {registeringNode ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Server className="h-4 w-4 mr-2" />}
                    {t.devices.registerNode}
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Deployment Parameters */}
              <div className="border-t pt-4 mt-2">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
                  onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                >
                  <Settings2 className="h-4 w-4" />
                  {t.devices.deployParams}
                  {showAdvancedParams ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                </button>

                {showAdvancedParams && (
                  <div className="space-y-4 mt-4">
                    {/* Hostname */}
                    <div>
                      <Label>{t.devices.paramHostname}</Label>
                      <Input
                        placeholder={t.devices.paramHostnamePlaceholder}
                        value={deployParams.hostname}
                        onChange={(e) => setDeployParams({ ...deployParams, hostname: e.target.value.toLowerCase() })}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{t.devices.paramHostnameDesc}</p>
                    </div>

                    {/* Boolean switches - basic */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-3 rounded-md border">
                        <div>
                          <p className="text-sm font-medium">--accept-dns</p>
                          <p className="text-xs text-muted-foreground">{t.devices.paramAcceptDns}</p>
                        </div>
                        <Switch checked={deployParams.acceptDns} onCheckedChange={(v) => setDeployParams({ ...deployParams, acceptDns: v })} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-md border">
                        <div>
                          <p className="text-sm font-medium">--accept-routes</p>
                          <p className="text-xs text-muted-foreground">{t.devices.paramAcceptRoutes}</p>
                        </div>
                        <Switch checked={deployParams.acceptRoutes} onCheckedChange={(v) => setDeployParams({ ...deployParams, acceptRoutes: v })} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-md border">
                        <div>
                          <p className="text-sm font-medium">--advertise-exit-node</p>
                          <p className="text-xs text-muted-foreground">{t.devices.paramAdvertiseExitNode}</p>
                        </div>
                        <Switch checked={deployParams.advertiseExitNode} onCheckedChange={(v) => setDeployParams({ ...deployParams, advertiseExitNode: v })} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-md border">
                        <div>
                          <p className="text-sm font-medium">--ssh</p>
                          <p className="text-xs text-muted-foreground">{t.devices.paramSsh}</p>
                        </div>
                        <Switch checked={deployParams.ssh} onCheckedChange={(v) => setDeployParams({ ...deployParams, ssh: v })} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-md border">
                        <div>
                          <p className="text-sm font-medium">--shields-up</p>
                          <p className="text-xs text-muted-foreground">{t.devices.paramShieldsUp}</p>
                        </div>
                        <Switch checked={deployParams.shieldsUp} onCheckedChange={(v) => setDeployParams({ ...deployParams, shieldsUp: v })} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-md border">
                        <div>
                          <p className="text-sm font-medium">--advertise-connector</p>
                          <p className="text-xs text-muted-foreground">{t.devices.paramAdvertiseConnector}</p>
                        </div>
                        <Switch checked={deployParams.advertiseConnector} onCheckedChange={(v) => setDeployParams({ ...deployParams, advertiseConnector: v })} />
                      </div>
                    </div>

                    {/* Text inputs */}
                    <div>
                      <Label>--advertise-routes</Label>
                      <Input
                        placeholder="10.0.0.0/24,192.168.1.0/24"
                        value={deployParams.advertiseRoutes}
                        onChange={(e) => setDeployParams({ ...deployParams, advertiseRoutes: e.target.value })}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{t.devices.paramAdvertiseRoutes}</p>
                    </div>
                    <div>
                      <Label>--advertise-tags</Label>
                      <Input
                        placeholder="tag:server,tag:prod"
                        value={deployParams.advertiseTags}
                        onChange={(e) => setDeployParams({ ...deployParams, advertiseTags: e.target.value })}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">{t.devices.paramAdvertiseTags}</p>
                    </div>
                    <div>
                      <Label>--exit-node</Label>
                      <Select value={deployParams.exitNode || '__none__'} onValueChange={(v) => setDeployParams({ ...deployParams, exitNode: v === '__none__' ? '' : v })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder={t.devices.paramExitNodePlaceholder} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t.devices.paramExitNodeNone}</SelectItem>
                          {devices.filter(d => d.approved_routes?.some(r => r === '0.0.0.0/0' || r === '::/0') || d.available_routes?.some(r => r === '0.0.0.0/0' || r === '::/0')).map(d => (
                            <SelectItem key={d.id} value={d.ip_addresses?.[0] || d.given_name || d.name}>
                              {d.given_name || d.name} {d.ip_addresses?.[0] ? `(${d.ip_addresses[0]})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">{t.devices.paramExitNode}</p>
                    </div>

                    {/* Advanced Linux options */}
                    <div className="border-t pt-3">
                      <p className="text-xs text-muted-foreground mb-3">{t.devices.advancedOptions}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-3 rounded-md border">
                          <div>
                            <p className="text-sm font-medium">--exit-node-allow-lan-access</p>
                            <p className="text-xs text-muted-foreground">{t.devices.paramExitNodeAllowLan}</p>
                          </div>
                          <Switch checked={deployParams.exitNodeAllowLan} onCheckedChange={(v) => setDeployParams({ ...deployParams, exitNodeAllowLan: v })} />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-md border">
                          <div>
                            <p className="text-sm font-medium">--force-reauth</p>
                            <p className="text-xs text-muted-foreground">{t.devices.paramForceReauth}</p>
                          </div>
                          <Switch checked={deployParams.forceReauth} onCheckedChange={(v) => setDeployParams({ ...deployParams, forceReauth: v })} />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-md border">
                          <div>
                            <p className="text-sm font-medium">--reset</p>
                            <p className="text-xs text-muted-foreground">{t.devices.paramReset}</p>
                          </div>
                          <Switch checked={deployParams.reset} onCheckedChange={(v) => setDeployParams({ ...deployParams, reset: v })} />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-md border">
                          <div>
                            <p className="text-sm font-medium">--snat-subnet-routes<Badge variant="outline" className="ml-1 text-[10px] py-0">Linux</Badge></p>
                            <p className="text-xs text-muted-foreground">{t.devices.paramSnat}</p>
                          </div>
                          <Switch checked={deployParams.snatSubnetRoutes} onCheckedChange={(v) => setDeployParams({ ...deployParams, snatSubnetRoutes: v })} />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-md border">
                          <div>
                            <p className="text-sm font-medium">--stateful-filtering<Badge variant="outline" className="ml-1 text-[10px] py-0">Linux</Badge></p>
                            <p className="text-xs text-muted-foreground">{t.devices.paramStatefulFiltering}</p>
                          </div>
                          <Switch checked={deployParams.statefulFiltering} onCheckedChange={(v) => setDeployParams({ ...deployParams, statefulFiltering: v })} />
                        </div>
                      </div>
                      <div className="mt-3">
                        <Label>--operator <Badge variant="outline" className="text-[10px] py-0">Linux</Badge></Label>
                        <Input
                          placeholder={t.devices.paramOperatorPlaceholder}
                          value={deployParams.operator}
                          onChange={(e) => setDeployParams({ ...deployParams, operator: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div className="mt-3">
                        <Label>--netfilter-mode <Badge variant="outline" className="text-[10px] py-0">Linux</Badge></Label>
                        <Select value={deployParams.netfilterMode || 'on'} onValueChange={(v) => setDeployParams({ ...deployParams, netfilterMode: v })}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="on">on ({t.devices.paramNetfilterOn})</SelectItem>
                            <SelectItem value="nodivert">nodivert ({t.devices.paramNetfilterNodivert})</SelectItem>
                            <SelectItem value="off">off ({t.devices.paramNetfilterOff})</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Generated Command */}
              <div className="border-t pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-2">
                    <Terminal className="h-4 w-4" />{t.devices.generatedCommand}
                  </Label>
                  <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(buildTailscaleCommand); toast.success(t.devices.commandCopied); }}>
                    <Copy className="h-3 w-3 mr-1" />{t.devices.copyCommand}
                  </Button>
                </div>
                <pre className="bg-muted rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-all select-all overflow-x-auto max-h-40">
                  {buildTailscaleCommand}
                </pre>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDeviceDialogOpen(false)}>{t.common.actions.close}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
