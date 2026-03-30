import {
  CheckCircleFilled,
  CheckOutlined,
  CloseCircleFilled,
  CloseOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DesktopOutlined,
  EditOutlined,
  GlobalOutlined,
  HolderOutlined,
  LaptopOutlined,
  LoadingOutlined,
  MobileOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TabletOutlined,
  TagOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Input, Modal, Popover, Select, Space, Spin, Tag, Tooltip, Typography, message, theme } from 'antd';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { buildACLDeviceOptions } from '@/lib/acl';
import { loadACLPageData } from '@/lib/page-data';
import type { ACLPolicy, HeadscaleUserOption, NormalizedResource } from '@/lib/normalizers';
import { useState, useEffect, useCallback, useMemo } from 'react';

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

const { Text, Title } = Typography;

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

/* -- Searchable Popover for selecting ACL targets -- */

interface ACLOptionGroup {
  label: string;
  options: { key: string; label: React.ReactNode; value: string; selected: boolean }[];
}

function ACLTargetPicker({
  groups,
  onSelect,
  children,
  searchPlaceholder,
}: {
  groups: ACLOptionGroup[];
  onSelect: (value: string) => void;
  children: React.ReactNode;
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filteredGroups = useMemo(() => {
    if (!search) return groups;
    const lower = search.toLowerCase();
    return groups
      .map(g => ({
        ...g,
        options: g.options.filter(o => o.value.toLowerCase().includes(lower) || (typeof o.label === 'string' && o.label.toLowerCase().includes(lower))),
      }))
      .filter(g => g.options.length > 0);
  }, [groups, search]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      content={
        <div style={{ width: 320 }}>
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ marginBottom: 8 }}
          />
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {filteredGroups.length === 0 && <Text type="secondary" style={{ padding: 8, display: 'block' }}>No results</Text>}
            {filteredGroups.map((group, gi) => (
              <div key={gi}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', padding: '4px 8px' }}>{group.label}</Text>
                {group.options.map(opt => (
                  <div
                    key={opt.key}
                    style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
                    onClick={() => { onSelect(opt.value); }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <CheckOutlined style={{ fontSize: 12, opacity: opt.selected ? 1 : 0, color: '#1677ff' }} />
                    {opt.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  );
}

/* -- SortableRuleCard -- */

interface SortableRuleCardProps {
  id: string;
  children: React.ReactNode;
}

function SortableRuleCard({ id, children }: SortableRuleCardProps) {
  const t = useTranslation();
  const { token } = theme.useToken();
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
      <div style={{ background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div
            {...listeners}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, paddingTop: 4, cursor: 'grab', color: token.colorTextSecondary }}
            title={t.acl.dragToSort}
          >
            <HolderOutlined style={{ fontSize: 18 }} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ACL() {
  const t = useTranslation();
  const { token } = theme.useToken();
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
      message.error(t.acl.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const aclDeviceOptions = buildACLDeviceOptions(devices);

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.sources?.length || !newRule.destinations?.length) {
      message.error(t.acl.ruleIncomplete);
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
      message.success(t.acl.addSuccess);
      setShowAddDialog(false);
      setNewRule({ name: '', sources: [], destinations: [], action: 'accept' });
      setSourceInput('');
      setDestInput('');
      loadData();
    } catch (error) {
      message.error(t.acl.addFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRule = async () => {
    if (!newRule.name || !newRule.sources?.length || !newRule.destinations?.length) {
      message.error(t.acl.ruleIncomplete);
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
      message.success(t.acl.updateSuccess);
      setShowAddDialog(false);
      setEditingRule(null);
      setEditingIndex(-1);
      setNewRule({ name: '', sources: [], destinations: [], action: 'accept' });
      loadData();
    } catch (error) {
      message.error(t.acl.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (index: number) => {
    setSaving(true);
    try {
      await aclAPI.deleteRuleByIndex(index);
      message.success(t.acl.deleteRuleSuccess);
      loadData();
    } catch (error) {
      message.error(t.acl.deleteRuleFailed);
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
      message.error(t.acl.getPolicyFailed);
    }
  };

  const handleImportJson = async () => {
    setSaving(true);
    try {
      await aclAPI.setPolicyRaw(jsonContent);
      message.success(t.acl.importSuccess);
      setShowJsonEditor(false);
      loadData();
    } catch (e) {
      message.error(t.acl.importFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncResources = async () => {
    setSaving(true);
    try {
      await aclAPI.syncResourcesAsHosts();
      message.success(t.acl.syncSuccess);
      loadData();
    } catch (error) {
      message.error(t.acl.syncFailed);
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
        message.success(t.acl.orderUpdated);
        loadData();
      } catch {
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
    if (name.includes('phone') || name.includes('iphone')) return <MobileOutlined />;
    if (name.includes('ipad') || name.includes('tablet')) return <TabletOutlined />;
    if (name.includes('server') || name.includes('nas')) return <DesktopOutlined />;
    if (name.includes('mac') || name.includes('laptop')) return <LaptopOutlined />;
    return <DesktopOutlined />;
  };

  /* -- Build option groups for source/destination pickers -- */

  const buildSourceGroups = (): ACLOptionGroup[] => {
    const groups: ACLOptionGroup[] = [];
    groups.push({
      label: t.acl.quickOptions,
      options: [{ key: 'all-star', label: <span>{t.acl.allStar}</span>, value: '*', selected: !!newRule.sources?.includes('*') }],
    });
    groups.push({
      label: t.acl.autogroupsHeading,
      options: [
        { key: 'autogroup-member', label: <span><SafetyCertificateOutlined style={{ marginRight: 8 }} />autogroup:member</span>, value: 'autogroup:member', selected: !!newRule.sources?.includes('autogroup:member') },
        { key: 'autogroup-tagged', label: <span><SafetyCertificateOutlined style={{ marginRight: 8 }} />autogroup:tagged</span>, value: 'autogroup:tagged', selected: !!newRule.sources?.includes('autogroup:tagged') },
      ],
    });
    if (policy?.tagOwners && Object.keys(policy.tagOwners).length > 0) {
      groups.push({
        label: t.acl.tagsHeading,
        options: Object.keys(policy.tagOwners).map(tagName => ({
          key: `tag-src-${tagName}`, label: <span><TagOutlined style={{ marginRight: 8 }} />{tagName}</span>, value: tagName, selected: !!newRule.sources?.includes(tagName),
        })),
      });
    }
    if (Object.keys(aclGroups).length > 0) {
      groups.push({
        label: t.acl.aclGroupsHeading,
        options: Object.keys(aclGroups).map(groupName => ({
          key: `group-src-${groupName}`, label: <span><TeamOutlined style={{ marginRight: 8 }} />{groupName}</span>, value: groupName, selected: !!newRule.sources?.includes(groupName),
        })),
      });
    }
    if (headscaleUsers.length > 0) {
      groups.push({
        label: t.acl.headscaleUsersHeading,
        options: headscaleUsers.map(user => ({
          key: `user-src-${user.name}`, label: <span><UserOutlined style={{ marginRight: 8 }} />{user.name}@</span>, value: `${user.name}@`, selected: !!newRule.sources?.includes(`${user.name}@`),
        })),
      });
    }
    if (aclDeviceOptions.length > 0) {
      groups.push({
        label: t.acl.devicesHeading,
        options: aclDeviceOptions.map(device => ({
          key: `device-src-${device.id}`,
          label: <span>{getDeviceIcon(devices.find(d => d.id === device.id) || { id: device.id, givenName: device.label, name: device.label, ipAddresses: [device.ipAddress] })} <span style={{ marginLeft: 8 }}>{device.label}</span> <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>{device.ipAddress}</Text></span>,
          value: device.sourceValue,
          selected: !!newRule.sources?.includes(device.sourceValue),
        })),
      });
    }
    return groups;
  };

  const buildDestGroups = (): ACLOptionGroup[] => {
    const groups: ACLOptionGroup[] = [];
    groups.push({
      label: t.acl.quickOptions,
      options: [{ key: 'all-star-colon', label: <span>{t.acl.allStarColon}</span>, value: '*:*', selected: !!newRule.destinations?.includes('*:*') }],
    });
    groups.push({
      label: t.acl.autogroupsHeading,
      options: [
        { key: 'autogroup-internet', label: <span><SafetyCertificateOutlined style={{ marginRight: 8 }} />autogroup:internet:*</span>, value: 'autogroup:internet:*', selected: !!newRule.destinations?.includes('autogroup:internet:*') },
        { key: 'autogroup-self', label: <span><SafetyCertificateOutlined style={{ marginRight: 8 }} />autogroup:self:*</span>, value: 'autogroup:self:*', selected: !!newRule.destinations?.includes('autogroup:self:*') },
      ],
    });
    if (policy?.tagOwners && Object.keys(policy.tagOwners).length > 0) {
      groups.push({
        label: t.acl.tagsHeading,
        options: Object.keys(policy.tagOwners).map(tagName => ({
          key: `tag-dst-${tagName}`, label: <span><TagOutlined style={{ marginRight: 8 }} />{tagName}:*</span>, value: `${tagName}:*`, selected: !!newRule.destinations?.includes(`${tagName}:*`),
        })),
      });
    }
    if (Object.keys(aclGroups).length > 0) {
      groups.push({
        label: t.acl.aclGroupsHeading,
        options: Object.keys(aclGroups).map(groupName => ({
          key: `group-dst-${groupName}`, label: <span><TeamOutlined style={{ marginRight: 8 }} />{groupName}:*</span>, value: `${groupName}:*`, selected: !!newRule.destinations?.includes(`${groupName}:*`),
        })),
      });
    }
    if (policy?.hosts && Object.keys(policy.hosts).length > 0) {
      groups.push({
        label: t.acl.hostAliasesHeading,
        options: Object.entries(policy.hosts).map(([hostName, ip]) => ({
          key: `host-dst-${hostName}`,
          label: <span><GlobalOutlined style={{ marginRight: 8 }} />{hostName}:* <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>{ip}</Text></span>,
          value: `${hostName}:*`,
          selected: !!newRule.destinations?.includes(`${hostName}:*`),
        })),
      });
    }
    if (resources.length > 0) {
      groups.push({
        label: t.acl.resourcesHeading,
        options: resources.map(resource => ({
          key: `resource-dst-${resource.id}`,
          label: <span><DatabaseOutlined style={{ marginRight: 8 }} />{resource.name}:{resource.port || '*'} <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>{resource.ip_address}</Text></span>,
          value: `${resource.name}:${resource.port || '*'}`,
          selected: !!newRule.destinations?.includes(`${resource.name}:${resource.port || '*'}`),
        })),
      });
    }
    if (aclDeviceOptions.length > 0) {
      groups.push({
        label: t.acl.devicesHeading,
        options: aclDeviceOptions.map(device => ({
          key: `device-dst-${device.id}`,
          label: <span>{getDeviceIcon(devices.find(d => d.id === device.id) || { id: device.id, givenName: device.label, name: device.label, ipAddresses: [device.ipAddress] })} <span style={{ marginLeft: 8 }}>{device.label}</span> <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>{device.ipAddress}</Text></span>,
          value: device.destinationValue,
          selected: !!newRule.destinations?.includes(device.destinationValue),
        })),
      });
    }
    return groups;
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
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{t.acl.title}</Title>
            <Text type="secondary">{t.acl.description}</Text>
          </div>
          <Space>
            <Tooltip title={t.common.actions.refresh}>
              <Button icon={<ReloadOutlined spin={saving} />} onClick={loadData} disabled={saving} />
            </Tooltip>
            <Button icon={<DatabaseOutlined />} onClick={handleSyncResources} disabled={saving}>{t.acl.syncResources}</Button>
            <Button icon={<CodeOutlined />} onClick={handleExportJson}>{t.acl.jsonEditor}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setEditingRule(null);
              setEditingIndex(-1);
              setNewRule({ name: '', sources: [], destinations: [], action: 'accept' });
              setShowAddDialog(true);
            }}>{t.acl.addRule}</Button>
          </Space>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
          {[
            { label: t.acl.totalRules, value: stats.total, icon: <CodeOutlined style={{ fontSize: 28, color: '#1677ff' }} /> },
            { label: t.acl.allowRules, value: stats.allow, icon: <CheckCircleFilled style={{ fontSize: 28, color: '#52c41a' }} /> },
            { label: t.acl.denyRules, value: stats.deny, icon: <CloseCircleFilled style={{ fontSize: 28, color: '#ff4d4f' }} /> },
            { label: t.acl.groupsLabel, value: stats.groups, icon: <TeamOutlined style={{ fontSize: 28, color: '#1677ff' }} /> },
            { label: t.acl.tagsLabel, value: stats.tags, icon: <TagOutlined style={{ fontSize: 28, color: '#52c41a' }} /> },
            { label: t.acl.hostsResources, value: stats.hosts, icon: <GlobalOutlined style={{ fontSize: 28, color: '#722ed1' }} /> },
          ].map((stat, i) => (
            <Card key={i} size="small" style={{ padding: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{stat.label}</Text>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{stat.value}</div>
                </div>
                {stat.icon}
              </div>
            </Card>
          ))}
        </div>

        {/* Rule List */}
        <Card>
          <Title level={5} style={{ marginBottom: 4 }}>{t.acl.ruleListTitle}</Title>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>{t.acl.ruleListDesc}</Text>

          {rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: token.colorTextSecondary }}>
              <CodeOutlined style={{ fontSize: 48, opacity: 0.5, display: 'block', marginBottom: 16 }} />
              <p>{t.acl.noRules}</p>
              <Text type="secondary" style={{ fontSize: 13 }}>{t.acl.noRulesHint}</Text>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={rules.map((_, i) => `rule-${i}`)} strategy={verticalListSortingStrategy}>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  {rules.map((rule, index) => (
                    <SortableRuleCard key={`rule-${index}`} id={`rule-${index}`}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: token.colorBgLayout, fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{index + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Text strong style={{ fontSize: 16 }}>{rule.name}</Text>
                          <Tag color={rule.action === 'accept' ? 'success' : 'error'}>{rule.action === 'accept' ? t.acl.allow : t.acl.deny}</Tag>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                          <Space size={4} wrap>
                            {rule.sources.map((src, idx) => (<Tag key={idx} color="blue">{src}</Tag>))}
                          </Space>
                          <span style={{ color: token.colorTextSecondary }}>→</span>
                          <Space size={4} wrap>
                            {rule.destinations.map((dest, idx) => (<Tag key={idx} color="orange">{dest}</Tag>))}
                          </Space>
                        </div>
                      </div>
                      <Space size={4} style={{ flexShrink: 0 }}>
                        <Tooltip title={t.common.actions.edit}><Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleOpenEditDialog(rule, index)} /></Tooltip>
                        <Tooltip title={t.acl.copy}><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(JSON.stringify(rule, null, 2)); message.success(t.acl.ruleCopied); }} /></Tooltip>
                        <Tooltip title={t.common.actions.delete}><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteRule(index)} disabled={saving} /></Tooltip>
                      </Space>
                    </SortableRuleCard>
                  ))}
                </Space>
              </SortableContext>
            </DndContext>
          )}
        </Card>

        {/* Info Cards: Groups / Tags / Hosts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <TeamOutlined style={{ fontSize: 18 }} />
              <Text strong style={{ fontSize: 15 }}>{t.acl.aclGroups}</Text>
            </div>
            {Object.keys(aclGroups).length === 0 ? (<Text type="secondary" style={{ fontSize: 13 }}>{t.acl.noGroups}</Text>) : (
              <div style={{ maxHeight: 256, overflow: 'auto' }}>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {Object.entries(aclGroups).map(([groupName, members]) => (
                    <div key={groupName} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 8, borderRadius: token.borderRadius, background: token.colorBgLayout }}>
                      <Tag>{groupName}</Tag>
                      <Space size={4} wrap>{members.map((member, idx) => (<Text key={idx} type="secondary" style={{ fontSize: 13 }}>{member}</Text>))}</Space>
                    </div>
                  ))}
                </Space>
              </div>
            )}
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <TagOutlined style={{ fontSize: 18 }} />
              <Text strong style={{ fontSize: 15 }}>{t.acl.tagOwnersTitle}</Text>
            </div>
            {!policy?.tagOwners || Object.keys(policy.tagOwners).length === 0 ? (<Text type="secondary" style={{ fontSize: 13 }}>{t.acl.noTagOwners}</Text>) : (
              <div style={{ maxHeight: 256, overflow: 'auto' }}>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {Object.entries(policy.tagOwners).map(([tagName, owners]) => (
                    <div key={tagName} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 8, borderRadius: token.borderRadius, background: token.colorBgLayout }}>
                      <Tag color="green">{tagName}</Tag>
                      <Space size={4} wrap>{owners.map((owner, idx) => (<Text key={idx} type="secondary" style={{ fontSize: 13 }}>{owner}</Text>))}</Space>
                    </div>
                  ))}
                </Space>
              </div>
            )}
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <GlobalOutlined style={{ fontSize: 18 }} />
              <Text strong style={{ fontSize: 15 }}>{t.acl.hostAliases}</Text>
            </div>
            {!policy?.hosts || Object.keys(policy.hosts).length === 0 ? (<Text type="secondary" style={{ fontSize: 13 }}>{t.acl.noHosts}</Text>) : (
              <div style={{ maxHeight: 256, overflow: 'auto' }}>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {Object.entries(policy.hosts).map(([hostName, ip]) => (
                    <div key={hostName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: token.borderRadius, background: token.colorBgLayout }}>
                      <Tag>{hostName}</Tag>
                      <Text type="secondary" code style={{ fontSize: 13 }}>{ip}</Text>
                    </div>
                  ))}
                </Space>
              </div>
            )}
          </Card>
        </div>

        {/* Add/Edit Rule Modal */}
        <Modal
          open={showAddDialog}
          title={editingRule ? t.acl.editRuleTitle : t.acl.addRuleTitle}
          width={720}
          onCancel={() => { setShowAddDialog(false); setEditingRule(null); setEditingIndex(-1); }}
          footer={[
            <Button key="cancel" onClick={() => setShowAddDialog(false)}>{t.common.actions.cancel}</Button>,
            <Button key="ok" type="primary" onClick={editingRule ? handleUpdateRule : handleAddRule} loading={saving}>
              {editingRule ? t.acl.saveChanges : t.acl.createRule}
            </Button>,
          ]}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{editingRule ? t.acl.editRuleDesc : t.acl.addRuleDesc}</Text>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.acl.ruleNameLabel}</Text>
              <Input placeholder={t.acl.ruleNamePlaceholder} value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} />
            </div>

            {/* Sources */}
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.acl.sourceLabel}</Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{t.acl.sourceDesc}</Text>
              <ACLTargetPicker groups={buildSourceGroups()} onSelect={addSource} searchPlaceholder={t.acl.searchPlaceholder}>
                <Button icon={<PlusOutlined />} block style={{ marginBottom: 8 }}>{t.acl.selectSource}</Button>
              </ACLTargetPicker>
              <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                <Input placeholder={t.acl.customSourcePlaceholder} value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && sourceInput) addSource(sourceInput); }} />
                <Button onClick={() => sourceInput && addSource(sourceInput)}>{t.common.actions.add}</Button>
              </Space.Compact>
              <Space size={[4, 4]} wrap>
                {newRule.sources?.map((src, idx) => (
                  <Tag key={idx} color="blue" closable onClose={() => removeSource(src)}>{src}</Tag>
                ))}
              </Space>
            </div>

            {/* Destinations */}
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.acl.destinationLabel}</Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{t.acl.destinationDesc}</Text>
              <ACLTargetPicker groups={buildDestGroups()} onSelect={addDestination} searchPlaceholder={t.acl.searchPlaceholder}>
                <Button icon={<PlusOutlined />} block style={{ marginBottom: 8 }}>{t.acl.selectDestination}</Button>
              </ACLTargetPicker>
              <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                <Input placeholder={t.acl.customDestPlaceholder} value={destInput} onChange={(e) => setDestInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && destInput) addDestination(destInput); }} />
                <Button onClick={() => destInput && addDestination(destInput)}>{t.common.actions.add}</Button>
              </Space.Compact>
              <Space size={[4, 4]} wrap>
                {newRule.destinations?.map((dest, idx) => (
                  <Tag key={idx} color="orange" closable onClose={() => removeDestination(dest)}>{dest}</Tag>
                ))}
              </Space>
            </div>

            {/* Action */}
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.acl.actionLabel}</Text>
              <Select
                value={newRule.action}
                onChange={(value: 'accept' | 'deny') => setNewRule({ ...newRule, action: value })}
                style={{ width: '100%' }}
                options={[
                  { value: 'accept', label: t.acl.actionAccept },
                  { value: 'deny', label: t.acl.actionDeny },
                ]}
              />
            </div>
          </Space>
        </Modal>

        {/* JSON Editor Modal with Monaco */}
        <Modal
          open={showJsonEditor}
          title={t.acl.jsonEditorTitle}
          width={900}
          onCancel={() => setShowJsonEditor(false)}
          styles={{ body: { height: '60vh', padding: 0 } }}
          footer={[
            <Button key="cancel" onClick={() => setShowJsonEditor(false)}>{t.common.actions.cancel}</Button>,
            <Button key="ok" type="primary" onClick={handleImportJson} loading={saving}>{t.acl.saveAndApply}</Button>,
          ]}
        >
          <Text type="secondary" style={{ display: 'block', padding: '0 0 8px 0' }}>{t.acl.jsonEditorDesc}</Text>
          <div style={{ height: 'calc(60vh - 40px)', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, overflow: 'hidden' }}>
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
        </Modal>
      </div>
    </DashboardLayout>
  );
}
