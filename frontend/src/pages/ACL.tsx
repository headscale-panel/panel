import type {
  DragEndEvent,
} from '@dnd-kit/core';
import type { ACLPolicy, HeadscaleUserOption, NormalizedResource } from '@/lib/normalizers';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  HolderOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  TagOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRequest } from 'ahooks';
import { Button, Card, Empty, message, Space, Spin, Tag, theme, Tooltip, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { aclApi } from '@/api';
import JsonEditorModal from '@/components/acl/JsonEditorModal';

import RuleModal from '@/components/acl/RuleModal';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';

import { useTranslation } from '@/i18n/index';
import { ACLAction } from '@/lib/enums';
import { loadACLPageData } from '@/lib/page-data';

const { Text, Title } = Typography;

interface ACLRule {
  id: number;
  name: string;
  sources: string[];
  destinations: string[];
  action: ACLAction;
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
        <div className="flex items-start gap-2">
          <div
            {...listeners}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, paddingTop: 4, cursor: 'grab', color: token.colorTextSecondary }}
            title={t.acl.dragToSort}
          >
            <HolderOutlined className="text-18px" />
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
  const [initialLoading, setInitialLoading] = useState(true);
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

  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains('dark'),
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { loading, refreshAsync } = useRequest(
    async () => loadACLPageData(),
    {
      onSuccess: ({ policy, devices, resources, headscaleUsers }) => {
        setInitialLoading(false);
        if (policy) {
          setPolicy(policy);
          setAclGroups(policy.groups || {});

          const parsedRules: ACLRule[] = (policy.acls || []).map((acl, index) => ({
            id: index + 1,
            name: acl['#ha-meta']?.name || t.acl.defaultRuleName.replace('{index}', String(index + 1)),
            sources: acl.src || [],
            destinations: acl.dst || [],
            action: acl.action as ACLAction,
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
          })),
        );
        setResources(resources);
        setHeadscaleUsers(headscaleUsers);
      },
      onError: (error) => {
        setInitialLoading(false);
        console.error('Failed to load ACL data:', error);
        message.error(t.acl.loadFailed);
      },
    },
  );

  const loadData = useCallback(async () => {
    await refreshAsync();
  }, [refreshAsync]);

  const handleOpenEditDialog = (rule: ACLRule, index: number) => {
    setEditingRule(rule);
    setEditingIndex(index);
    setShowAddDialog(true);
  };

  const handleDeleteRule = async (index: number) => {
    setSaving(true);
    try {
      await aclApi.deleteRuleByIndex({ index });
      message.success(t.acl.deleteRuleSuccess);
      loadData();
    } catch {
      message.error(t.acl.deleteRuleFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleExportJson = async () => {
    try {
      const res = await aclApi.getPolicy();
      if (res) {
        setJsonContent(JSON.stringify(res, null, 2));
        setShowJsonEditor(true);
      }
    } catch {
      message.error(t.acl.getPolicyFailed);
    }
  };

  const handleSyncResources = async () => {
    setSaving(true);
    try {
      await aclApi.syncResourcesAsHosts();
      message.success(t.acl.syncSuccess);
      loadData();
    } catch {
      message.error(t.acl.syncFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id)
      return;

    const oldIndex = Number.parseInt((active.id as string).split('-')[1]);
    const newIndex = Number.parseInt((over.id as string).split('-')[1]);

    const newRules = arrayMove(rules, oldIndex, newIndex);
    setRules(newRules);

    if (policy) {
      const newPolicy = { ...policy };
      newPolicy.acls = newRules.map((rule) => ({
        '#ha-meta': { name: rule.name, open: true },
        'action': rule.action,
        'src': rule.sources,
        'dst': rule.destinations,
      }));
      try {
        await aclApi.updatePolicy(newPolicy);
        message.success(t.acl.orderUpdated);
        loadData();
      } catch {
        loadData();
      }
    }
  }, [rules, policy]);

  const stats = {
    total: rules.length,
    allow: rules.filter((r) => r.action === ACLAction.Accept).length,
    deny: rules.filter((r) => r.action === ACLAction.Deny).length,
    groups: Object.keys(aclGroups).length,
    tags: policy?.tagOwners ? Object.keys(policy.tagOwners).length : 0,
    hosts: policy?.hosts ? Object.keys(policy.hosts).length : 0,
  };

  if (initialLoading && loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center p-20">
          <Spin indicator={<LoadingOutlined className="text-32px" />} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="app-page-stack">
        <div className="page-header-row">
          <div>
            <Title level={4} className="page-title">{t.acl.title}</Title>
            <Text type="secondary">{t.acl.description}</Text>
          </div>
          <Space>
            <Tooltip title={t.common.actions.refresh}>
              <Button icon={<ReloadOutlined spin={saving} />} onClick={loadData} disabled={saving} />
            </Tooltip>
            <Button data-tour-id="acl-sync" icon={<DatabaseOutlined />} onClick={handleSyncResources} disabled={saving}>{t.acl.syncResources}</Button>
            <Button data-tour-id="acl-json" icon={<CodeOutlined />} onClick={handleExportJson}>{t.acl.jsonEditor}</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              data-tour-id="acl-add-rule"
              onClick={() => {
                setEditingRule(null);
                setEditingIndex(-1);
                setShowAddDialog(true);
              }}
            >
              {t.acl.addRule}
            </Button>
          </Space>
        </div>

        {/* Stats Grid */}
        <PageHeaderStatCards
          minCardWidth={150}
          items={[
            { label: t.acl.totalRules, value: stats.total, icon: <CodeOutlined className="stat-icon-primary" />, watermark: 'ALL' },
            { label: t.acl.allowRules, value: stats.allow, icon: <CheckCircleFilled className="stat-icon-success" />, watermark: 'OK' },
            { label: t.acl.denyRules, value: stats.deny, icon: <CloseCircleFilled className="text-28px text-#ff4d4f" />, watermark: 'DENY' },
            { label: t.acl.groupsLabel, value: stats.groups, icon: <TeamOutlined className="stat-icon-primary" />, watermark: 'GRP' },
            { label: t.acl.tagsLabel, value: stats.tags, icon: <TagOutlined className="stat-icon-success" />, watermark: 'TAG' },
            { label: t.acl.hostsResources, value: stats.hosts, icon: <GlobalOutlined className="stat-icon-accent" />, watermark: 'HOST' },
          ]}
        />

        {/* Rule List */}
        <Card>
          <Title level={5} className="mb-1!">{t.acl.ruleListTitle}</Title>
          <Text type="secondary" className="text-13px block mb-4">{t.acl.ruleListDesc}</Text>

          {rules.length === 0
            ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={(
                    <Space direction="vertical" size={2}>
                      <Text>{t.acl.noRules}</Text>
                      <Text type="secondary" className="text-13px">{t.acl.noRulesHint}</Text>
                    </Space>
                  )}
                  style={{ padding: '48px 0' }}
                />
              )
            : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={rules.map((_, i) => `rule-${i}`)} strategy={verticalListSortingStrategy}>
                    <Space direction="vertical" className="w-full" size={12}>
                      {rules.map((rule, index) => (
                        <SortableRuleCard key={`rule-${index}`} id={`rule-${index}`}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: token.colorBgLayout, fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{index + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Text strong className="text-16px">{rule.name}</Text>
                              <Tag color={rule.action === ACLAction.Accept ? 'success' : 'error'}>{rule.action === ACLAction.Accept ? t.acl.allow : t.acl.deny}</Tag>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-13px">
                              <Space size={4} wrap>
                                {rule.sources.map((src, idx) => (<Tag key={idx} color="blue">{src}</Tag>))}
                              </Space>
                              <span style={{ color: token.colorTextSecondary }}>→</span>
                              <Space size={4} wrap>
                                {rule.destinations.map((dest, idx) => (<Tag key={idx} color="orange">{dest}</Tag>))}
                              </Space>
                            </div>
                          </div>
                          <Space size={4} className="flex-shrink-0">
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
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <TeamOutlined className="text-18px" />
              <Text strong className="text-15px">{t.acl.aclGroups}</Text>
            </div>
            {Object.keys(aclGroups).length === 0
              ? (<Text type="secondary" className="text-13px">{t.acl.noGroups}</Text>)
              : (
                  <div className="scroll-area">
                    <Space direction="vertical" className="w-full" size={8}>
                      {Object.entries(aclGroups).map(([groupName, members]) => (
                        <div key={groupName} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 8, borderRadius: token.borderRadius, background: token.colorBgLayout }}>
                          <Tag>{groupName}</Tag>
                          <Space size={4} wrap>{members.map((member, idx) => (<Text key={idx} type="secondary" className="text-13px">{member}</Text>))}</Space>
                        </div>
                      ))}
                    </Space>
                  </div>
                )}
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <TagOutlined className="text-18px" />
              <Text strong className="text-15px">{t.acl.tagOwnersTitle}</Text>
            </div>
            {!policy?.tagOwners || Object.keys(policy.tagOwners).length === 0
              ? (<Text type="secondary" className="text-13px">{t.acl.noTagOwners}</Text>)
              : (
                  <div className="scroll-area">
                    <Space direction="vertical" className="w-full" size={8}>
                      {Object.entries(policy.tagOwners).map(([tagName, owners]) => (
                        <div key={tagName} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 8, borderRadius: token.borderRadius, background: token.colorBgLayout }}>
                          <Tag color="green">{tagName}</Tag>
                          <Space size={4} wrap>{owners.map((owner, idx) => (<Text key={idx} type="secondary" className="text-13px">{owner}</Text>))}</Space>
                        </div>
                      ))}
                    </Space>
                  </div>
                )}
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <GlobalOutlined className="text-18px" />
              <Text strong className="text-15px">{t.acl.hostAliases}</Text>
            </div>
            {!policy?.hosts || Object.keys(policy.hosts).length === 0
              ? (<Text type="secondary" className="text-13px">{t.acl.noHosts}</Text>)
              : (
                  <div className="scroll-area">
                    <Space direction="vertical" className="w-full" size={8}>
                      {Object.entries(policy.hosts).map(([hostName, ip]) => (
                        <div key={hostName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: token.borderRadius, background: token.colorBgLayout }}>
                          <Tag>{hostName}</Tag>
                          <Text type="secondary" code className="text-13px">{ip}</Text>
                        </div>
                      ))}
                    </Space>
                  </div>
                )}
          </Card>
        </div>

        <RuleModal
          open={showAddDialog}
          editingRule={editingRule}
          editingIndex={editingIndex}
          policy={policy}
          aclGroups={aclGroups}
          devices={devices}
          resources={resources}
          headscaleUsers={headscaleUsers}
          onCancel={() => { setShowAddDialog(false); setEditingRule(null); setEditingIndex(-1); }}
          onSuccess={loadData}
        />

        <JsonEditorModal
          open={showJsonEditor}
          initialJson={jsonContent}
          isDarkMode={isDarkMode}
          onCancel={() => setShowJsonEditor(false)}
          onSuccess={loadData}
        />
      </div>
    </DashboardLayout>
  );
}
