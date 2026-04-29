import type { ACLPolicy, HeadscaleUserOption, NormalizedResource } from '@/lib/normalizers';
import {
  CheckOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  GlobalOutlined,
  LaptopOutlined,
  MobileOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  TabletOutlined,
  TagOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Button,
  Input,
  message,
  Modal,
  Popover,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { aclApi } from '@/api';
import { useTranslation } from '@/i18n/index';
import { buildACLDeviceOptions } from '@/lib/acl';
import { ACLAction } from '@/lib/enums';

const { Text } = Typography;

/* ---------- Types ---------- */

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

interface ACLOptionGroup {
  label: string;
  options: { key: string; label: React.ReactNode; value: string; selected: boolean }[];
}

/* ---------- ACLTargetPicker ---------- */

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
    if (!search)
      return groups;
    const lower = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        options: g.options.filter((o) =>
          o.value.toLowerCase().includes(lower)
          || (typeof o.label === 'string' && o.label.toLowerCase().includes(lower)),
        ),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, search]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      content={(
        <div className="w-80">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="mb-2"
          />
          <div className="max-h-100 overflow-auto">
            {filteredGroups.length === 0 && <Text type="secondary" className="p-2 block">No results</Text>}
            {filteredGroups.map((group, gi) => (
              <div key={gi}>
                <Text type="secondary" className="text-12px block py-1 px-2">{group.label}</Text>
                {group.options.map((opt) => (
                  <div
                    key={opt.key}
                    className="py-1.5 px-2 cursor-pointer flex items-center gap-2 rounded"
                    onClick={() => { onSelect(opt.value); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.04)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <CheckOutlined style={{ fontSize: 12, opacity: opt.selected ? 1 : 0, color: '#1677ff' }} />
                    {opt.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    >
      {children}
    </Popover>
  );
}

/* ---------- RuleModal ---------- */

interface RuleModalProps {
  open: boolean;
  /** null = create mode, non-null = edit mode */
  editingRule: ACLRule | null;
  editingIndex: number;
  policy: ACLPolicy | null;
  aclGroups: Record<string, string[]>;
  devices: DeviceItem[];
  resources: NormalizedResource[];
  headscaleUsers: HeadscaleUserOption[];
  onCancel: () => void;
  onSuccess: () => void;
}

const DEFAULT_RULE: Partial<ACLRule> = {
  name: '',
  sources: [],
  destinations: [],
  action: ACLAction.Accept,
};

export default function RuleModal({
  open,
  editingRule,
  editingIndex,
  policy,
  aclGroups,
  devices,
  resources,
  headscaleUsers,
  onCancel,
  onSuccess,
}: RuleModalProps) {
  const t = useTranslation();

  const [rule, setRule] = useState<Partial<ACLRule>>(DEFAULT_RULE);
  const [sourceInput, setSourceInput] = useState('');
  const [destInput, setDestInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAfterOpenChange = (nextOpen: boolean) => {
    if (!nextOpen)
      return;

    if (editingRule) {
      setRule({
        name: editingRule.name,
        sources: [...editingRule.sources],
        destinations: [...editingRule.destinations],
        action: editingRule.action,
      });
    } else {
      setRule(DEFAULT_RULE);
    }
    setSourceInput('');
    setDestInput('');
  };

  const addSource = (value: string) => {
    if (value && !rule.sources?.includes(value)) {
      setRule((r) => ({ ...r, sources: [...(r.sources || []), value] }));
      setSourceInput('');
    }
  };

  const removeSource = (value: string) => {
    setRule((r) => ({ ...r, sources: r.sources?.filter((s) => s !== value) || [] }));
  };

  const addDestination = (value: string) => {
    if (value && !rule.destinations?.includes(value)) {
      setRule((r) => ({ ...r, destinations: [...(r.destinations || []), value] }));
      setDestInput('');
    }
  };

  const removeDestination = (value: string) => {
    setRule((r) => ({ ...r, destinations: r.destinations?.filter((d) => d !== value) || [] }));
  };

  const handleOk = async () => {
    if (!rule.name || !rule.sources?.length || !rule.destinations?.length) {
      message.error(t.acl.ruleIncomplete);
      return;
    }

    setSaving(true);
    try {
      if (editingRule) {
        await aclApi.updateRuleByIndex({
          index: editingIndex,
          name: rule.name,
          sources: rule.sources,
          destinations: rule.destinations,
          action: rule.action ?? ACLAction.Accept,
        });
        message.success(t.acl.updateSuccess);
      } else {
        await aclApi.addRule({
          name: rule.name,
          sources: rule.sources,
          destinations: rule.destinations,
          action: rule.action ?? ACLAction.Accept,
        });
        message.success(t.acl.addSuccess);
      }
      onCancel();
      onSuccess();
    } catch {
      message.error(editingRule ? t.acl.updateFailed : t.acl.addFailed);
    } finally {
      setSaving(false);
    }
  };

  /* ---- Device icon helper ---- */
  const getDeviceIcon = (device: DeviceItem) => {
    const name = (device.givenName || device.name).toLowerCase();
    if (name.includes('phone') || name.includes('iphone'))
      return <MobileOutlined />;
    if (name.includes('ipad') || name.includes('tablet'))
      return <TabletOutlined />;
    if (name.includes('server') || name.includes('nas'))
      return <DesktopOutlined />;
    if (name.includes('mac') || name.includes('laptop'))
      return <LaptopOutlined />;
    return <DesktopOutlined />;
  };

  const aclDeviceOptions = buildACLDeviceOptions(devices);

  /* ---- Option group builders ---- */
  const buildSourceGroups = (): ACLOptionGroup[] => {
    const groups: ACLOptionGroup[] = [];
    groups.push({
      label: t.acl.quickOptions,
      options: [{ key: 'all-star', label: <span>{t.acl.allStar}</span>, value: '*', selected: !!rule.sources?.includes('*') }],
    });
    groups.push({
      label: t.acl.autogroupsHeading,
      options: [
        { key: 'autogroup-member', label: (
          <span>
            <SafetyCertificateOutlined className="mr-2" />
            autogroup:member
          </span>
        ), value: 'autogroup:member', selected: !!rule.sources?.includes('autogroup:member') },
        { key: 'autogroup-tagged', label: (
          <span>
            <SafetyCertificateOutlined className="mr-2" />
            autogroup:tagged
          </span>
        ), value: 'autogroup:tagged', selected: !!rule.sources?.includes('autogroup:tagged') },
      ],
    });
    if (policy?.tagOwners && Object.keys(policy.tagOwners).length > 0) {
      groups.push({
        label: t.acl.tagsHeading,
        options: Object.keys(policy.tagOwners).map((tagName) => ({
          key: `tag-src-${tagName}`,
          label: (
            <span>
              <TagOutlined className="mr-2" />
              {tagName}
            </span>
          ),
          value: tagName,
          selected: !!rule.sources?.includes(tagName),
        })),
      });
    }
    if (Object.keys(aclGroups).length > 0) {
      groups.push({
        label: t.acl.aclGroupsHeading,
        options: Object.keys(aclGroups).map((groupName) => ({
          key: `group-src-${groupName}`,
          label: (
            <span>
              <TeamOutlined className="mr-2" />
              {groupName}
            </span>
          ),
          value: groupName,
          selected: !!rule.sources?.includes(groupName),
        })),
      });
    }
    if (headscaleUsers.length > 0) {
      groups.push({
        label: t.acl.headscaleUsersHeading,
        options: headscaleUsers.map((user) => ({
          key: `user-src-${user.name}`,
          label: (
            <span>
              <UserOutlined className="mr-2" />
              {user.name}
              @
            </span>
          ),
          value: `${user.name}@`,
          selected: !!rule.sources?.includes(`${user.name}@`),
        })),
      });
    }
    if (aclDeviceOptions.length > 0) {
      groups.push({
        label: t.acl.devicesHeading,
        options: aclDeviceOptions.map((device) => ({
          key: `device-src-${device.id}`,
          label: (
            <span>
              {getDeviceIcon(devices.find((d) => d.id === device.id) || { id: device.id, givenName: device.label, name: device.label, ipAddresses: [device.ipAddress] })}
              {' '}
              <span>{device.label}</span>
              {' '}
              <Text type="secondary" className="text-12px ml-2">{device.ipAddress}</Text>
            </span>
          ),
          value: device.sourceValue,
          selected: !!rule.sources?.includes(device.sourceValue),
        })),
      });
    }
    return groups;
  };

  const buildDestGroups = (): ACLOptionGroup[] => {
    const groups: ACLOptionGroup[] = [];
    groups.push({
      label: t.acl.quickOptions,
      options: [{ key: 'all-star-colon', label: <span>{t.acl.allStarColon}</span>, value: '*:*', selected: !!rule.destinations?.includes('*:*') }],
    });
    groups.push({
      label: t.acl.autogroupsHeading,
      options: [
        { key: 'autogroup-internet', label: (
          <span>
            <SafetyCertificateOutlined className="mr-2" />
            autogroup:internet:*
          </span>
        ), value: 'autogroup:internet:*', selected: !!rule.destinations?.includes('autogroup:internet:*') },
        { key: 'autogroup-self', label: (
          <span>
            <SafetyCertificateOutlined className="mr-2" />
            autogroup:self:*
          </span>
        ), value: 'autogroup:self:*', selected: !!rule.destinations?.includes('autogroup:self:*') },
      ],
    });
    if (policy?.tagOwners && Object.keys(policy.tagOwners).length > 0) {
      groups.push({
        label: t.acl.tagsHeading,
        options: Object.keys(policy.tagOwners).map((tagName) => ({
          key: `tag-dst-${tagName}`,
          label: (
            <span>
              <TagOutlined className="mr-2" />
              {tagName}
              :*
            </span>
          ),
          value: `${tagName}:*`,
          selected: !!rule.destinations?.includes(`${tagName}:*`),
        })),
      });
    }
    if (Object.keys(aclGroups).length > 0) {
      groups.push({
        label: t.acl.aclGroupsHeading,
        options: Object.keys(aclGroups).map((groupName) => ({
          key: `group-dst-${groupName}`,
          label: (
            <span>
              <TeamOutlined className="mr-2" />
              {groupName}
              :*
            </span>
          ),
          value: `${groupName}:*`,
          selected: !!rule.destinations?.includes(`${groupName}:*`),
        })),
      });
    }
    if (policy?.hosts && Object.keys(policy.hosts).length > 0) {
      groups.push({
        label: t.acl.hostAliasesHeading,
        options: Object.entries(policy.hosts).map(([hostName, ip]) => ({
          key: `host-dst-${hostName}`,
          label: (
            <span>
              <GlobalOutlined className="mr-2" />
              {hostName}
              :*
              <Text type="secondary" className="text-12px ml-2">{ip}</Text>
            </span>
          ),
          value: `${hostName}:*`,
          selected: !!rule.destinations?.includes(`${hostName}:*`),
        })),
      });
    }
    if (resources.length > 0) {
      groups.push({
        label: t.acl.resourcesHeading,
        options: resources.map((resource) => ({
          key: `resource-dst-${resource.id}`,
          label: (
            <span>
              <DatabaseOutlined className="mr-2" />
              {resource.name}
              :
              {resource.port || '*'}
              {' '}
              <Text type="secondary" className="text-12px ml-2">{resource.ip_address}</Text>
            </span>
          ),
          value: `${resource.name}:${resource.port || '*'}`,
          selected: !!rule.destinations?.includes(`${resource.name}:${resource.port || '*'}`),
        })),
      });
    }
    if (aclDeviceOptions.length > 0) {
      groups.push({
        label: t.acl.devicesHeading,
        options: aclDeviceOptions.map((device) => ({
          key: `device-dst-${device.id}`,
          label: (
            <span>
              {getDeviceIcon(devices.find((d) => d.id === device.id) || { id: device.id, givenName: device.label, name: device.label, ipAddresses: [device.ipAddress] })}
              {' '}
              <span>{device.label}</span>
              {' '}
              <Text type="secondary" className="text-12px ml-2">{device.ipAddress}</Text>
            </span>
          ),
          value: device.destinationValue,
          selected: !!rule.destinations?.includes(device.destinationValue),
        })),
      });
    }
    return groups;
  };

  const isEditMode = !!editingRule;

  return (
    <Modal
      open={open}
      title={isEditMode ? t.acl.editRuleTitle : t.acl.addRuleTitle}
      width={720}
      onCancel={onCancel}
      afterOpenChange={handleAfterOpenChange}
      footer={[
        <Button key="cancel" onClick={onCancel}>{t.common.actions.cancel}</Button>,
        <Button key="ok" type="primary" onClick={handleOk} loading={saving}>
          {isEditMode ? t.acl.saveChanges : t.acl.createRule}
        </Button>,
      ]}
    >
      <Text type="secondary" className="modal-desc">
        {isEditMode ? t.acl.editRuleDesc : t.acl.addRuleDesc}
      </Text>
      <Space direction="vertical" className="w-full" size={16}>
        <div>
          <Text className="field-label">{t.acl.ruleNameLabel}</Text>
          <Input
            placeholder={t.acl.ruleNamePlaceholder}
            value={rule.name}
            onChange={(e) => setRule((r) => ({ ...r, name: e.target.value }))}
          />
        </div>

        {/* Sources */}
        <div>
          <Text className="field-label">{t.acl.sourceLabel}</Text>
          <Text type="secondary" className="text-12px block mb-2">{t.acl.sourceDesc}</Text>
          <ACLTargetPicker groups={buildSourceGroups()} onSelect={addSource} searchPlaceholder={t.acl.searchPlaceholder}>
            <Button icon={<PlusOutlined />} block className="mb-2">{t.acl.selectSource}</Button>
          </ACLTargetPicker>
          <Space.Compact className="w-full mb-2">
            <Input
              placeholder={t.acl.customSourcePlaceholder}
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sourceInput)
                  addSource(sourceInput);
              }}
            />
            <Button onClick={() => sourceInput && addSource(sourceInput)}>{t.common.actions.add}</Button>
          </Space.Compact>
          <Space size={[4, 4]} wrap>
            {rule.sources?.map((src, idx) => (
              <Tag key={idx} color="blue" closable onClose={() => removeSource(src)}>{src}</Tag>
            ))}
          </Space>
        </div>

        {/* Destinations */}
        <div>
          <Text className="field-label">{t.acl.destinationLabel}</Text>
          <Text type="secondary" className="text-12px block mb-2">{t.acl.destinationDesc}</Text>
          <ACLTargetPicker groups={buildDestGroups()} onSelect={addDestination} searchPlaceholder={t.acl.searchPlaceholder}>
            <Button icon={<PlusOutlined />} block className="mb-2">{t.acl.selectDestination}</Button>
          </ACLTargetPicker>
          <Space.Compact className="w-full mb-2">
            <Input
              placeholder={t.acl.customDestPlaceholder}
              value={destInput}
              onChange={(e) => setDestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && destInput)
                  addDestination(destInput);
              }}
            />
            <Button onClick={() => destInput && addDestination(destInput)}>{t.common.actions.add}</Button>
          </Space.Compact>
          <Space size={[4, 4]} wrap>
            {rule.destinations?.map((dest, idx) => (
              <Tag key={idx} color="orange" closable onClose={() => removeDestination(dest)}>{dest}</Tag>
            ))}
          </Space>
        </div>

        {/* Action */}
        <div>
          <Text className="field-label">{t.acl.actionLabel}</Text>
          <Select
            value={rule.action}
            onChange={(value: ACLAction) => setRule((r) => ({ ...r, action: value }))}
            className="w-full"
            options={[
              { value: ACLAction.Accept, label: t.acl.actionAccept },
              { value: ACLAction.Deny, label: t.acl.actionDeny },
            ]}
          />
        </div>
      </Space>
    </Modal>
  );
}
