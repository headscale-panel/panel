import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useSearch } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Search,
  Laptop,
  CheckCircle2,
  XCircle,
  Route as RouteIcon,
  User,
  Globe,
  Network,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import DashboardLayout from '@/components/DashboardLayout';
import { routesAPI } from '@/lib/api';
import { useTranslation } from '@/i18n/index';

interface Route {
  id: string;
  machine_id: number;
  machine_name: string;
  user_name: string;
  destination: string;
  enabled: boolean;
  advertised: boolean;
  is_exit_node: boolean;
}

const isExitNode = (destination: string) => {
  return destination === '::/0' || destination === '0.0.0.0/0';
};

const getRouteType = (destination: string) => {
  if (isExitNode(destination)) {
    return { label: 'Exit Node', color: 'text-purple-600 bg-purple-50 border-purple-200' };
  }
  if (destination.includes(':')) {
    return { label: 'IPv6', color: 'text-blue-600 bg-blue-50 border-blue-200' };
  }
  return { label: 'IPv4', color: 'text-green-600 bg-green-50 border-green-200' };
};

export default function Routes() {
  const t = useTranslation();
  const search = useSearch();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(search);
    return params.get('user') || '';
  });
  const [filterDevice, setFilterDevice] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const routeListRes: any = await routesAPI.list({ page: 1, pageSize: 1000 });
      if (routeListRes?.list) {
        setRoutes(routeListRes.list);
      } else if (Array.isArray(routeListRes)) {
        setRoutes(routeListRes);
      }
    } catch (error) {
      console.error('Failed to load routes:', error);
      toast.error(t.routes.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle route enabled/disabled via approve/unapprove
  const handleToggle = async (route: Route) => {
    try {
      if (route.enabled) {
        await routesAPI.disable(route.machine_id, route.destination);
      } else {
        await routesAPI.enable(route.machine_id, route.destination);
      }

      const isExit = isExitNode(route.destination);
      toast.success(isExit ? (route.enabled ? t.routes.exitNodeDisabled : t.routes.exitNodeEnabled) : (route.enabled ? t.routes.routeDisabled : t.routes.routeEnabled));
      loadData();
    } catch (error: any) {
      toast.error(error.message || t.common.errors.operationFailed);
    }
  };

  const devices = Array.from(new Set(routes.map(r => r.machine_name))).sort();

  const filteredRoutes = routes.filter(route => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = (
        route.destination.toLowerCase().includes(q) ||
        route.machine_name.toLowerCase().includes(q) ||
        (route.user_name && route.user_name.toLowerCase().includes(q))
      );
      if (!matchesSearch) return false;
    }

    if (filterDevice !== 'all' && route.machine_name !== filterDevice) {
      return false;
    }

    if (filterStatus === 'enabled' && !route.enabled) return false;
    if (filterStatus === 'disabled' && route.enabled) return false;

    return true;
  });

  const stats = {
    total: routes.length,
    enabled: routes.filter(r => r.enabled).length,
    disabled: routes.filter(r => !r.enabled).length,
    exitNodes: routes.filter(r => isExitNode(r.destination)).length / 2, // IPv4 and IPv6 count as 1
  };

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Page Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t.routes.title}</h1>
              <p className="text-muted-foreground mt-1">{t.routes.description}</p>
            </div>
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t.common.actions.refresh}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.routes.totalRoutes}</p>
                  <p className="text-2xl font-bold mt-1">{stats.total}</p>
                </div>
                <RouteIcon className="h-8 w-8 text-blue-500 opacity-80" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.routes.enabled}</p>
                  <p className="text-2xl font-bold mt-1 text-green-600">{stats.enabled}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.routes.disabled}</p>
                  <p className="text-2xl font-bold mt-1 text-gray-500">{stats.disabled}</p>
                </div>
                <XCircle className="h-8 w-8 text-gray-400 opacity-80" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Exit Nodes</p>
                  <p className="text-2xl font-bold mt-1 text-purple-600">{Math.floor(stats.exitNodes)}</p>
                </div>
                <Globe className="h-8 w-8 text-purple-500 opacity-80" />
              </div>
            </Card>
          </div>

          {/* Table Card */}
          <Card className="gap-0 p-0">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 px-6 py-5">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t.routes.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={filterDevice} onValueChange={setFilterDevice}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t.routes.filterDevice} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.routes.allDevices}</SelectItem>
                  {devices.map(device => (
                    <SelectItem key={device} value={device}>{device}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={t.routes.filterStatus} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.routes.allStatus}</SelectItem>
                  <SelectItem value="enabled">{t.routes.enabled}</SelectItem>
                  <SelectItem value="disabled">{t.routes.disabled}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="px-6 pb-2">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-t border-b">
                  <TableHead className="text-muted-foreground font-medium">{t.routes.routePrefix}</TableHead>
                  <TableHead className="text-muted-foreground font-medium">{t.routes.publishUser}</TableHead>
                  <TableHead className="text-muted-foreground font-medium">{t.routes.device}</TableHead>
                  <TableHead className="text-muted-foreground font-medium">{t.routes.status}</TableHead>
                  <TableHead className="text-muted-foreground font-medium text-right">{t.routes.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                      {t.common.status.loading}
                    </TableCell>
                  </TableRow>
                ) : filteredRoutes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Network className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p className="text-lg font-medium">{t.routes.noData}</p>
                      <p className="text-sm mt-1">
                        {routes.length === 0
                          ? t.routes.noRoutes
                          : t.routes.noMatch}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence>
                    {filteredRoutes.map((route) => {
                      return (
                        <motion.tr
                          key={route.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="border-b last:border-b-0 hover:bg-transparent"
                        >
                          {/* 路由前缀 */}
                          <TableCell className="py-4">
                            <span className="inline-block text-sm text-foreground bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded border border-slate-200 dark:border-slate-700">
                              {route.destination}
                            </span>
                          </TableCell>
                          
                          {/* 发布用户 */}
                          <TableCell className="py-4">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div>
                                <p className="font-medium text-foreground">
                                  {route.user_name || '-'}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          
                          {/* 所在设备 */}
                          <TableCell className="py-4">
                            <div className="flex items-center gap-2">
                              <Laptop className="h-4 w-4 text-muted-foreground" />
                              <span>{route.machine_name}</span>
                            </div>
                          </TableCell>
                          
                          {/* 状态 */}
                          <TableCell className="py-4">
                            {route.enabled ? (
                              <Badge className="bg-green-500 hover:bg-green-500 text-white">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {t.routes.enabled}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                <XCircle className="h-3 w-3 mr-1" />
                                {t.routes.disabled}
                              </Badge>
                            )}
                          </TableCell>

                          {/* 操作 */}
                          <TableCell className="py-4 text-right">
                            <Switch
                              checked={route.enabled}
                              onCheckedChange={() => handleToggle(route)}
                            />
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
            </div>
          </Card>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
