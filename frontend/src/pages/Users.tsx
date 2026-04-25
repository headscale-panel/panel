import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DownOutlined,
  EditOutlined,
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
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import { loadUsersPageData } from '@/lib/page-data';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { aclAPI, devicesAPI, usersAPI } from '@/lib/api';
import type {
  ACLPolicy,
  NormalizedDevice,
  NormalizedHeadscaleUser,
} from '@/lib/normalizers';
import { normalizeDeviceListResponse } from '@/lib/normalizers';
import { UserProvider } from '@/lib/enums';
import { useTranslation } from '@/i18n/index';
import { useRequest } from 'ahooks';
import CreateUserModal from '@/components/users/CreateUserModal';
import EditUserModal from '@/components/users/EditUserModal';
import CreateGroupModal from '@/components/users/CreateGroupModal';
import EditGroupModal from '@/components/users/EditGroupModal';
import RenameDeviceModal from '@/components/shared/RenameDeviceModal';
import AddDeviceModal from '@/components/users/AddDeviceModal';

const { Text, Title } = Typography;

interface ACLGroup {
  name: string;
  members: string[];
}

type Group = ACLGroup;
type UserData = NormalizedHeadscaleUser;
type DeviceData = NormalizedDevice;

type TreeSelection =
  | { type: 'all' }
  | { type: 'ungrouped' }
  | { type: 'group'; groupName: string }
  | { type: 'user'; userId: number; groupName?: string };


export default function UsersPage() {
  const t = useTranslation();
  const [, setLocation] = useLocation();
  const { token } = theme.useToken();

  const [hsUsers, setHsUsers] = useState<UserData[]>([]);
  const [userDevicesByOwner, setUserDevicesByOwner] = useState<Record<string, DeviceData[]>>({});
  const [loadingDeviceOwners, setLoadingDeviceOwners] = useState<Set<string>>(new Set());
  const [aclGroups, setAclGroups] = useState<ACLGroup[]>([]);
  const [aclPolicy, setAclPolicy] = useState<ACLPolicy | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<TreeSelection>({ type: 'all' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
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
  const [addDeviceDialogOpen, setAddDeviceDialogOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const { loading, refreshAsync } = useRequest(
    async () => loadUsersPageData(),
    {
      onSuccess: ({ hsUsers, aclPolicy, onlineUsers }) => {
        setHsUsers(hsUsers);
        setAclPolicy(aclPolicy);
        setUserDevicesByOwner({});
        setLoadingDeviceOwners(new Set());
        setAclGroups(
          Object.entries(aclPolicy?.groups || {}).map(([key, members]) => ({
            name: key.replace(/^group:/, ''),
            members,
          }))
        );
        setOnlineUsers(onlineUsers);
      },
      onError: (error: any) => {
        message.error(t.users.loadFailed + (error.message || t.common.errors.unknownError));
      },
    },
  );

  const loadData = useCallback(async () => {
    await refreshAsync();
  }, [refreshAsync]);

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
    hsUsers.filter((user) => userMatchesAclGroup(user, group.name.toLowerCase()));

  const ungroupedUsers = useMemo(
    () => hsUsers.filter((user) => !aclGroups.some((group) => userMatchesAclGroup(user, group.name))),
    [aclGroups, hsUsers]
  );

  const getUserById = (userId?: number) => hsUsers.find((user) => user.ID === userId) || null;
  const groups = aclGroups;
  const getGroupByName = (groupName?: string) =>
    groups.find((group) => group.name === groupName) || null;

  const selectedGroupUsers = useMemo(() => {
    switch (selectedNode.type) {
      case 'all':
        return hsUsers;
      case 'ungrouped':
        return ungroupedUsers;
      case 'group': {
        const group = getGroupByName(selectedNode.groupName);
        return group ? getUsersByGroup(group) : [];
      }
      default:
        return [];
    }
  }, [selectedNode, hsUsers, ungroupedUsers, groups]);

  const selectedTreeUser = useMemo(
    () => (selectedNode.type === 'user' ? getUserById(selectedNode.userId) : null),
    [selectedNode, hsUsers]
  );

  const getGroupMemberToken = (username: string) => `${username.trim()}@`;

  const buildPolicyWithGroups = (nextGroups: ACLGroup[]): ACLPolicy => {
    const groupsRecord = nextGroups.reduce<Record<string, string[]>>((record, group) => {
      record[`group:${group.name}`] = group.members;
      return record;
    }, {});

    return {
      ...(aclPolicy || {}),
      groups: groupsRecord,
    };
  };

  const saveACLGroups = async (nextGroups: ACLGroup[]) => {
    await aclAPI.updatePolicy(buildPolicyWithGroups(nextGroups));
  };

  const getPrimaryGroupNameForUser = (user: UserData | null | undefined) => {
    if (!user) return undefined;
    return aclGroups.find((group) => userMatchesAclGroup(user, group.name))?.name;
  };

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
      const devicesRes = await devicesAPI.list({ all: true, userId: owner });
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

  const onlineCount = hsUsers.filter((user) => onlineUsers.has(user.headscale_name || user.username)).length;

  const toggleGroupExpanded = (groupName: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const handleCreateHeadscaleUser = useCallback(
    async ({ username, groupName }: { username: string; groupName?: string }) => {
      await usersAPI.create(username);
      if (!groupName) {
        return;
      }

      const memberToken = getGroupMemberToken(username);
      const nextGroups = aclGroups.map((group) =>
        group.name === groupName
          ? {
              ...group,
              members: Array.from(new Set([...group.members, memberToken])),
            }
          : group,
      );
      await saveACLGroups(nextGroups);
    },
    [aclGroups, aclPolicy],
  );

  const handleUpdateHeadscaleUser = useCallback(
    async ({ oldName, newName, groupName }: { oldName: string; newName: string; groupName?: string }) => {
      if (oldName !== newName) {
        await usersAPI.rename(oldName, newName);
      }

      const oldToken = getGroupMemberToken(oldName);
      const newToken = getGroupMemberToken(newName);
      const nextGroups = aclGroups.map((group) => {
        const filteredMembers = group.members.filter((member) => member !== oldToken && member !== newToken);
        if (group.name !== groupName) {
          return { ...group, members: filteredMembers };
        }
        return {
          ...group,
          members: Array.from(new Set([...filteredMembers, newToken])),
        };
      });

      await saveACLGroups(nextGroups);
    },
    [aclGroups, aclPolicy],
  );

  const handleEditUser = (user: UserData) => {
    setSelectedUser(user);
    setEditUserDialogOpen(true);
  };

  const handleDeleteUser = (user: UserData) => {
    Modal.confirm({
      title: t.users.confirmDeleteUser.replace('{username}', user.headscale_name || user.username),
      okText: t.common.actions.delete,
      okButtonProps: { danger: true },
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await usersAPI.delete(user.headscale_name || user.username);
          const memberToken = getGroupMemberToken(user.headscale_name || user.username);
          const nextGroups = aclGroups.map((group) => ({
            ...group,
            members: group.members.filter((member) => member !== memberToken),
          }));
          await saveACLGroups(nextGroups);
          message.success(t.users.deleteSuccess);
          if (selectedNode.type === 'user' && selectedNode.userId === user.ID) {
            setSelectedNode(selectedNode.groupName ? { type: 'group', groupName: selectedNode.groupName } : { type: 'all' });
          }
          loadData();
        } catch (error: any) {
          message.error(t.users.deleteFailed + (error.message || t.common.errors.systemError));
        }
      },
    });
  };

  const handleEditGroup = (group: Group) => {
    setSelectedGroup(group);
    setEditGroupDialogOpen(true);
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
          const nextGroups = aclGroups.filter((candidate) => candidate.name !== group.name);
          await saveACLGroups(nextGroups);
          message.success(t.users.deleteSuccess);
          if (
            (selectedNode.type === 'group' && selectedNode.groupName === group.name) ||
            (selectedNode.type === 'user' && selectedNode.groupName === group.name)
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

  const handleCreateGroup = useCallback(
    async (name: string) => {
      if (aclGroups.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(t.users.groupExists);
      }
      await saveACLGroups([...aclGroups, { name, members: [] }]);
    },
    [aclGroups, aclPolicy, t.users.groupExists],
  );

  const handleRenameGroup = useCallback(
    async (nextName: string) => {
      if (!selectedGroup) return;
      if (
        aclGroups.some(
          (group) =>
            group.name !== selectedGroup.name &&
            group.name.toLowerCase() === nextName.toLowerCase(),
        )
      ) {
        throw new Error(t.users.groupExists);
      }
      const nextGroups = aclGroups.map((group) =>
        group.name === selectedGroup.name ? { ...group, name: nextName } : group,
      );
      await saveACLGroups(nextGroups);
    },
    [aclGroups, aclPolicy, selectedGroup, t.users.groupExists],
  );

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
    setRenameDeviceDialogOpen(true);
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

  const openAddDeviceDialog = () => setAddDeviceDialogOpen(true);

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
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Text strong className="text-13px">{device.given_name || device.name}</Text>
          {device.online ? (
            <Tag color="success" className="m-0 text-11px"><WifiOutlined /> {t.common.status.online}</Tag>
          ) : (
            <Tag className="m-0 text-11px">{t.common.status.offline}</Tag>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {device.ip_addresses.map((ip) => (
            <Tag
              key={ip}
              className="cursor-pointer font-mono text-11px m-0"
              onClick={() => handleCopyIP(ip)}
            >
              {ip} <CopyOutlined className="text-10px" />
            </Tag>
          ))}
          {device.last_seen && (
            <Text type="secondary" className="text-11px">
              <ClockCircleOutlined className="mr-1 text-10px" />
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
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            type="text"
            size="small"
            className="w-5 h-5 p-0 flex items-center justify-center"
            icon={isDevicesExpanded ? <DownOutlined /> : <RightOutlined className="text-10px text-10px" />}
            onClick={() => toggleUserDevices(user)}
          />

          <div className="relative flex-shrink-0">
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

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Text strong className="text-13px">{user.display_name || user.username}</Text>
              <Tag
                color={user.provider === UserProvider.OIDC ? 'blue' : user.provider === UserProvider.Headscale ? 'cyan' : undefined}
                className="m-0 text-11px"
              >
                {user.provider === UserProvider.OIDC ? 'OIDC' : user.provider === UserProvider.Headscale ? 'Headscale' : t.users.providerLocal}
              </Tag>
              <Text type="secondary" className="text-11px">
                <LaptopOutlined className="mr-0.5" />
                {isUserDevicesLoading && userDevices.length === 0 ? '...' : userDevices.length}
              </Text>
            </div>
            <Text type="secondary" className="text-12px">{user.email || user.username}</Text>
          </div>

          <Space size={4}>
            <Tooltip title={t.users.viewRoutes}>
              <Button type="text" size="small" icon={<NodeIndexOutlined />} onClick={() => handleViewRoutes(user)} />
            </Tooltip>
            <Tooltip title={t.users.editUser}>
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditUser(user)} />
            </Tooltip>
            <Tooltip title={t.users.deleteUser}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteUser(user)} />
            </Tooltip>
          </Space>
        </div>

        {isDevicesExpanded && (
          <div className="px-4 pb-3">
            <div className="ml-13">
              <Space direction="vertical" className="w-full" size={6}>
                {isUserDevicesLoading && userDevices.length === 0 ? (
                  <div style={{ border: `1px dashed ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '12px 16px', textAlign: 'center' }}>
                    <Spin size="small" />
                  </div>
                ) : userDevices.length === 0 ? (
                  <div style={{ border: `1px dashed ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '12px 16px', textAlign: 'center' }}>
                    <Text type="secondary" className="text-12px">{t.users.noDevices}</Text>
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
    const isExpanded = expandedGroups.has(group.name);
    const isSelected = selectedNode.type === 'group' && selectedNode.groupName === group.name;

    return (
      <div key={group.name}>
        <div className="relative">
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: token.borderRadius, cursor: 'pointer',
              background: isSelected ? token.colorPrimaryBg : 'transparent',
              color: isSelected ? token.colorPrimaryText : token.colorText,
              fontWeight: isSelected ? 500 : 400, fontSize: 13,
            }}
            onClick={() => selectNode({ type: 'group', groupName: group.name })}
          >
            <span
              className="w-5 h-5 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); toggleGroupExpanded(group.name); }}
            >
              {isExpanded ? <DownOutlined /> : <RightOutlined className="text-10px text-10px" />}
            </span>
            <TeamOutlined className="opacity-60" />
            <span className="flex-1 truncate">{group.name}</span>
            <Text type="secondary" className="text-12px">{memberUsers.length}</Text>
            <Space size={2}>
              <Tooltip title={t.common.actions.edit}>
                <Button
                  type="text"
                  size="small"
                  style={{ width: 22, height: 22, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                  icon={<EditOutlined className="text-12px" />}
                  onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }}
                />
              </Tooltip>
              <Tooltip title={t.common.actions.delete}>
                <Button
                  type="text"
                  size="small"
                  danger
                  style={{ width: 22, height: 22, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                  icon={<DeleteOutlined className="text-12px" />}
                  onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }}
                />
              </Tooltip>
            </Space>
          </div>
        </div>

        {isExpanded && (
          <div className="pb-2 pr-2 pl-10">
            <Space direction="vertical" className="w-full" size={4}>
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
                    onClick={() => selectNode({ type: 'user', userId: user.ID, groupName: group.name })}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: onlineUsers.has(user.headscale_name || user.username) ? '#52c41a' : token.colorBorderSecondary,
                    }} />
                    <span className="truncate">{user.display_name || user.username}</span>
                  </div>
                );
              })}
              {memberUsers.length === 0 && (
                <Text type="secondary" className="px-3 py-2 text-12px">{t.users.noUsers}</Text>
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
        <div className="centered-loading">
          <Spin indicator={<LoadingOutlined className="text-32px" />} />
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
          ? getGroupByName(selectedNode.groupName)?.name || t.users.groups
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
      <div className="app-page-stack-tight">
        <div className="page-header-row">
          <div>
            <Title level={4} className="page-title">{t.users.title}</Title>
            <Text type="secondary">{t.users.description}</Text>
          </div>
          <Space data-tour-id="users-actions">
            <Tooltip title={t.common.actions.refresh}>
              <Button icon={<ReloadOutlined spin={loading} />} onClick={loadData} disabled={loading} />
            </Tooltip>
            <Button icon={<DesktopOutlined />} onClick={openAddDeviceDialog}>{t.devices.addDevice}</Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'user', icon: <UserAddOutlined />, label: t.users.newUser, onClick: () => setCreateUserDialogOpen(true) },
                  { key: 'group', icon: <UsergroupAddOutlined />, label: t.users.newGroup, onClick: () => setCreateGroupDialogOpen(true) },
                ],
              }}
            >
              <Button type="primary" icon={<PlusOutlined />} data-tour-id="users-create">{t.users.new}</Button>
            </Dropdown>
          </Space>
        </div>

        {/* Stats */}
        <PageHeaderStatCards
          gap={16}
          items={[
            { label: t.users.totalUsers, value: hsUsers.length, icon: <TeamOutlined className="stat-icon-primary" />, watermark: 'ALL' },
            { label: t.users.onlineUsers, value: onlineCount, icon: <WifiOutlined className="stat-icon-success" />, watermark: 'ON' },
            { label: t.users.groups, value: groups.length, icon: <UsergroupAddOutlined className="stat-icon-accent" />, watermark: 'GRP' },
            { label: t.users.grouped, value: hsUsers.filter((u) => aclGroups.some((g) => userMatchesAclGroup(u, g.name))).length, icon: <UserAddOutlined className="stat-icon-success" />, watermark: 'MAP' },
            { label: t.users.ungrouped, value: ungroupedUsers.length, icon: <UserOutlined className="text-28px" style={{ color: token.colorTextSecondary }} />, watermark: 'RAW' },
          ]}
        />

        {/* Two-panel layout */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '280px 1fr' }}>
          {/* Left: Tree sidebar */}
          <Card data-tour-id="users-tree" styles={{ body: { padding: 0 } }}>
            <div className="flex items-center px-5 py-3.5" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Text strong className="text-15px">{t.users.treeTitle}</Text>
            </div>
            <div className="p-2 overflow-auto" style={{ height: 'calc(100vh - 320px)' }}>
              <Space direction="vertical" className="w-full" size={12}>
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
                  <TeamOutlined className="opacity-60" />
                  <span className="flex-1">{t.users.allUsers}</span>
                  <Text type="secondary" className="text-12px">{hsUsers.length}</Text>
                </div>

                {/* Groups Section */}
                <div>
                  <div className="px-3 py-1">
                    <Text type="secondary" className="text-11px uppercase tracking-wide">{t.users.groups}</Text>
                  </div>
                  <Space direction="vertical" className="w-full" size={4}>
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
                      className="w-5 h-5 flex items-center justify-center"
                      onClick={(e) => { e.stopPropagation(); setUngroupedExpanded(v => !v); }}
                    >
                      {ungroupedExpanded ? <DownOutlined /> : <RightOutlined className="text-10px text-10px" />}
                    </span>
                    <UserOutlined className="opacity-60" />
                    <span className="flex-1">{t.users.ungroupedUsers}</span>
                    <Text type="secondary" className="text-12px">{ungroupedUsers.length}</Text>
                  </div>

                  {ungroupedExpanded && (
                    <div className="pb-2 pr-2 pl-10">
                      <Space direction="vertical" className="w-full" size={4}>
                        {ungroupedUsers.map((user) => {
                          const isSelected = selectedNode.type === 'user' && selectedNode.userId === user.ID && !selectedNode.groupName;
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
                              <span className="truncate">{user.display_name || user.username}</span>
                            </div>
                          );
                        })}
                        {ungroupedUsers.length === 0 && (
                          <Text type="secondary" className="px-3 py-2 text-12px">{t.users.noUsers}</Text>
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
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Space>
                <Text strong className="text-15px">{rightPaneTitle}</Text>
                <Text type="secondary">{rightPaneCount}</Text>
              </Space>
              <Input
                prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
                placeholder={selectedNode.type === 'user' ? t.devices.searchPlaceholder : t.users.searchPlaceholder}
                className="w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
              />
            </div>

            <div className="overflow-auto" style={{ height: 'calc(100vh - 360px)' }}>
              {selectedNode.type === 'user' && selectedTreeUser ? (
                <div>{renderUserRow(selectedTreeUser, 0)}</div>
              ) : (
                <div>
                  {filteredUsers.length === 0 ? (
                    <Empty
                      className="empty-state-box"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={searchQuery ? t.users.noSearchResult : t.users.noUsers}
                    />
                  ) : (
                    filteredUsers.map(renderUserRow)
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        <CreateUserModal
          open={createUserDialogOpen}
          groups={groups}
          onCancel={() => setCreateUserDialogOpen(false)}
          onSuccess={loadData}
          onCreate={handleCreateHeadscaleUser}
        />

        <EditUserModal
          open={editUserDialogOpen}
          user={selectedUser}
          groups={groups}
          currentGroupName={getPrimaryGroupNameForUser(selectedUser)}
          onCancel={() => { setEditUserDialogOpen(false); setSelectedUser(null); }}
          onSuccess={loadData}
          onSave={handleUpdateHeadscaleUser}
        />

        <CreateGroupModal
          open={createGroupDialogOpen}
          onCancel={() => setCreateGroupDialogOpen(false)}
          onSuccess={loadData}
          onCreate={handleCreateGroup}
        />

        <EditGroupModal
          open={editGroupDialogOpen}
          group={selectedGroup}
          onCancel={() => { setEditGroupDialogOpen(false); setSelectedGroup(null); }}
          onSuccess={loadData}
          onSave={handleRenameGroup}
        />

        <RenameDeviceModal
          open={renameDeviceDialogOpen}
          device={selectedDevice}
          onCancel={() => { setRenameDeviceDialogOpen(false); setSelectedDevice(null); }}
          onSuccess={loadData}
        />

        <AddDeviceModal
          open={addDeviceDialogOpen}
          hsUsers={hsUsers}
          onCancel={() => setAddDeviceDialogOpen(false)}
          onSuccess={loadData}
        />
      </div>
    </DashboardLayout>
  );
}
