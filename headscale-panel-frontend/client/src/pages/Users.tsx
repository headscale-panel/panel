import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import {
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DownOutlined,
  EditOutlined,
  KeyOutlined,
  LaptopOutlined,
  LoadingOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
  UsergroupAddOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Button,
  Card,
  Dropdown,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import { loadUsersPageData } from '@/lib/page-data';
import DashboardLayout from '@/components/DashboardLayout';
import { devicesAPI, groupsAPI, systemUsersAPI, usersAPI } from '@/lib/api';
import type {
  NormalizedDevice,
  NormalizedGroup,
  NormalizedSystemUser,
  OIDCStatusData,
} from '@/lib/normalizers';
import { normalizeDeviceListResponse } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Text, Title } = Typography;

interface ACLGroup {
  name: string;
  members: string[];
}

type Group = NormalizedGroup;
type UserData = NormalizedSystemUser;
type DeviceData = NormalizedDevice;

type TreeSelection =
  | { type: 'all' }
  | { type: 'ungrouped' }
  | { type: 'group'; groupId: number }
  | { type: 'user'; userId: number; groupId?: number };


export default function UsersPage() {
  const t = useTranslation();
  const [, setLocation] = useLocation();
  const { token } = theme.useToken();

  const [users, setUsers] = useState<UserData[]>([]);
  const [userDevicesByOwner, setUserDevicesByOwner] = useState<Record<string, DeviceData[]>>({});
  const [loadingDeviceOwners, setLoadingDeviceOwners] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<Group[]>([]);
  const [aclGroups, setAclGroups] = useState<ACLGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<TreeSelection>({ type: 'all' });
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [ungroupedExpanded, setUngroupedExpanded] = useState(false);

  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editGroupDialogOpen, setEditGroupDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [expandedUserDevices, setExpandedUserDevices] = useState<Set<number>>(new Set());
  const [renameDeviceDialogOpen, setRenameDeviceDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceData | null>(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [deviceNameError, setDeviceNameError] = useState('');
  const [addDeviceDialogOpen, setAddDeviceDialogOpen] = useState(false);
  const [addDeviceTab, setAddDeviceTab] = useState('preauth');
  const [addDeviceReusable, setAddDeviceReusable] = useState(false);
  const [addDeviceEphemeral, setAddDeviceEphemeral] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [machineKey, setMachineKey] = useState('');
  const [registeringNode, setRegisteringNode] = useState(false);

  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    group_id: '',
    display_name: '',
  });
  const [editUser, setEditUser] = useState({
    email: '',
    password: '',
    group_id: '',
    display_name: '',
  });
  const [newGroupName, setNewGroupName] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [oidcStatus, setOidcStatus] = useState<OIDCStatusData>({
    oidc_enabled: false,
    third_party: false,
    builtin: false,
    password_required: true,
    mode: 'direct',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { users, groups, aclPolicy, oidcStatus, onlineUsers } = await loadUsersPageData();

      setUsers(users);
      setGroups(groups);
      setOidcStatus(oidcStatus);
      setUserDevicesByOwner({});
      setLoadingDeviceOwners(new Set());
      setAclGroups(
        Object.entries(aclPolicy?.groups || {}).map(([key, members]) => ({
          name: key.replace(/^group:/, ''),
          members,
        }))
      );
      setOnlineUsers(onlineUsers);
    } catch (error: any) {
      message.error(t.users.loadFailed + (error.message || t.common.errors.unknownError));
    } finally {
      setLoading(false);
    }
  };

  const userMatchesAclGroup = (user: UserData, groupName: string): boolean => {
    const group = aclGroups.find((candidate) => candidate.name.toLowerCase() === groupName.toLowerCase());
    if (!group) {
      return false;
    }

    return group.members.some((pattern) => {
      if (pattern.endsWith('@')) {
        const prefix = pattern.slice(0, -1);
        const userEmail = user.email || '';
        const userHeadscaleName = user.headscale_name || user.username || '';
        return (
          userEmail.toLowerCase().startsWith(prefix.toLowerCase() + '@') ||
          userHeadscaleName.toLowerCase() === prefix.toLowerCase() ||
          userEmail.toLowerCase().split('@')[0] === prefix.toLowerCase()
        );
      }

      return (user.email || '').toLowerCase() === pattern.toLowerCase();
    });
  };

  const getUsersByGroup = (group: Group): UserData[] =>
    users.filter((user) => userMatchesAclGroup(user, group.name.toLowerCase()));

  const ungroupedUsers = useMemo(
    () => users.filter((user) => !aclGroups.some((group) => userMatchesAclGroup(user, group.name))),
    [aclGroups, users]
  );

  const getUserById = (userId?: number) => users.find((user) => user.ID === userId) || null;
  const getGroupById = (groupId?: number) => groups.find((group) => group.ID === groupId) || null;

  const selectedGroupUsers = useMemo(() => {
    switch (selectedNode.type) {
      case 'all':
        return users;
      case 'ungrouped':
        return ungroupedUsers;
      case 'group': {
        const group = getGroupById(selectedNode.groupId);
        return group ? getUsersByGroup(group) : [];
      }
      default:
        return [];
    }
  }, [selectedNode, users, ungroupedUsers, groups]);

  const selectedTreeUser = useMemo(
    () => (selectedNode.type === 'user' ? getUserById(selectedNode.userId) : null),
    [selectedNode, users]
  );

  const getUserOwnerKey = (user: UserData | null | undefined) =>
    (user?.headscale_name || user?.username || '').trim().toLowerCase();

  const getDevicesForUser = (user: UserData | null | undefined): DeviceData[] => {
    const ownerKey = getUserOwnerKey(user);
    return ownerKey ? userDevicesByOwner[ownerKey] || [] : [];
  };

  const ensureUserDevicesLoaded = async (user: UserData, force = false) => {
    const owner = (user.headscale_name || user.username || '').trim();
    const ownerKey = owner.toLowerCase();
    if (!owner || (!force && (ownerKey in userDevicesByOwner || loadingDeviceOwners.has(ownerKey)))) {
      return;
    }

    setLoadingDeviceOwners((current) => {
      const next = new Set(current);
      next.add(ownerKey);
      return next;
    });

    try {
      const devicesRes = await devicesAPI.list({ page: 1, pageSize: 1000, userId: owner });
      const { list } = normalizeDeviceListResponse(devicesRes);
      setUserDevicesByOwner((current) => ({ ...current, [ownerKey]: list }));
    } catch (error: any) {
      message.error(t.devices.loadFailed + (error.message ? `: ${error.message}` : ''));
    } finally {
      setLoadingDeviceOwners((current) => {
        const next = new Set(current);
        next.delete(ownerKey);
        return next;
      });
    }
  };

  const selectedTreeUserDevices = useMemo(
    () => getDevicesForUser(selectedTreeUser),
    [selectedTreeUser, userDevicesByOwner]
  );

  const toggleUserDevices = (user: UserData) => {
    const userId = user.ID;
    setExpandedUserDevices((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
        void ensureUserDevicesLoaded(user);
      }
      return next;
    });
  };

  const selectNode = (node: TreeSelection) => {
    setSelectedNode(node);
    if (node.type === 'user') {
      setExpandedUserDevices((current) => {
        const next = new Set(current);
        next.add(node.userId);
        return next;
      });
    }
  };

  useEffect(() => {
    if (selectedTreeUser) {
      void ensureUserDevicesLoaded(selectedTreeUser);
    }
  }, [selectedTreeUser]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return selectedGroupUsers;
    }

    return selectedGroupUsers.filter((user) => {
      return (
        user.username.toLowerCase().includes(q) ||
        (user.email && user.email.toLowerCase().includes(q)) ||
        (user.display_name && user.display_name.toLowerCase().includes(q)) ||
        (user.headscale_name && user.headscale_name.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedGroupUsers]);

  const filteredDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return selectedTreeUserDevices;
    }

    return selectedTreeUserDevices.filter((device) => {
      return (
        device.name.toLowerCase().includes(q) ||
        (device.given_name && device.given_name.toLowerCase().includes(q)) ||
        device.ip_addresses.some((ip) => ip.toLowerCase().includes(q)) ||
        (device.user?.name && device.user.name.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedTreeUserDevices]);

  const shouldSuggestOIDCMigration = (user: UserData) =>
    oidcStatus.mode === 'builtin_oidc' && user.provider !== 'oidc';

  const onlineCount = users.filter((user) => onlineUsers.has(user.headscale_name || user.username)).length;

  const toggleGroupExpanded = (groupId: number) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleCreateUser = async () => {
    if (!newUser.username || (oidcStatus.password_required && !newUser.password)) {
      message.error(oidcStatus.password_required ? t.users.requiredFields : t.users.requiredFieldsOidc);
      return;
    }

    try {
      await systemUsersAPI.create({
        username: newUser.username,
        password: newUser.password,
        email: newUser.email,
        group_id: newUser.group_id ? parseInt(newUser.group_id, 10) : undefined,
        display_name: newUser.display_name,
        headscale_name: newUser.username,
      });
      message.success(t.users.createUserSuccess.replace('{username}', newUser.username));
      setCreateUserDialogOpen(false);
      setNewUser({ username: '', email: '', password: '', group_id: '', display_name: '' });
      loadData();
    } catch (error: any) {
      message.error(t.users.createFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleEditUser = (user: UserData) => {
    setSelectedUser(user);
    setEditUser({
      email: user.email || '',
      password: '',
      group_id: user.group_id?.toString() || '',
      display_name: user.display_name || '',
    });
    setEditUserDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) {
      return;
    }

    try {
      await systemUsersAPI.update({
        id: selectedUser.ID,
        email: editUser.email,
        group_id: editUser.group_id ? parseInt(editUser.group_id, 10) : undefined,
        display_name: editUser.display_name,
        password: editUser.password || undefined,
      });
      message.success(t.users.updateUserSuccess);
      setEditUserDialogOpen(false);
      setSelectedUser(null);
      loadData();
    } catch (error: any) {
      message.error(t.users.updateFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleDeleteUser = (user: UserData) => {
    if (user.provider === 'oidc') {
      message.error(t.users.oidcManagedDeleteBlocked);
      return;
    }

    Modal.confirm({
      title: t.users.confirmDeleteUser.replace('{username}', user.username),
      okText: t.common.actions.delete,
      okButtonProps: { danger: true },
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await systemUsersAPI.delete(user.ID);
          message.success(t.users.deleteSuccess);
          if (selectedNode.type === 'user' && selectedNode.userId === user.ID) {
            setSelectedNode(selectedNode.groupId ? { type: 'group', groupId: selectedNode.groupId } : { type: 'all' });
          }
          loadData();
        } catch (error: any) {
          message.error(t.users.deleteFailed + (error.message || t.common.errors.systemError));
        }
      },
    });
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      message.error(t.users.groupNameRequired);
      return;
    }

    try {
      await groupsAPI.create({ name: newGroupName.trim() });
      message.success(t.users.createGroupSuccess);
      setCreateGroupDialogOpen(false);
      setNewGroupName('');
      loadData();
    } catch (error: any) {
      message.error(t.users.createFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleEditGroup = (group: Group) => {
    setSelectedGroup(group);
    setEditGroupName(group.name);
    setEditGroupDialogOpen(true);
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroup || !editGroupName.trim()) {
      message.error(t.users.groupNameRequired);
      return;
    }

    try {
      await groupsAPI.update({ id: selectedGroup.ID, name: editGroupName.trim() });
      message.success(t.users.updateGroupSuccess);
      setEditGroupDialogOpen(false);
      setSelectedGroup(null);
      loadData();
    } catch (error: any) {
      message.error(t.users.updateFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleDeleteGroup = (group: Group) => {
    const memberCount = getUsersByGroup(group).length;
    if (memberCount > 0) {
      message.error(t.users.cannotDeleteGroup.replace('{count}', String(memberCount)));
      return;
    }

    Modal.confirm({
      title: t.users.confirmDeleteGroup.replace('{name}', group.name),
      okText: t.common.actions.delete,
      okButtonProps: { danger: true },
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await groupsAPI.delete(group.ID);
          message.success(t.users.deleteSuccess);
          if (
            (selectedNode.type === 'group' && selectedNode.groupId === group.ID) ||
            (selectedNode.type === 'user' && selectedNode.groupId === group.ID)
          ) {
            setSelectedNode({ type: 'all' });
          }
          loadData();
        } catch (error: any) {
          message.error(t.users.deleteFailed + (error.message || t.common.errors.systemError));
        }
      },
    });
  };

  const handleViewDevices = (user: UserData) => {
    selectNode({ type: 'user', userId: user.ID });
  };

  const handleViewRoutes = (user: UserData) => {
    setLocation(`/routes?user=${user.headscale_name || user.username}`);
  };

  const handleCopyIP = async (ip: string) => {
    await navigator.clipboard.writeText(ip);
    message.success(t.devices.ipCopied);
  };

  const openRenameDeviceDialog = (device: DeviceData) => {
    setSelectedDevice(device);
    setNewDeviceName((device.given_name || device.name).toLowerCase());
    setDeviceNameError('');
    setRenameDeviceDialogOpen(true);
  };

  const handleRenameDevice = async () => {
    if (!selectedDevice || !newDeviceName.trim()) {
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(newDeviceName.trim())) {
      setDeviceNameError(t.devices.nameLowercaseError);
      return;
    }

    try {
      await devicesAPI.rename(selectedDevice.id, newDeviceName.trim());
      message.success(t.devices.renameSuccess);
      setRenameDeviceDialogOpen(false);
      setSelectedDevice(null);
      loadData();
    } catch (error: any) {
      message.error(t.devices.renameFailed + (error.message || t.common.errors.unknownError));
    }
  };

  const handleDeleteDevice = (device: DeviceData) => {
    Modal.confirm({
      title: t.devices.confirmDelete.replace('{name}', device.given_name || device.name),
      okText: t.common.actions.delete,
      okButtonProps: { danger: true },
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await devicesAPI.delete(device.id);
          message.success(t.devices.deleteSuccess);
          loadData();
        } catch (error: any) {
          message.error(t.devices.deleteFailed + (error.message ? `: ${error.message}` : ''));
        }
      },
    });
  };

  const openAddDeviceDialog = (user?: UserData | null) => {
    const headscaleName = user?.headscale_name || user?.username || '';
    setAddDeviceTab('preauth');
    setAddDeviceReusable(false);
    setAddDeviceEphemeral(false);
    setGeneratedKey('');
    setMachineKey('');
    setRegisteringNode(false);
    setSelectedUser(user || null);
    if (!headscaleName) {
      message.error(t.devices.selectUserFirst);
      return;
    }
    setAddDeviceDialogOpen(true);
  };

  const handleGenerateDeviceKey = async () => {
    const owner = selectedTreeUser?.headscale_name || selectedTreeUser?.username;
    if (!owner) {
      message.error(t.devices.selectUserFirst);
      return;
    }

    try {
      const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res: any = await usersAPI.createPreAuthKey(owner, addDeviceReusable, addDeviceEphemeral, expiration);
      const key = res?.preAuthKey?.key || res?.key || res?.preauthkey?.key || '';
      if (!key) {
        message.error(t.devices.keyGenerateFailed);
        return;
      }
      setGeneratedKey(key);
      message.success(t.devices.keyGenerated);
    } catch (error: any) {
      message.error(t.devices.keyGenerateFailed + (error.message ? `: ${error.message}` : ''));
    }
  };

  const handleRegisterDevice = async () => {
    const owner = selectedTreeUser?.headscale_name || selectedTreeUser?.username;
    if (!owner || !machineKey.trim()) {
      message.error(t.devices.machineKeyRequired);
      return;
    }

    setRegisteringNode(true);
    try {
      await devicesAPI.registerNode(owner, machineKey.trim());
      message.success(t.devices.registerNodeSuccess);
      setAddDeviceDialogOpen(false);
      loadData();
    } catch (error: any) {
      message.error(t.devices.registerNodeFailed + (error.message ? `: ${error.message}` : ''));
    } finally {
      setRegisteringNode(false);
    }
  };

  const renderDeviceCard = (device: DeviceData, user: UserData) => (
    <div
      key={device.id}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        borderRadius: token.borderRadius, border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer, padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: token.colorBgLayout, flexShrink: 0 }}>
        <DesktopOutlined style={{ color: token.colorTextSecondary }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text strong style={{ fontSize: 13 }}>{device.given_name || device.name}</Text>
          {device.online ? (
            <Tag color="success" style={{ margin: 0, fontSize: 11 }}><WifiOutlined /> {t.common.status.online}</Tag>
          ) : (
            <Tag style={{ margin: 0, fontSize: 11 }}>{t.common.status.offline}</Tag>
          )}
        </div>
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {device.ip_addresses.map((ip) => (
            <Tag
              key={ip}
              style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, margin: 0 }}
              onClick={() => handleCopyIP(ip)}
            >
              {ip} <CopyOutlined style={{ fontSize: 10 }} />
            </Tag>
          ))}
          {device.last_seen && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              <ClockCircleOutlined style={{ marginRight: 4, fontSize: 10 }} />
              {new Date(device.last_seen).toLocaleDateString()}
            </Text>
          )}
        </div>
      </div>
      <Space size={4}>
        <Tooltip title={t.devices.renameDialogTitle}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRenameDeviceDialog(device)} />
        </Tooltip>
        <Tooltip title={t.common.actions.delete}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteDevice(device)} />
        </Tooltip>
      </Space>
    </div>
  );

  const renderUserRow = (user: UserData, index: number) => {
    const userDevices = getDevicesForUser(user);
    const isDevicesExpanded = expandedUserDevices.has(user.ID);
    const isOnline = onlineUsers.has(user.headscale_name || user.username);
    const isUserDevicesLoading = loadingDeviceOwners.has(getUserOwnerKey(user));

    return (
      <div key={user.ID}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <Button
            type="text"
            size="small"
            style={{ width: 20, height: 20, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            icon={isDevicesExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
            onClick={() => toggleUserDevices(user)}
          />

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar size={36} style={{ background: token.colorBgLayout, color: token.colorTextSecondary, fontSize: 12 }}>
              {(user.display_name || user.username).slice(0, 2).toUpperCase()}
            </Avatar>
            <span
              style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 12, height: 12, borderRadius: '50%',
                border: `2px solid ${token.colorBgContainer}`,
                background: isOnline ? '#52c41a' : token.colorBorderSecondary,
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: 13 }}>{user.display_name || user.username}</Text>
              <Tag
                color={user.provider === 'oidc' ? 'blue' : user.provider === 'headscale' ? 'cyan' : undefined}
                style={{ margin: 0, fontSize: 11 }}
              >
                {user.provider === 'oidc' ? 'OIDC' : user.provider === 'headscale' ? 'Headscale' : t.users.providerLocal}
              </Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>
                <LaptopOutlined style={{ marginRight: 2 }} />
                {isUserDevicesLoading && userDevices.length === 0 ? '...' : userDevices.length}
              </Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{user.email || user.username}</Text>
          </div>

          <Space size={4}>
            <Tooltip title={t.devices.addDevice}>
              <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => openAddDeviceDialog(user)} />
            </Tooltip>
            <Tooltip title={t.users.viewRoutes}>
              <Button type="text" size="small" icon={<NodeIndexOutlined />} onClick={() => handleViewRoutes(user)} />
            </Tooltip>
            <Tooltip title={t.users.editUser}>
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditUser(user)} />
            </Tooltip>
            <Tooltip title={user.provider === 'oidc' ? t.users.oidcManagedDeleteBlocked : t.users.deleteUser}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteUser(user)} disabled={user.provider === 'oidc'} />
            </Tooltip>
          </Space>
        </div>

        {isDevicesExpanded && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ marginLeft: 52 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                {isUserDevicesLoading && userDevices.length === 0 ? (
                  <div style={{ border: `1px dashed ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '12px 16px', textAlign: 'center' }}>
                    <Spin size="small" />
                  </div>
                ) : userDevices.length === 0 ? (
                  <div style={{ border: `1px dashed ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '12px 16px', textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t.users.noDevices}</Text>
                  </div>
                ) : (
                  userDevices.map((device) => renderDeviceCard(device, user))
                )}
              </Space>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGroupBranch = (group: Group) => {
    const memberUsers = getUsersByGroup(group);
    const isExpanded = expandedGroups.has(group.ID);
    const isSelected = selectedNode.type === 'group' && selectedNode.groupId === group.ID;

    return (
      <div key={group.ID}>
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: token.borderRadius, cursor: 'pointer',
              background: isSelected ? token.colorPrimaryBg : 'transparent',
              color: isSelected ? token.colorPrimaryText : token.colorText,
              fontWeight: isSelected ? 500 : 400, fontSize: 13,
            }}
            onClick={() => selectNode({ type: 'group', groupId: group.ID })}
          >
            <span
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}
              onClick={(e) => { e.stopPropagation(); toggleGroupExpanded(group.ID); }}
            >
              {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
            </span>
            <TeamOutlined style={{ opacity: 0.6 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{memberUsers.length}</Text>
            <Space size={2} style={{ marginLeft: 4 }}>
              <Tooltip title={t.common.actions.edit}>
                <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 12 }} />} onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }} style={{ width: 22, height: 22, padding: 0 }} />
              </Tooltip>
              <Tooltip title={t.common.actions.delete}>
                <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />} onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }} style={{ width: 22, height: 22, padding: 0 }} />
              </Tooltip>
            </Space>
          </div>
        </div>

        {isExpanded && (
          <div style={{ paddingBottom: 8, paddingRight: 8, paddingLeft: 40 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              {memberUsers.map((user) => {
                const isUserSelected = selectedNode.type === 'user' && selectedNode.userId === user.ID;
                return (
                  <div
                    key={user.ID}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      borderRadius: token.borderRadius, cursor: 'pointer', fontSize: 13,
                      background: isUserSelected ? token.colorPrimaryBg : 'transparent',
                      color: isUserSelected ? token.colorPrimaryText : token.colorTextSecondary,
                    }}
                    onClick={() => selectNode({ type: 'user', userId: user.ID, groupId: group.ID })}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: onlineUsers.has(user.headscale_name || user.username) ? '#52c41a' : token.colorBorderSecondary,
                    }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.display_name || user.username}</span>
                  </div>
                );
              })}
              {memberUsers.length === 0 && (
                <Text type="secondary" style={{ padding: '8px 12px', fontSize: 12 }}>{t.users.noUsers}</Text>
              )}
            </Space>
          </div>
        )}
      </div>
    );
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

  const rightPaneTitle =
    selectedNode.type === 'all'
      ? t.users.allUsers
      : selectedNode.type === 'ungrouped'
        ? t.users.ungroupedUsers
        : selectedNode.type === 'group'
          ? getGroupById(selectedNode.groupId)?.name || t.users.groups
          : selectedTreeUser?.display_name || selectedTreeUser?.username || t.users.userDevices;

  const selectedUserDevicesLoading =
    selectedNode.type === 'user' && selectedTreeUser
      ? loadingDeviceOwners.has(getUserOwnerKey(selectedTreeUser)) && filteredDevices.length === 0
      : false;

  const rightPaneCount = selectedNode.type === 'user'
    ? selectedUserDevicesLoading
      ? '...'
      : filteredDevices.length
    : filteredUsers.length;

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{t.users.title}</Title>
            <Text type="secondary">{t.users.description}</Text>
          </div>
          <Space>
            <Tooltip title={t.common.actions.refresh}>
              <Button icon={<ReloadOutlined spin={loading} />} onClick={loadData} disabled={loading} />
            </Tooltip>
            <Dropdown
              menu={{
                items: [
                  { key: 'user', icon: <UserAddOutlined />, label: t.users.newUser, onClick: () => setCreateUserDialogOpen(true) },
                  { key: 'group', icon: <UsergroupAddOutlined />, label: t.users.newGroup, onClick: () => setCreateGroupDialogOpen(true) },
                ],
              }}
            >
              <Button type="primary" icon={<PlusOutlined />}>{t.users.new}</Button>
            </Dropdown>
          </Space>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            { label: t.users.totalUsers, value: users.length, icon: <TeamOutlined style={{ fontSize: 28, color: '#1677ff' }} /> },
            { label: t.users.onlineUsers, value: onlineCount, icon: <WifiOutlined style={{ fontSize: 28, color: '#52c41a' }} /> },
            { label: t.users.groups, value: groups.length, icon: <UsergroupAddOutlined style={{ fontSize: 28, color: '#722ed1' }} /> },
            { label: t.users.grouped, value: users.filter((u) => aclGroups.some((g) => userMatchesAclGroup(u, g.name))).length, icon: <UserAddOutlined style={{ fontSize: 28, color: '#52c41a' }} /> },
            { label: t.users.ungrouped, value: ungroupedUsers.length, icon: <UserOutlined style={{ fontSize: 28, color: token.colorTextSecondary }} /> },
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

        {/* Two-panel layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          {/* Left: Tree sidebar */}
          <Card styles={{ body: { padding: 0 } }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Text strong style={{ fontSize: 15 }}>{t.users.treeTitle}</Text>
            </div>
            <div style={{ height: 'calc(100vh - 320px)', overflow: 'auto', padding: 8 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {/* All Users */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: token.borderRadius, cursor: 'pointer', fontSize: 13,
                    background: selectedNode.type === 'all' ? token.colorPrimaryBg : 'transparent',
                    color: selectedNode.type === 'all' ? token.colorPrimaryText : token.colorText,
                    fontWeight: selectedNode.type === 'all' ? 500 : 400,
                  }}
                  onClick={() => selectNode({ type: 'all' })}
                >
                  <TeamOutlined style={{ opacity: 0.6 }} />
                  <span style={{ flex: 1 }}>{t.users.allUsers}</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>{users.length}</Text>
                </div>

                {/* Groups Section */}
                <div>
                  <div style={{ padding: '4px 12px 8px' }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{t.users.groups}</Text>
                  </div>
                  <Space direction="vertical" style={{ width: '100%' }} size={4}>
                    {groups.map(renderGroupBranch)}
                  </Space>
                </div>

                {/* Ungrouped */}
                <div style={{ border: `1px dashed ${token.colorBorderSecondary}`, borderRadius: token.borderRadius }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: token.borderRadius, cursor: 'pointer', fontSize: 13,
                      background: selectedNode.type === 'ungrouped' ? token.colorPrimaryBg : 'transparent',
                      color: selectedNode.type === 'ungrouped' ? token.colorPrimaryText : token.colorText,
                      fontWeight: selectedNode.type === 'ungrouped' ? 500 : 400,
                    }}
                    onClick={() => selectNode({ type: 'ungrouped' })}
                  >
                    <span
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}
                      onClick={(e) => { e.stopPropagation(); setUngroupedExpanded(v => !v); }}
                    >
                      {ungroupedExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                    </span>
                    <UserOutlined style={{ opacity: 0.6 }} />
                    <span style={{ flex: 1 }}>{t.users.ungroupedUsers}</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>{ungroupedUsers.length}</Text>
                  </div>

                  {ungroupedExpanded && (
                    <div style={{ paddingBottom: 8, paddingRight: 8, paddingLeft: 40 }}>
                      <Space direction="vertical" style={{ width: '100%' }} size={4}>
                        {ungroupedUsers.map((user) => {
                          const isSelected = selectedNode.type === 'user' && selectedNode.userId === user.ID && !selectedNode.groupId;
                          return (
                            <div
                              key={user.ID}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                                borderRadius: token.borderRadius, cursor: 'pointer', fontSize: 13,
                                background: isSelected ? token.colorPrimaryBg : 'transparent',
                                color: isSelected ? token.colorPrimaryText : token.colorTextSecondary,
                              }}
                              onClick={() => selectNode({ type: 'user', userId: user.ID })}
                            >
                              <span style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: onlineUsers.has(user.headscale_name || user.username) ? '#52c41a' : token.colorBorderSecondary,
                              }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.display_name || user.username}</span>
                            </div>
                          );
                        })}
                        {ungroupedUsers.length === 0 && (
                          <Text type="secondary" style={{ padding: '8px 12px', fontSize: 12 }}>{t.users.noUsers}</Text>
                        )}
                      </Space>
                    </div>
                  )}
                </div>
              </Space>
            </div>
          </Card>

          {/* Right: User list */}
          <Card styles={{ body: { padding: 0 } }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Space>
                <Text strong style={{ fontSize: 15 }}>{rightPaneTitle}</Text>
                <Text type="secondary">{rightPaneCount}</Text>
              </Space>
              <Input
                prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
                placeholder={selectedNode.type === 'user' ? t.devices.searchPlaceholder : t.users.searchPlaceholder}
                style={{ width: 256 }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
              />
            </div>

            <div style={{ height: 'calc(100vh - 360px)', overflow: 'auto' }}>
              {selectedNode.type === 'user' && selectedTreeUser ? (
                <div>{renderUserRow(selectedTreeUser, 0)}</div>
              ) : (
                <div>
                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {searchQuery ? t.users.noSearchResult : t.users.noUsers}
                      </Text>
                    </div>
                  ) : (
                    filteredUsers.map(renderUserRow)
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Create User Modal */}
        <Modal
          open={createUserDialogOpen}
          title={<span><UserAddOutlined style={{ marginRight: 8 }} />{t.users.createUserTitle}</span>}
          onCancel={() => setCreateUserDialogOpen(false)}
          onOk={handleCreateUser}
          okText={t.users.createUserBtn}
          cancelText={t.common.actions.cancel}
          width={500}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {oidcStatus.third_party ? t.users.createUserDescOidc : t.users.createUserDesc}
          </Text>
          {oidcStatus.oidc_enabled && (
            <div style={{
              borderRadius: token.borderRadius, padding: '12px 16px', marginBottom: 16, fontSize: 13,
              background: oidcStatus.third_party ? token.colorInfoBg : token.colorWarningBg,
              border: `1px solid ${oidcStatus.third_party ? token.colorInfoBorder : token.colorWarningBorder}`,
            }}>
              {oidcStatus.third_party ? t.users.oidcModeHint : t.users.builtinOidcHint}
            </div>
          )}
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.usernameLabel}</Text>
              <Input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} placeholder={t.users.usernamePlaceholder} />
            </div>
            {oidcStatus.password_required && (
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
                <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.passwordLabel}</Text>
                <Input.Password value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder={t.users.passwordPlaceholder} />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.emailLabel}</Text>
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.displayNameLabel}</Text>
              <Input value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.groupLabel}</Text>
              <Select
                value={newUser.group_id || undefined}
                onChange={(value) => setNewUser({ ...newUser, group_id: value || '' })}
                placeholder={t.users.groupPlaceholder}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: '', label: t.users.noGroup },
                  ...groups.map(g => ({ value: String(g.ID), label: g.name })),
                ]}
              />
            </div>
          </Space>
        </Modal>

        {/* Edit User Modal */}
        <Modal
          open={editUserDialogOpen}
          title={t.users.editUserTitle.replace('{username}', selectedUser?.username || '')}
          onCancel={() => setEditUserDialogOpen(false)}
          onOk={handleUpdateUser}
          okText={t.users.saveChanges}
          cancelText={t.common.actions.cancel}
          width={500}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{t.users.editUserDesc}</Text>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.emailLabel}</Text>
              <Input type="email" value={editUser.email} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.displayNameLabel}</Text>
              <Input value={editUser.display_name} onChange={(e) => setEditUser({ ...editUser, display_name: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.newPasswordLabel}</Text>
              <Input.Password value={editUser.password} onChange={(e) => setEditUser({ ...editUser, password: e.target.value })} placeholder={t.users.newPasswordPlaceholder} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <Text style={{ textAlign: 'right', fontSize: 13 }}>{t.users.groupLabel}</Text>
              <Select
                value={editUser.group_id || undefined}
                onChange={(value) => setEditUser({ ...editUser, group_id: value || '' })}
                placeholder={t.users.groupPlaceholder}
                allowClear
                style={{ width: '100%' }}
                options={[
                  { value: '', label: t.users.noGroup },
                  ...groups.map(g => ({ value: String(g.ID), label: g.name })),
                ]}
              />
            </div>
          </Space>
        </Modal>

        {/* Create Group Modal */}
        <Modal
          open={createGroupDialogOpen}
          title={t.users.createGroupTitle}
          onCancel={() => setCreateGroupDialogOpen(false)}
          onOk={handleCreateGroup}
          okText={t.common.actions.create}
          cancelText={t.common.actions.cancel}
          width={420}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{t.users.createGroupDesc}</Text>
          <div>
            <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.users.groupNameLabel}</Text>
            <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder={t.users.groupNamePlaceholder} />
          </div>
        </Modal>

        {/* Edit Group Modal */}
        <Modal
          open={editGroupDialogOpen}
          title={t.users.editGroupTitle}
          onCancel={() => setEditGroupDialogOpen(false)}
          onOk={handleUpdateGroup}
          okText={t.users.saveChanges}
          cancelText={t.common.actions.cancel}
          width={420}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{t.users.editGroupDesc}</Text>
          <div>
            <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.users.groupNameLabel}</Text>
            <Input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} placeholder={t.users.groupNamePlaceholder} />
          </div>
        </Modal>

        {/* Rename Device Modal */}
        <Modal
          open={renameDeviceDialogOpen}
          title={t.devices.renameDialogTitle}
          onCancel={() => setRenameDeviceDialogOpen(false)}
          onOk={handleRenameDevice}
          okText={t.common.actions.save}
          cancelText={t.common.actions.cancel}
          okButtonProps={{ disabled: !!deviceNameError || !newDeviceName.trim() }}
          width={460}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t.devices.renameDialogDesc.replace('{name}', selectedDevice?.name || '')}
          </Text>
          <div>
            <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.devices.newNameLabel}</Text>
            <Input
              value={newDeviceName}
              onChange={(e) => {
                const value = e.target.value.toLowerCase();
                setNewDeviceName(value);
                if (value && !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
                  setDeviceNameError(t.devices.nameLowercaseError);
                } else {
                  setDeviceNameError('');
                }
              }}
              status={deviceNameError ? 'error' : undefined}
            />
            {deviceNameError && <Text type="danger" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{deviceNameError}</Text>}
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{t.devices.nameLowercaseHint}</Text>
          </div>
        </Modal>

        {/* Add Device Modal */}
        <Modal
          open={addDeviceDialogOpen}
          title={t.devices.addDeviceTitle}
          onCancel={() => setAddDeviceDialogOpen(false)}
          footer={<Button onClick={() => setAddDeviceDialogOpen(false)}>{t.common.actions.close}</Button>}
          width={720}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{t.devices.addDeviceDesc}</Text>
          <div style={{ background: token.colorBgLayout, borderRadius: token.borderRadius, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
            <Space wrap>
              <Text type="secondary">{t.devices.selectUser}</Text>
              <Text strong>{selectedTreeUser?.display_name || selectedTreeUser?.username}</Text>
              <Text code style={{ fontSize: 12 }}>{selectedTreeUser?.headscale_name || selectedTreeUser?.username}</Text>
            </Space>
          </div>

          <Tabs
            activeKey={addDeviceTab}
            onChange={(key) => { setAddDeviceTab(key); setGeneratedKey(''); setMachineKey(''); }}
            items={[
              {
                key: 'preauth',
                label: <span><KeyOutlined style={{ marginRight: 8 }} />{t.devices.tabPreAuth}</span>,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '12px 16px' }}>
                      <div>
                        <Text style={{ fontSize: 13 }}>{t.devices.reusableKey}</Text>
                        <div><Text type="secondary" style={{ fontSize: 12 }}>{t.devices.reusableKeyDesc}</Text></div>
                      </div>
                      <Switch checked={addDeviceReusable} onChange={setAddDeviceReusable} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '12px 16px' }}>
                      <div>
                        <Text style={{ fontSize: 13 }}>{t.devices.ephemeralKey}</Text>
                        <div><Text type="secondary" style={{ fontSize: 12 }}>{t.devices.ephemeralKeyDesc}</Text></div>
                      </div>
                      <Switch checked={addDeviceEphemeral} onChange={setAddDeviceEphemeral} />
                    </div>

                    {!generatedKey ? (
                      <Button block icon={<KeyOutlined />} onClick={handleGenerateDeviceKey}>{t.devices.generateKey}</Button>
                    ) : (
                      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ fontSize: 13 }}>{t.devices.preAuthKey}</Text>
                          <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(generatedKey); message.success(t.devices.keyCopied); }}>
                            {t.devices.copyCommand}
                          </Button>
                        </div>
                        <Input readOnly value={generatedKey} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                        <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>{t.devices.keyExpireHint}</Text>
                      </div>
                    )}
                  </Space>
                ),
              },
              {
                key: 'machinekey',
                label: <span><DesktopOutlined style={{ marginRight: 8 }} />{t.devices.tabMachineKey}</span>,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <div>
                      <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.devices.machineKeyLabel}</Text>
                      <Input
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                        placeholder={t.devices.machineKeyPlaceholder}
                        value={machineKey}
                        onChange={(e) => setMachineKey(e.target.value)}
                      />
                      <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{t.devices.machineKeyHint}</Text>
                    </div>
                    <Button block type="primary" onClick={handleRegisterDevice} disabled={!machineKey.trim()} loading={registeringNode} icon={<DesktopOutlined />}>
                      {t.devices.registerNode}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Modal>
      </div>
    </DashboardLayout>
  );
}
