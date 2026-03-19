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
import { buildACLDeviceOptions } from '@/lib/acl';
import { loadACLPageData } from '@/lib/page-data';
import type { ACLPolicy, HeadscaleUserOption, NormalizedResource } from '@/lib/normalizers';
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
  Shield,
  Smartphone,
  Tablet,
  Tag,
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

interface DeviceItem {
  id: string;
  givenName: string;
  name: string;
  ipAddresses: string[];
  user?: { name: string };
}

type ResourceItem = NormalizedResource;
type HeadscaleUser = HeadscaleUserOption;

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
      const { policy, devices, resources, headscaleUsers } = await loadACLPageData();

      if (policy) {
        setPolicy(policy);
        setAclGroups(policy.groups || {});

        const parsedRules: ACLRule[] = (policy.acls || []).map((acl, index) => ({
          id: index + 1,
          name: acl['#ha-meta']?.name || t.acl.defaultRuleName.replace('{index}', String(index + 1)),
          sources: acl.src || [],
          destinations: acl.dst || [],
          action: acl.action as 'accept' | 'deny',
        }));
        setRules(parsedRules);
      } else {
        setPolicy(null);
        setAclGroups({});
        setRules([]);
      }

      setDevices(
        devices.map((device) => ({
          id: device.id,
          givenName: device.given_name || device.name,
          name: device.name,
          ipAddresses: device.ip_addresses,
          user: device.user ? { name: device.user.name } : undefined,
        }))
      );
      setResources(resources);
      setHeadscaleUsers(headscaleUsers);
    } catch (error) {
      console.error('Failed to load ACL data:', error);
      toast.error(t.acl.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const aclDeviceOptions = buildACLDeviceOptions(devices);

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
    tags: policy?.tagOwners ? Object.keys(policy.tagOwners).length : 0,
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

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
                  <p className="text-sm text-muted-foreground">{t.acl.tagsLabel}</p>
                  <p className="text-2xl font-bold mt-1">{stats.tags}</p>
                </div>
                <Tag className="h-8 w-8 opacity-80 text-emerald-500" />
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Tag className="h-5 w-5" />{t.acl.tagOwnersTitle}</h3>
              {!policy?.tagOwners || Object.keys(policy.tagOwners).length === 0 ? (<p className="text-muted-foreground text-sm">{t.acl.noTagOwners}</p>) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {Object.entries(policy.tagOwners).map(([tagName, owners]) => (
                    <div key={tagName} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                      <Badge variant="outline" className="shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">{tagName}</Badge>
                      <div className="flex flex-wrap gap-1">{owners.map((owner, idx) => (<span key={idx} className="text-sm text-muted-foreground">{owner}</span>))}</div>
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
                    <Popover modal={true}>
                      <PopoverTrigger asChild><Button variant="outline" className="flex-1"><Plus className="h-4 w-4 mr-2" />{t.acl.selectSource}</Button></PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start" side="bottom" sideOffset={4}>
                        <Command>
                          <CommandInput placeholder={t.acl.searchPlaceholder} />
                          <CommandList className="max-h-[400px]">
                            <CommandEmpty>{t.acl.noResults}</CommandEmpty>
                            <CommandGroup heading={t.acl.quickOptions}>
                              <CommandItem value="all-star" onSelect={() => addSource('*')}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes('*') ? 'opacity-100' : 'opacity-0'}`} />{t.acl.allStar}</CommandItem>
                            </CommandGroup>
                            <CommandSeparator />
                            <CommandGroup heading={t.acl.autogroupsHeading}>
                              <CommandItem value="autogroup-member" onSelect={() => addSource('autogroup:member')}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes('autogroup:member') ? 'opacity-100' : 'opacity-0'}`} /><Shield className="mr-2 h-4 w-4" /><div className="flex flex-col"><span>autogroup:member</span><span className="text-xs text-muted-foreground">{t.acl.autogroupMemberDesc}</span></div></CommandItem>
                              <CommandItem value="autogroup-tagged" onSelect={() => addSource('autogroup:tagged')}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes('autogroup:tagged') ? 'opacity-100' : 'opacity-0'}`} /><Shield className="mr-2 h-4 w-4" /><div className="flex flex-col"><span>autogroup:tagged</span><span className="text-xs text-muted-foreground">{t.acl.autogroupTaggedDesc}</span></div></CommandItem>
                            </CommandGroup>
                            {policy?.tagOwners && Object.keys(policy.tagOwners).length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.tagsHeading}>{Object.keys(policy.tagOwners).map((tagName) => (<CommandItem key={tagName} value={`tag-src-${tagName}`} onSelect={() => addSource(tagName)}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes(tagName) ? 'opacity-100' : 'opacity-0'}`} /><Tag className="mr-2 h-4 w-4" /><span>{tagName}</span></CommandItem>))}</CommandGroup></>)}
                            {Object.keys(aclGroups).length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.aclGroupsHeading}>{Object.keys(aclGroups).map((groupName) => (<CommandItem key={groupName} value={`group-src-${groupName}`} onSelect={() => addSource(groupName)}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes(groupName) ? 'opacity-100' : 'opacity-0'}`} /><Users className="mr-2 h-4 w-4" /><span>{groupName}</span></CommandItem>))}</CommandGroup></>)}
                            {headscaleUsers.length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.headscaleUsersHeading}>{headscaleUsers.map((user) => (<CommandItem key={user.id} value={`user-src-${user.name}`} onSelect={() => addSource(`${user.name}@`)}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes(`${user.name}@`) ? 'opacity-100' : 'opacity-0'}`} /><User className="mr-2 h-4 w-4" /><span>{user.name}@</span></CommandItem>))}</CommandGroup></>)}
                            {aclDeviceOptions.length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.devicesHeading}>{aclDeviceOptions.map((device) => (<CommandItem key={device.id} value={`device-src-${device.label}-${device.ipAddress}`} onSelect={() => addSource(device.sourceValue)}><Check className={`mr-2 h-4 w-4 ${newRule.sources?.includes(device.sourceValue) ? 'opacity-100' : 'opacity-0'}`} />{getDeviceIcon(devices.find((item) => item.id === device.id) || { id: device.id, givenName: device.label, name: device.label, ipAddresses: [device.ipAddress] })}<div className="flex flex-col ml-2"><span>{device.label}</span><span className="text-xs text-muted-foreground">{device.ipAddress}</span></div></CommandItem>))}</CommandGroup></>)}
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
                    <Popover modal={true}>
                      <PopoverTrigger asChild><Button variant="outline" className="flex-1"><Plus className="h-4 w-4 mr-2" />{t.acl.selectDestination}</Button></PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="start" side="bottom" sideOffset={4}>
                        <Command>
                          <CommandInput placeholder={t.acl.searchPlaceholder} />
                          <CommandList className="max-h-[400px]">
                            <CommandEmpty>{t.acl.noResults}</CommandEmpty>
                            <CommandGroup heading={t.acl.quickOptions}>
                              <CommandItem value="all-star-colon" onSelect={() => addDestination('*:*')}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes('*:*') ? 'opacity-100' : 'opacity-0'}`} />{t.acl.allStarColon}</CommandItem>
                            </CommandGroup>
                            <CommandSeparator />
                            <CommandGroup heading={t.acl.autogroupsHeading}>
                              <CommandItem value="autogroup-internet" onSelect={() => addDestination('autogroup:internet:*')}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes('autogroup:internet:*') ? 'opacity-100' : 'opacity-0'}`} /><Shield className="mr-2 h-4 w-4" /><div className="flex flex-col"><span>autogroup:internet:*</span><span className="text-xs text-muted-foreground">{t.acl.autogroupInternetDesc}</span></div></CommandItem>
                              <CommandItem value="autogroup-self" onSelect={() => addDestination('autogroup:self:*')}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes('autogroup:self:*') ? 'opacity-100' : 'opacity-0'}`} /><Shield className="mr-2 h-4 w-4" /><div className="flex flex-col"><span>autogroup:self:*</span><span className="text-xs text-muted-foreground">{t.acl.autogroupSelfDesc}</span></div></CommandItem>
                            </CommandGroup>
                            {policy?.tagOwners && Object.keys(policy.tagOwners).length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.tagsHeading}>{Object.keys(policy.tagOwners).map((tagName) => (<CommandItem key={tagName} value={`tag-dst-${tagName}`} onSelect={() => addDestination(`${tagName}:*`)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(`${tagName}:*`) ? 'opacity-100' : 'opacity-0'}`} /><Tag className="mr-2 h-4 w-4" /><span>{tagName}:*</span></CommandItem>))}</CommandGroup></>)}
                            {Object.keys(aclGroups).length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.aclGroupsHeading}>{Object.keys(aclGroups).map((groupName) => (<CommandItem key={groupName} value={`group-dst-${groupName}`} onSelect={() => addDestination(`${groupName}:*`)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(`${groupName}:*`) ? 'opacity-100' : 'opacity-0'}`} /><Users className="mr-2 h-4 w-4" /><span>{groupName}:*</span></CommandItem>))}</CommandGroup></>)}
                            {policy?.hosts && Object.keys(policy.hosts).length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.hostAliasesHeading}>{Object.entries(policy.hosts).map(([hostName, ip]) => (<CommandItem key={hostName} value={`host-dst-${hostName}`} onSelect={() => addDestination(`${hostName}:*`)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(`${hostName}:*`) ? 'opacity-100' : 'opacity-0'}`} /><Globe className="mr-2 h-4 w-4" /><div className="flex flex-col"><span>{hostName}:*</span><span className="text-xs text-muted-foreground">{ip}</span></div></CommandItem>))}</CommandGroup></>)}
                            {resources.length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.resourcesHeading}>{resources.map((resource) => (<CommandItem key={resource.id} value={`resource-dst-${resource.name}`} onSelect={() => addDestination(`${resource.name}:${resource.port || '*'}`)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(`${resource.name}:${resource.port || '*'}`) ? 'opacity-100' : 'opacity-0'}`} /><Database className="mr-2 h-4 w-4" /><div className="flex flex-col"><span>{resource.name}:{resource.port || '*'}</span><span className="text-xs text-muted-foreground">{resource.ip_address}</span></div></CommandItem>))}</CommandGroup></>)}
                            {aclDeviceOptions.length > 0 && (<><CommandSeparator /><CommandGroup heading={t.acl.devicesHeading}>{aclDeviceOptions.map((device) => (<CommandItem key={device.id} value={`device-dst-${device.label}-${device.ipAddress}`} onSelect={() => addDestination(device.destinationValue)}><Check className={`mr-2 h-4 w-4 ${newRule.destinations?.includes(device.destinationValue) ? 'opacity-100' : 'opacity-0'}`} />{getDeviceIcon(devices.find((item) => item.id === device.id) || { id: device.id, givenName: device.label, name: device.label, ipAddresses: [device.ipAddress] })}<div className="flex flex-col ml-2"><span>{device.label}</span><span className="text-xs text-muted-foreground">{device.ipAddress}</span></div></CommandItem>))}</CommandGroup></>)}
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
