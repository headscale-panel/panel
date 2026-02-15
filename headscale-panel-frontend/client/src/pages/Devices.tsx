import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSearch } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Copy,
  Edit,
  Filter,
  Laptop,
  MoreVertical,
  RefreshCw,
  Search,
  Server,
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
import { Switch } from '@/components/ui/switch';
import DashboardLayout from '@/components/DashboardLayout';
import { devicesAPI, usersAPI } from '@/lib/api';
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [devicesRes, usersRes] = await Promise.all([
        devicesAPI.list(),
        usersAPI.list({ pageSize: 100 }),
      ]);
      // API returns { list: [], total: ... }
      setDevices((devicesRes as any).list || []);

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
    try {
      await devicesAPI.rename(selectedDevice.id.toString(), newName);
      toast.success(t.devices.renameSuccess);
      setRenameDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(t.devices.renameFailed + (error.message || t.common.errors.unknownError));
    }
  };

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
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleRename}>{t.common.actions.save}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
