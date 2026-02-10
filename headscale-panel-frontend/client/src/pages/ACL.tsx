import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileCode,
  Globe,
  Database,
  Edit2,
  GripVertical,
  Laptop,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Server,
  Smartphone,
  Tablet,
  Trash2,
  User,
  Users,
  XCircle,
  X,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

import { aclAPI, devicesAPI, resourcesAPI, usersAPI } from '@/lib/api';

import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import Editor from '@monaco-editor/react';

interface ACLRule {
  id: number;
  name: string;
  sources: string[];
  destinations: string[];
  action: 'accept' | 'deny';
}

interface ACLPolicy {
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
  acls?: Array<{
    '#ha-meta'?: { name: string; open: boolean };
    action: string;
    src: string[];
    dst: string[];
  }>;
}

interface DeviceItem {
  id: string;
  givenName: string;
  name: string;
  ipAddresses: string[];
  user?: { name: string };
}

interface ResourceItem {
  id: number;
  name: string;
  ip_address: string;
  port?: string;
}

interface HeadscaleUser {
  id: string;
  name: string;
}

interface SortableRuleCardProps {
  id: string;
  children: React.ReactNode;
}

function SortableRuleCard({ id, children }: SortableRuleCardProps) {
  const t = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="bg-card border rounded-lg p-4 hover:shadow-md transition-all">
        <div className="flex items-start gap-2">
          <div
            {...listeners}
            className="flex items-center justify-center w-6 h-full pt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
            title={t.acl.dragToSort}
          >
            <GripVertical className="h-5 w-5" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ACL() {
  const t = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<ACLRule[]>([]);
  const [policy, setPolicy] = useState<ACLPolicy | null>(null);

  const [aclGroups, setAclGroups] = useState<Record<string, string[]>>({});
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [headscaleUsers, setHeadscaleUsers] = useState<HeadscaleUser[]>([]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [editingRule, setEditingRule] = useState<ACLRule | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);

  const [newRule, setNewRule] = useState<Partial<ACLRule>>({
    name: '',
    sources: [],
    destinations: [],
    action: 'accept',
  });

  const [sourceInput, setSourceInput] = useState('');
  const [destInput, setDestInput] = useState('');

  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains('dark')
  );

  // Reactively detect dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [policyRes, devicesRes, resourcesRes, usersRes] = await Promise.all([
        aclAPI.getPolicy().catch(() => null),
        devicesAPI.list({ page: 1, pageSize: 1000 }).catch(() => null),
        resourcesAPI.list({ page: 1, pageSize: 1000 }).catch(() => null),
        usersAPI.list({ page: 1, pageSize: 1000 }).catch(() => null),
      ]);

      console.log('ACL loadData:', { policyRes, devicesRes, resourcesRes, usersRes });

      // Policy data - API returns data directly after interceptor processing
      if (policyRes) {
        const policyData = policyRes as ACLPolicy;
        setPolicy(policyData);
        setAclGroups(policyData.groups || {});

        const parsedRules: ACLRule[] = (policyData.acls || []).map((acl, index) => ({
          id: index + 1,
          name: acl['#ha-meta']?.name || t.acl.defaultRuleName.replace('{index}', String(index + 1)),
          sources: acl.src || [],
          destinations: acl.dst || [],
          action: acl.action as 'accept' | 'deny',
        }));
        setRules(parsedRules);
      }

      // Devices - API returns { list: [...], total: N }
      if (devicesRes?.list) {
        const deviceList = devicesRes.list.map((d: any) => ({
          id: String(d.ID),
          givenName: d.given_name || d.name,
          name: d.name,
          ipAddresses: d.ip_addresses || [],
          user: d.user ? { name: d.user.username || d.user.headscale_name } : undefined,
        }));
        setDevices(deviceList);
      }

      // Resources - API returns { list: [...], total: N }
      if (resourcesRes?.list) {
        setResources(resourcesRes.list);
      }

      // Headscale Users - API returns array directly or { list: [...] }
      if (usersRes) {
        const userList = Array.isArray(usersRes) ? usersRes : (usersRes.list || []);
        const mappedUsers = userList.map((u: any) => ({
          id: String(u.ID || u.id),
          name: u.headscale_name || u.username || u.name,
        }));
        setHeadscaleUsers(mappedUsers);
      }
    } catch (error) {
      console.error('Failed to load ACL data:', error);
      toast.error(t.acl.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.sources?.length || !newRule.destinations?.length) {
      toast.error(t.acl.ruleIncomplete);
      return;
    }
    setSaving(true);
    try {
      await aclAPI.addRule({
        name: newRule.name,
        sources: newRule.sources,
        destinations: newRule.destinations,
        action: newRule.action || 'accept',
      });
      toast.success(t.acl.addSuccess);
      setShowAddDialog(false);
      setNewRule({ name: '', sources: [], destinations: [], action: 'accept' });
      setSourceInput('');
      setDestInput('');
      loadData();
    } catch (error) {
      toast.error(t.acl.addFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRule = async () => {
    if (!newRule.name || !newRule.sources?.length || !newRule.destinations?.length) {
      toast.error(t.acl.ruleIncomplete);
      return;
    }
    setSaving(true);
    try {
      await aclAPI.updateRuleByIndex({
        index: editingIndex,
        name: newRule.name,
        sources: newRule.sources,
        destinations: newRule.destinations,
        action: newRule.action || 'accept',
      });
      toast.success(t.acl.updateSuccess);
      setShowAddDialog(false);
      setEditingRule(null);
      setEditingIndex(-1);
      setNewRule({ name: '', sources: [], destinations: [], action: 'accept' });
      loadData();
    } catch (error) {
      toast.error(t.acl.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (index: number) => {
    setSaving(true);
    try {
      await aclAPI.deleteRuleByIndex(index);
      toast.success(t.acl.deleteRuleSuccess);
      loadData();
    } catch (error) {
      toast.error(t.acl.deleteRuleFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditDialog = (rule: ACLRule, index: number) => {
    setEditingRule(rule);
    setEditingIndex(index);
    setNewRule({ name: rule.name, sources: [...rule.sources], destinations: [...rule.destinations], action: rule.action });
    setShowAddDialog(true);
  };

  const handleExportJson = async () => {
    try {
      const res = await aclAPI.getPolicy();
      if (res) {
        setJsonContent(JSON.stringify(res, null, 2));
        setShowJsonEditor(true);
      }
    } catch (error) {
      toast.error(t.acl.getPolicyFailed);
    }
  };

  const handleImportJson = async () => {
    setSaving(true);
    try {
      await aclAPI.setPolicyRaw(jsonContent);
      toast.success(t.acl.importSuccess);
      setShowJsonEditor(false);
      loadData();
    } catch (e) {
      toast.error(t.acl.importFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncResources = async () => {
    setSaving(true);
    try {
      await aclAPI.syncResourcesAsHosts();
      toast.success(t.acl.syncSuccess);
      loadData();
    } catch (error) {
      toast.error(t.acl.syncFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parseInt((active.id as string).split('-')[1]);
    const newIndex = parseInt((over.id as string).split('-')[1]);

    const newRules = arrayMove(rules, oldIndex, newIndex);
    setRules(newRules);

    // Rebuild and save the policy
    if (policy) {
      const newPolicy = { ...policy };
      newPolicy.acls = newRules.map(rule => ({
        '#ha-meta': { name: rule.name, open: true },
        action: rule.action,
        src: rule.sources,
        dst: rule.destinations,
      }));
      try {
        await aclAPI.updatePolicy(newPolicy);
        toast.success(t.acl.orderUpdated);
        loadData();
      } catch {
        // revert on error
        loadData();
      }
    }
  }, [rules, policy]);

  const addSource = (value: string) => {
    if (value && !newRule.sources?.includes(value)) {
      setNewRule({ ...newRule, sources: [...(newRule.sources || []), value] });
      setSourceInput('');
    }
  };

  const removeSource = (value: string) => {
    setNewRule({ ...newRule, sources: newRule.sources?.filter((s) => s !== value) || [] });
  };

  const addDestination = (value: string) => {
    if (value && !newRule.destinations?.includes(value)) {
      setNewRule({ ...newRule, destinations: [...(newRule.destinations || []), value] });
      setDestInput('');
    }
  };

  const removeDestination = (value: string) => {
    setNewRule({ ...newRule, destinations: newRule.destinations?.filter((d) => d !== value) || [] });
  };

  const getDeviceIcon = (device: DeviceItem) => {
    const name = device.givenName?.toLowerCase() || device.name?.toLowerCase() || '';
    if (name.includes('phone') || name.includes('iphone')) return <Smartphone className="h-4 w-4" />;
    if (name.includes('ipad') || name.includes('tablet')) return <Tablet className="h-4 w-4" />;
    if (name.includes('server') || name.includes('nas')) return <Server className="h-4 w-4" />;
    if (name.includes('mac') || name.includes('laptop')) return <Laptop className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  const stats = {
    total: rules.length,
    allow: rules.filter((r) => r.action === 'accept').length,
    deny: rules.filter((r) => r.action === 'deny').length,
    groups: Object.keys(aclGroups).length,
    hosts: policy?.hosts ? Object.keys(policy.hosts).length : 0,
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t.acl.title}</h1>
              <p className="text-muted-foreground mt-1">{t.acl.description}</p>
            </div>
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={loadData} disabled={saving}>
                    <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t.common.actions.refresh}</TooltipContent>
              </Tooltip>
              <Button variant="outline" onClick={handleSyncResources} disabled={saving}>
                <Database className="h-4 w-4 mr-2" />{t.acl.syncResources}
              </Button>
              <Button variant="outline" onClick={handleExportJson}>
                <FileCode className="h-4 w-4 mr-2" />{t.acl.jsonEditor}
              </Button>
              <Button onClick={() => {
                setEditingRule(null);
                setEditingIndex(-1);
                setNewRule({ name: '', sources: [], destinations: [], action: 'accept' });
                setShowAddDialog(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />{t.acl.addRule}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.acl.totalRules}</p>
                  <p className="text-2xl font-bold mt-1">{stats.total}</p>
                </div>
                <FileCode className="h-8 w-8 opacity-80 text-blue-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.acl.allowRules}</p>
                  <p className="text-2xl font-bold mt-1">{stats.allow}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 opacity-80 text-green-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.acl.denyRules}</p>
                  <p className="text-2xl font-bold mt-1">{stats.deny}</p>
                </div>
                <XCircle className="h-8 w-8 opacity-80 text-red-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.acl.groupsLabel}</p>
                  <p className="text-2xl font-bold mt-1">{stats.groups}</p>
                </div>
                <Users className="h-8 w-8 opacity-80 text-blue-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.acl.hostsResources}</p>
                  <p className="text-2xl font-bold mt-1">{stats.hosts}</p>
                </div>
                <Globe className="h-8 w-8 opacity-80 text-purple-500" />
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">{t.acl.ruleListTitle}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t.acl.ruleListDesc}</p>

            {rules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t.acl.noRules}</p>
                <p className="text-sm mt-2">{t.acl.noRulesHint}</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rules.map((_, i) => `rule-${i}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {rules.map((rule, index) => (
                      <SortableRuleCard key={`rule-${index}`} id={`rule-${index}`}>
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium flex-shrink-0">{index + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-lg">{rule.name}</span>
                            <Badge variant={rule.action === 'accept' ? 'default' : 'destructive'} className="ml-2">{rule.action === 'accept' ? t.acl.allow : t.acl.deny}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <div className="flex flex-wrap gap-1">
                              {rule.sources.map((src, idx) => (<Badge key={idx} variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{src}</Badge>))}
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex flex-wrap gap-1">
                              {rule.destinations.map((dest, idx) => (<Badge key={idx} variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">{dest}</Badge>))}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(rule, index)}><Edit2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t.common.actions.edit}</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(JSON.stringify(rule, null, 2)); toast.success(t.acl.ruleCopied); }}><Copy className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t.acl.copy}</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => handleDeleteRule(index)} disabled={saving}><Trash2 className="h-4 w-4 text-destructive" /></Button></TooltipTrigger><TooltipContent>{t.common.actions.delete}</TooltipContent></Tooltip>
                        </div>
                      </SortableRuleCard>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Users className="h-5 w-5" />{t.acl.aclGroups}</h3>
              {Object.keys(aclGroups).length === 0 ? (<p className="text-muted-foreground text-sm">{t.acl.noGroups}</p>) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {Object.entries(aclGroups).map(([groupName, members]) => (
                    <div key={groupName} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                      <Badge variant="outline" className="shrink-0">{groupName}</Badge>
                      <div className="flex flex-wrap gap-1">{members.map((member, idx) => (<span key={idx} className="text-sm text-muted-foreground">{member}</span>))}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Globe className="h-5 w-5" />{t.acl.hostAliases}</h3>
              {!policy?.hosts || Object.keys(policy.hosts).length === 0 ? (<p className="text-muted-foreground text-sm">{t.acl.noHosts}</p>) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {Object.entries(policy.hosts).map(([hostName, ip]) => (
                    <div key={hostName} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <Badge variant="outline">{hostName}</Badge>
                      <span className="text-sm font-mono text-muted-foreground">{ip}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Add/Edit Rule Dialog */}
          <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setEditingRule(null); setEditingIndex(-1); } setShowAddDialog(open); }}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingRule ? t.acl.editRuleTitle : t.acl.addRuleTitle}</DialogTitle>
                <DialogDescription>{editingRule ? t.acl.editRuleDesc : t.acl.addRuleDesc}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="rule-name">{t.acl.ruleNameLabel}</Label>
                  <Input id="rule-name" placeholder={t.acl.ruleNamePlaceholder} value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{t.acl.sourceLabel}</Label>
                  <p className="text-sm text-muted-foreground mb-2">{t.acl.sourceDesc}</p>
                  <div className="flex gap-2 mb-2">
                    <Popover>
                      <PopoverTrigger asChild><Button variant="outline" className="flex-1"><Plus className="h-4 w-4 mr-2" />{t.acl.selectSource}</Button></PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t.acl.searchPlaceholder} />
                          <CommandList>
                            <CommandEmpty>{t.acl.noResults}</CommandEmpty>
                            <CommandGroup heading={t.acl.quickOptions}>
                              <CommandItem onSelect={() => addSource('*')}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes('*') ? 'opacity-100' : 'opacity-0'}`} />{t.acl.allStar}</CommandItem>
                              <CommandItem onSelect={() => addSource('autogroup:internet')}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes('autogroup:internet') ? 'opacity-100' : 'opacity-0'}`} />autogroup:internet</CommandItem>
                            </CommandGroup>
                            {Object.keys(aclGroups).length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.aclGroupsHeading}>{Object.keys(aclGroups).map((groupName) => (<CommandItem key={groupName} onSelect={() => addSource(groupName)}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes(groupName) ? 'opacity-100' : 'opacity-0'}`} /><Users className="mr-2 h-4 w-4" /><span>{groupName}</span></CommandItem>))}</CommandGroup></>)}
                            {headscaleUsers.length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.headscaleUsersHeading}>{headscaleUsers.map((user) => (<CommandItem key={user.id} onSelect={() => addSource(`${user.name}@`)}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes(`${user.name}@`) ? 'opacity-100' : 'opacity-0'}`} /><User className="mr-2 h-4 w-4" /><span>{user.name}@</span></CommandItem>))}</CommandGroup></>)}
                            {devices.length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.devicesHeading}>{devices.slice(0, 10).map((device) => (<CommandItem key={device.id} onSelect={() => addSource(device.ipAddresses?.[0] || '')}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes(device.ipAddresses?.[0] || '') ? 'opacity-100' : 'opacity-0'}`} />{getDeviceIcon(device)}<div className="flex flex-col ml-2"><span>{device.givenName || device.name}</span><span className="text-xs text-muted-foreground">{device.ipAddresses?.[0]}</span></div></CommandItem>))}</CommandGroup></>)}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder={t.acl.customSourcePlaceholder} value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && sourceInput) addSource(sourceInput); }} />
                    <Button variant="outline" onClick={() => sourceInput && addSource(sourceInput)}>{t.common.actions.add}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">{newRule.sources?.map((src, idx) => (<Badge key={idx} variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{src}<button onClick={() => removeSource(src)} className="ml-2 hover:text-destructive"><X className="h-3 w-3" /></button></Badge>))}</div>
                </div>
                <div>
                  <Label>{t.acl.destinationLabel}</Label>
                  <p className="text-sm text-muted-foreground mb-2">{t.acl.destinationDesc}</p>
                  <div className="flex gap-2 mb-2">
                    <Popover>
                      <PopoverTrigger asChild><Button variant="outline" className="flex-1"><Plus className="h-4 w-4 mr-2" />{t.acl.selectDestination}</Button></PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t.acl.searchPlaceholder} />
                          <CommandList>
                            <CommandEmpty>{t.acl.noResults}</CommandEmpty>
                            <CommandGroup heading={t.acl.quickOptions}>
                              <CommandItem onSelect={() => addDestination('*:*')}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes('*:*') ? 'opacity-100' : 'opacity-0'}`} />{t.acl.allStarColon}</CommandItem>
                              <CommandItem onSelect={() => addDestination('autogroup:internet:*')}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes('autogroup:internet:*') ? 'opacity-100' : 'opacity-0'}`} />autogroup:internet:*</CommandItem>
                            </CommandGroup>
                            {Object.keys(aclGroups).length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.aclGroupsHeading}>{Object.keys(aclGroups).map((groupName) => (<CommandItem key={groupName} onSelect={() => addDestination(`${groupName}:*`)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(`${groupName}:*`) ? 'opacity-100' : 'opacity-0'}`} /><Users className="mr-2 h-4 w-4" /><span>{groupName}:*</span></CommandItem>))}</CommandGroup></>)}
                            {policy?.hosts && Object.keys(policy.hosts).length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.hostAliasesHeading}>{Object.entries(policy.hosts).map(([hostName, ip]) => (<CommandItem key={hostName} onSelect={() => addDestination(`${hostName}:*`)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(`${hostName}:*`) ? 'opacity-100' : 'opacity-0'}`} /><Globe className="mr-2 h-4 w-4" /><div className="flex flex-col"><span>{hostName}:*</span><span className="text-xs text-muted-foreground">{ip}</span></div></CommandItem>))}</CommandGroup></>)}
                            {resources.length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.resourcesHeading}>{resources.map((resource) => (<CommandItem key={resource.id} onSelect={() => addDestination(`${resource.name}:${resource.port || '*'}`)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(`${resource.name}:${resource.port || '*'}`) ? 'opacity-100' : 'opacity-0'}`} /><Database className="mr-2 h-4 w-4" /><div className="flex flex-col"><span>{resource.name}:{resource.port || '*'}</span><span className="text-xs text-muted-foreground">{resource.ip_address}</span></div></CommandItem>))}</CommandGroup></>)}
                            {devices.length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.devicesHeading}>{devices.slice(0, 10).map((device) => (<CommandItem key={device.id} onSelect={() => addDestination(`${device.ipAddresses?.[0]}:*`)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(`${device.ipAddresses?.[0]}:*`) ? 'opacity-100' : 'opacity-0'}`} />{getDeviceIcon(device)}<div className="flex flex-col ml-2"><span>{device.givenName || device.name}</span><span className="text-xs text-muted-foreground">{device.ipAddresses?.[0]}</span></div></CommandItem>))}</CommandGroup></>)}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder={t.acl.customDestPlaceholder} value={destInput} onChange={(e) => setDestInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && destInput) addDestination(destInput); }} />
                    <Button variant="outline" onClick={() => destInput && addDestination(destInput)}>{t.common.actions.add}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">{newRule.destinations?.map((dest, idx) => (<Badge key={idx} variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">{dest}<button onClick={() => removeDestination(dest)} className="ml-2 hover:text-destructive"><X className="h-3 w-3" /></button></Badge>))}</div>
                </div>
                <div>
                  <Label>{t.acl.actionLabel}</Label>
                  <Select value={newRule.action} onValueChange={(value: 'accept' | 'deny') => setNewRule({ ...newRule, action: value })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="accept">{t.acl.actionAccept}</SelectItem><SelectItem value="deny">{t.acl.actionDeny}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>{t.common.actions.cancel}</Button>
                <Button onClick={editingRule ? handleUpdateRule : handleAddRule} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingRule ? t.acl.saveChanges : t.acl.createRule}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* JSON Editor Dialog with Monaco */}
          <Dialog open={showJsonEditor} onOpenChange={setShowJsonEditor}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{t.acl.jsonEditorTitle}</DialogTitle>
                <DialogDescription>{t.acl.jsonEditorDesc}</DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                <Editor
                  height="100%"
                  language="json"
                  theme={isDarkMode ? 'vs-dark' : 'light'}
                  value={jsonContent}
                  onChange={(value) => setJsonContent(value || '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowJsonEditor(false)}>{t.common.actions.cancel}</Button>
                <Button onClick={handleImportJson} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{t.acl.saveAndApply}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
