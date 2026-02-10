import { useTranslation } from '@/i18n/index';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import DashboardLayout from '@/components/DashboardLayout';
import { dockerAPI, derpAPI } from '@/lib/api';
import {
  Copy,
  Cpu,
  Globe,
  Loader2,
  MemoryStick,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string[];
  labels: Record<string, string>;
}

interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
}

interface DERPRegion {
  region_id: number;
  region_code: string;
  region_name: string;
  nodes: DERPNode[];
}

interface DERPNode {
  name: string;
  region_id: number;
  host_name: string;
  ipv4: string;
  ipv6: string;
  stun_port: number;
  stun_only: boolean;
  derp_port: number;
}

interface DERPServerDisplay {
  regionId: number;
  regionCode: string;
  regionName: string;
  node: DERPNode;
  latency: number | null;
  latencyStatus: 'testing' | 'ok' | 'slow' | 'timeout' | 'error';
}

const DERPER_DOCKER_CMD = `docker run -d \\
  --name derper \\
  --restart unless-stopped \\
  -e DERP_DOMAIN=your-domain.com \\
  -e DERP_ADDR=:6060 \\
  -e DERP_CERT_MODE=manual \\
  -p 6060:6060 \\
  -p 3478:3478/udp \\
  fredliang/derper`;

export default function ServerControl() {
  const t = useTranslation();
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [containerStats, setContainerStats] = useState<Record<string, ContainerStats>>({});
  const [logs, setLogs] = useState('');
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [containersLoading, setContainersLoading] = useState(true);
  const [derpServers, setDerpServers] = useState<DERPServerDisplay[]>([]);
  const [showAddDerpDialog, setShowAddDerpDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [newDerp, setNewDerp] = useState({
    regionCode: '',
    regionName: '',
    hostname: '',
    ipv4: '',
    stunPort: 3478,
    derpPort: 443,
  });
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const loadContainers = useCallback(async () => {
    try {
      const data = await dockerAPI.getContainers() as any;
      const list: ContainerInfo[] = Array.isArray(data) ? data : [];
      setContainers(list);
      if (list.length > 0 && !selectedContainer) {
        setSelectedContainer(list[0].name?.replace(/^\//, '') || list[0].id);
      }
    } catch (error: any) {
      console.error('Failed to load containers:', error);
    } finally {
      setContainersLoading(false);
    }
  }, [selectedContainer]);

  const loadStatsForContainer = useCallback(async (name: string) => {
    try {
      const cleanName = name.replace(/^\//, '');
      const data = await dockerAPI.getContainerStats(cleanName) as any;
      if (data) {
        setContainerStats((prev) => ({ ...prev, [cleanName]: data }));
      }
    } catch {
      // Container may not be running
    }
  }, []);

  const loadLogs = useCallback(async (name?: string) => {
    const target = name || selectedContainer;
    if (!target) return;
    try {
      const cleanName = target.replace(/^\//, '');
      const data = await dockerAPI.getContainerLogs(cleanName, 200) as any;
      setLogs(data?.logs || '');
    } catch (error: any) {
      toast.error(t.serverControl.loadLogsFailed + error.message);
    }
  }, [selectedContainer, t]);

  const measureLatency = useCallback(async (hostname: string): Promise<{ latency: number | null; status: 'ok' | 'slow' | 'timeout' | 'error' }> => {
    try {
      const start = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      await fetch(`https://${hostname}/derp/probe`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latency = Math.round(performance.now() - start);
      return { latency, status: latency < 100 ? 'ok' : latency < 300 ? 'slow' : 'timeout' };
    } catch {
      return { latency: null, status: 'error' };
    }
  }, []);

  const loadDerpServers = useCallback(async () => {
    try {
      const data = await derpAPI.get() as any;
      if (!data?.regions) { setDerpServers([]); return; }
      const regions: DERPRegion[] = data.regions;
      const servers: DERPServerDisplay[] = [];
      for (const region of regions) {
        if (!region.nodes?.length) continue;
        for (const node of region.nodes) {
          servers.push({
            regionId: region.region_id,
            regionCode: region.region_code,
            regionName: region.region_name,
            node,
            latency: null,
            latencyStatus: 'testing',
          });
        }
      }
      setDerpServers(servers);
      for (const server of servers) {
        measureLatency(server.node.host_name).then((result) => {
          setDerpServers((prev) =>
            prev.map((s) =>
              s.node.host_name === server.node.host_name
                ? { ...s, latency: result.latency, latencyStatus: result.status }
                : s
            )
          );
        });
      }
    } catch (error: any) {
      console.error('Failed to load DERP servers:', error);
    }
  }, [measureLatency]);

  useEffect(() => {
    loadContainers();
    loadDerpServers();
  }, [loadContainers, loadDerpServers]);

  useEffect(() => {
    if (containers.length === 0) return;
    const refreshStats = () => {
      containers.forEach((c) => {
        if (c.state === 'running') {
          loadStatsForContainer(c.name?.replace(/^\//, '') || c.id);
        }
      });
    };
    refreshStats();
    statsIntervalRef.current = setInterval(refreshStats, 5000);
    return () => { if (statsIntervalRef.current) clearInterval(statsIntervalRef.current); };
  }, [containers, loadStatsForContainer]);

  const handleAction = async (containerName: string, action: 'start' | 'stop' | 'restart') => {
    const cleanName = containerName.replace(/^\//, '');
    setActionLoading((prev) => ({ ...prev, [cleanName]: true }));
    try {
      if (action === 'start') await dockerAPI.startContainer(cleanName);
      else if (action === 'stop') await dockerAPI.stopContainer(cleanName);
      else await dockerAPI.restartContainer(cleanName);
      toast.success(t.serverControl[`${action}Success`]);
      await loadContainers();
    } catch (error: any) {
      toast.error(t.serverControl[`${action}Failed`] + error.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [cleanName]: false }));
    }
  };

  const handleAddDerp = async () => {
    if (!newDerp.regionCode || !newDerp.hostname || !newDerp.ipv4) {
      toast.error(t.serverControl.derpInfoIncomplete);
      return;
    }
    setLoading(true);
    try {
      const regionPayload = {
        region_code: newDerp.regionCode,
        region_name: newDerp.regionName || newDerp.regionCode,
        nodes: [{
          name: `${newDerp.regionCode}-1`,
          host_name: newDerp.hostname,
          ipv4: newDerp.ipv4,
          stun_port: newDerp.stunPort,
          stun_only: false,
          derp_port: newDerp.derpPort,
        }],
      };
      await derpAPI.addRegion(regionPayload);
      toast.success(t.serverControl.derpDeploySuccess);
      setShowAddDerpDialog(false);
      setNewDerp({ regionCode: '', regionName: '', hostname: '', ipv4: '', stunPort: 3478, derpPort: 443 });
      await loadDerpServers();
    } catch (error: any) {
      toast.error(error.message || t.common.errors.operationFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDerp = async (regionId: number) => {
    try {
      await derpAPI.deleteRegion(regionId);
      toast.success(t.serverControl.derpDeleteSuccess);
      await loadDerpServers();
    } catch (error: any) {
      toast.error(error.message || t.common.errors.operationFailed);
    }
  };

  const handleTestLatency = async (server: DERPServerDisplay) => {
    setDerpServers((prev) =>
      prev.map((s) =>
        s.node.host_name === server.node.host_name ? { ...s, latencyStatus: 'testing' as const } : s
      )
    );
    const result = await measureLatency(server.node.host_name);
    setDerpServers((prev) =>
      prev.map((s) =>
        s.node.host_name === server.node.host_name
          ? { ...s, latency: result.latency, latencyStatus: result.status }
          : s
      )
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t.topology.copiedToClipboard);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const getLatencyColor = (ms: number | null) => {
    if (ms === null) return 'text-muted-foreground';
    if (ms < 100) return 'text-green-500';
    if (ms < 300) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.serverControl.title}</h1>
          <p className="text-muted-foreground mt-1">{t.serverControl.description}</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">{t.serverControl.tabs.overview}</TabsTrigger>
            <TabsTrigger value="derp">{t.serverControl.tabs.derp}</TabsTrigger>
            <TabsTrigger value="logs">{t.serverControl.tabs.logs}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {containersLoading ? (
              <Card className="p-12 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </Card>
            ) : containers.length === 0 ? (
              <Card className="p-12 text-center">
                <Terminal className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t.serverControl.noContainers}</p>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {containers.map((container) => {
                    const cleanName = container.name?.replace(/^\//, '') || container.id;
                    const cStats = containerStats[cleanName];
                    const isRunning = container.state === 'running';
                    const isLoading = actionLoading[cleanName];
                    return (
                      <Card key={container.id} className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                            <div>
                              <p className="font-semibold text-sm">{cleanName}</p>
                              <p className="text-xs text-muted-foreground font-mono">{container.image}</p>
                            </div>
                          </div>
                          <Badge variant={isRunning ? 'default' : 'destructive'} className={isRunning ? 'bg-green-500' : ''}>
                            {isRunning ? t.common.status.running : t.common.status.stopped}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                          <div>
                            <span className="text-muted-foreground">{t.serverControl.containerId}</span>
                            <p className="font-mono">{container.id.substring(0, 12)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t.serverControl.status}</span>
                            <p>{container.status}</p>
                          </div>
                        </div>
                        {isRunning && cStats && (
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU</span>
                                <span>{cStats.cpu_percent.toFixed(1)}%</span>
                              </div>
                              <Progress value={Math.min(cStats.cpu_percent, 100)} className="h-1.5" />
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1"><MemoryStick className="h-3 w-3" /> MEM</span>
                                <span>{cStats.memory_percent.toFixed(1)}%</span>
                              </div>
                              <Progress value={Math.min(cStats.memory_percent, 100)} className="h-1.5" />
                            </div>
                            <div className="text-xs">
                              <span className="text-muted-foreground flex items-center gap-1"><Network className="h-3 w-3" /> {t.serverControl.networkRx}</span>
                              <p>{formatBytes(cStats.network_rx)}</p>
                            </div>
                            <div className="text-xs">
                              <span className="text-muted-foreground flex items-center gap-1"><Network className="h-3 w-3" /> {t.serverControl.networkTx}</span>
                              <p>{formatBytes(cStats.network_tx)}</p>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          {!isRunning && (
                            <Button size="sm" variant="outline" className="flex-1" disabled={isLoading} onClick={() => handleAction(cleanName, 'start')}>
                              <Play className="h-3 w-3 mr-1" />{t.serverControl.start}
                            </Button>
                          )}
                          {isRunning && (
                            <Button size="sm" variant="outline" className="flex-1" disabled={isLoading} onClick={() => handleAction(cleanName, 'stop')}>
                              <Pause className="h-3 w-3 mr-1" />{t.serverControl.stop}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="flex-1" disabled={isLoading} onClick={() => handleAction(cleanName, 'restart')}>
                            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />{t.serverControl.restart}
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={loadContainers}>
                    <RefreshCw className="h-4 w-4 mr-2" />{t.common.actions.refresh}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="derp" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{t.serverControl.derpMonitorTitle}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t.serverControl.derpMonitorDesc}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadDerpServers}>
                  <RefreshCw className="h-4 w-4 mr-2" />{t.common.actions.refresh}
                </Button>
                <Button onClick={() => setShowAddDerpDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />{t.serverControl.addDerp}
                </Button>
              </div>
            </div>
            {derpServers.length === 0 ? (
              <Card className="p-12 text-center">
                <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t.serverControl.noDerpServers}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {derpServers.map((server, idx) => (
                  <Card key={`${server.regionId}-${idx}`} className="p-5 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Globe className={`h-5 w-5 ${server.latencyStatus === 'ok' ? 'text-green-500' : server.latencyStatus === 'slow' ? 'text-yellow-500' : server.latencyStatus === 'error' || server.latencyStatus === 'timeout' ? 'text-red-500' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="font-semibold text-sm">{server.regionName || server.regionCode}</p>
                          <p className="text-xs text-muted-foreground">{server.node.host_name}</p>
                        </div>
                      </div>
                      {server.latencyStatus === 'testing' ? (
                        <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1" />{t.common.actions.test}</Badge>
                      ) : server.latencyStatus === 'error' || server.latencyStatus === 'timeout' ? (
                        <Badge variant="destructive">{t.common.status.offline}</Badge>
                      ) : (
                        <Badge className="bg-green-500">{t.common.status.online}</Badge>
                      )}
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IPv4</span>
                        <span className="font-mono">{server.node.ipv4 || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">STUN</span>
                        <span>{server.node.stun_port || 3478}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">DERP</span>
                        <span>{server.node.derp_port || 443}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t.serverControl.latency}</span>
                        {server.latencyStatus === 'testing' ? (
                          <span className="text-muted-foreground">...</span>
                        ) : server.latency !== null ? (
                          <span className={getLatencyColor(server.latency)}>{server.latency}ms</span>
                        ) : (
                          <span className="text-red-500">N/A</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTestLatency(server)}>
                        <Zap className="h-3 w-3 mr-1" />{t.common.actions.test}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteDerp(server.regionId)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-2">{t.serverControl.dockerDeployRef}</h3>
              <div className="relative">
                <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">{DERPER_DOCKER_CMD}</pre>
                <Button variant="ghost" size="sm" className="absolute top-1 right-1" onClick={() => copyToClipboard(DERPER_DOCKER_CMD)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t.serverControl.realtimeLogs}</h2>
                <div className="flex items-center gap-2">
                  {containers.length > 0 && (
                    <select
                      className="bg-muted border border-border rounded-md px-3 py-1.5 text-sm"
                      value={selectedContainer}
                      onChange={(e) => { setSelectedContainer(e.target.value); loadLogs(e.target.value); }}
                    >
                      {containers.map((c) => {
                        const name = c.name?.replace(/^\//, '') || c.id;
                        return <option key={c.id} value={name}>{name}</option>;
                      })}
                    </select>
                  )}
                  <Button variant="outline" size="sm" onClick={() => loadLogs()}>
                    <RefreshCw className="h-4 w-4 mr-2" />{t.common.actions.refresh}
                  </Button>
                </div>
              </div>
              <Textarea value={logs} readOnly className="font-mono text-xs min-h-[500px] bg-muted" />
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showAddDerpDialog} onOpenChange={setShowAddDerpDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.serverControl.addDerpTitle}</DialogTitle>
              <DialogDescription>{t.serverControl.addDerpDesc}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t.serverControl.regionLabel}</Label>
                  <Input className="mt-1" placeholder={t.serverControl.regionPlaceholder} value={newDerp.regionCode} onChange={(e) => setNewDerp({ ...newDerp, regionCode: e.target.value })} />
                </div>
                <div>
                  <Label>{t.serverControl.regionNameLabel}</Label>
                  <Input className="mt-1" placeholder={t.serverControl.regionNamePlaceholder} value={newDerp.regionName} onChange={(e) => setNewDerp({ ...newDerp, regionName: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>{t.serverControl.hostnameLabel}</Label>
                <Input className="mt-1" placeholder={t.serverControl.hostnamePlaceholder} value={newDerp.hostname} onChange={(e) => setNewDerp({ ...newDerp, hostname: e.target.value })} />
              </div>
              <div>
                <Label>{t.serverControl.ipv4Label}</Label>
                <Input className="mt-1" placeholder={t.serverControl.ipv4Placeholder} value={newDerp.ipv4} onChange={(e) => setNewDerp({ ...newDerp, ipv4: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t.serverControl.stunPortLabel}</Label>
                  <Input className="mt-1" type="number" value={newDerp.stunPort} onChange={(e) => setNewDerp({ ...newDerp, stunPort: parseInt(e.target.value) || 3478 })} />
                </div>
                <div>
                  <Label>{t.serverControl.derpPortLabel}</Label>
                  <Input className="mt-1" type="number" value={newDerp.derpPort} onChange={(e) => setNewDerp({ ...newDerp, derpPort: parseInt(e.target.value) || 443 })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDerpDialog(false)}>{t.common.actions.cancel}</Button>
              <Button onClick={handleAddDerp} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t.common.actions.add}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
