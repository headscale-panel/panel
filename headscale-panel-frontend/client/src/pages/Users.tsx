import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Edit,
  Key,
  Laptop,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Route,
  Search,
  Terminal,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  Wifi,
  WifiOff,
} from 'lucide-react';

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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { loadUsersPageData } from '@/lib/page-data';
import { cn } from '@/lib/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { devicesAPI, groupsAPI, systemUsersAPI, usersAPI } from '@/lib/api';
import type {
  NormalizedDevice,
  NormalizedGroup,
  NormalizedSystemUser,
  OIDCStatusData,
} from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

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

const selectionKey = (selection: TreeSelection) => {
  switch (selection.type) {
    case 'group':
      return `group:${selection.groupId}`;
    case 'user':
      return `user:${selection.userId}`;
    default:
      return selection.type;
  }
};

export default function UsersPage() {
  const t = useTranslation();
  const [, setLocation] = useLocation();

  const [users, setUsers] = useState<UserData[]>([]);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [aclGroups, setAclGroups] = useState<ACLGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<TreeSelection>({ type: 'all' });
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [ungroupedExpanded, setUngroupedExpanded] = useState(true);

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
      const { users, groups, aclPolicy, oidcStatus, onlineUsers, devices } = await loadUsersPageData();

      setUsers(users);
      setDevices(devices);
      setGroups(groups);
      setOidcStatus(oidcStatus);
      setAclGroups(
        Object.entries(aclPolicy?.groups || {}).map(([key, members]) => ({
          name: key.replace(/^group:/, ''),
          members,
        }))
      );
      setOnlineUsers(onlineUsers);
      setExpandedGroups((current) => {
        const next = new Set(current);
        groups.forEach((group) => next.add(group.ID));
        return next;
      });
    } catch (error: any) {
      toast.error(t.users.loadFailed + (error.message || t.common.errors.unknownError));
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

  const selectedTreeUserDevices = useMemo(() => {
    if (!selectedTreeUser) {
      return [];
    }

    const ownerNames = new Set(
      [selectedTreeUser.headscale_name, selectedTreeUser.username]
        .map((value) => value?.trim())
        .filter(Boolean)
        .map((value) => value!.toLowerCase())
    );

    return devices.filter((device) => {
      const owner = device.user?.name?.trim().toLowerCase();
      return owner ? ownerNames.has(owner) : false;
    });
  }, [devices, selectedTreeUser]);

  const getDevicesForUser = (user: UserData): DeviceData[] => {
    const ownerNames = new Set(
      [user.headscale_name, user.username]
        .map((v) => v?.trim())
        .filter(Boolean)
        .map((v) => v!.toLowerCase())
    );
    return devices.filter((d) => {
      const owner = d.user?.name?.trim().toLowerCase();
      return owner ? ownerNames.has(owner) : false;
    });
  };

  const toggleUserDevices = (userId: number) => {
    setExpandedUserDevices((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
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
      toast.error(oidcStatus.password_required ? t.users.requiredFields : t.users.requiredFieldsOidc);
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
      toast.success(t.users.createUserSuccess.replace('{username}', newUser.username));
      setCreateUserDialogOpen(false);
      setNewUser({ username: '', email: '', password: '', group_id: '', display_name: '' });
      loadData();
    } catch (error: any) {
      toast.error(t.users.createFailed + (error.message || t.common.errors.systemError));
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
      toast.success(t.users.updateUserSuccess);
      setEditUserDialogOpen(false);
      setSelectedUser(null);
      loadData();
    } catch (error: any) {
      toast.error(t.users.updateFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleDeleteUser = async (user: UserData) => {
    if (user.provider === 'oidc') {
      toast.error(t.users.oidcManagedDeleteBlocked);
      return;
    }

    if (!confirm(t.users.confirmDeleteUser.replace('{username}', user.username))) {
      return;
    }

    try {
      await systemUsersAPI.delete(user.ID);
      toast.success(t.users.deleteSuccess);
      if (selectedNode.type === 'user' && selectedNode.userId === user.ID) {
        setSelectedNode(selectedNode.groupId ? { type: 'group', groupId: selectedNode.groupId } : { type: 'all' });
      }
      loadData();
    } catch (error: any) {
      toast.error(t.users.deleteFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error(t.users.groupNameRequired);
      return;
    }

    try {
      await groupsAPI.create({ name: newGroupName.trim() });
      toast.success(t.users.createGroupSuccess);
      setCreateGroupDialogOpen(false);
      setNewGroupName('');
      loadData();
    } catch (error: any) {
      toast.error(t.users.createFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleEditGroup = (group: Group) => {
    setSelectedGroup(group);
    setEditGroupName(group.name);
    setEditGroupDialogOpen(true);
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroup || !editGroupName.trim()) {
      toast.error(t.users.groupNameRequired);
      return;
    }

    try {
      await groupsAPI.update({ id: selectedGroup.ID, name: editGroupName.trim() });
      toast.success(t.users.updateGroupSuccess);
      setEditGroupDialogOpen(false);
      setSelectedGroup(null);
      loadData();
    } catch (error: any) {
      toast.error(t.users.updateFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    const memberCount = getUsersByGroup(group).length;
    if (memberCount > 0) {
      toast.error(t.users.cannotDeleteGroup.replace('{count}', String(memberCount)));
      return;
    }

    if (!confirm(t.users.confirmDeleteGroup.replace('{name}', group.name))) {
      return;
    }

    try {
      await groupsAPI.delete(group.ID);
      toast.success(t.users.deleteSuccess);
      if (
        (selectedNode.type === 'group' && selectedNode.groupId === group.ID) ||
        (selectedNode.type === 'user' && selectedNode.groupId === group.ID)
      ) {
        setSelectedNode({ type: 'all' });
      }
      loadData();
    } catch (error: any) {
      toast.error(t.users.deleteFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleViewDevices = (user: UserData) => {
    setLocation(`/devices?user=${user.headscale_name || user.username}`);
  };

  const handleViewRoutes = (user: UserData) => {
    setLocation(`/routes?user=${user.headscale_name || user.username}`);
  };

  const handleCopyIP = async (ip: string) => {
    await navigator.clipboard.writeText(ip);
    toast.success(t.devices.ipCopied);
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
      toast.success(t.devices.renameSuccess);
      setRenameDeviceDialogOpen(false);
      setSelectedDevice(null);
      loadData();
    } catch (error: any) {
      toast.error(t.devices.renameFailed + (error.message || t.common.errors.unknownError));
    }
  };

  const handleDeleteDevice = async (device: DeviceData) => {
    if (!confirm(t.devices.confirmDelete.replace('{name}', device.given_name || device.name))) {
      return;
    }

    try {
      await devicesAPI.delete(device.id);
      toast.success(t.devices.deleteSuccess);
      loadData();
    } catch (error: any) {
      toast.error(t.devices.deleteFailed + (error.message ? `: ${error.message}` : ''));
    }
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
      toast.error(t.devices.selectUserFirst);
      return;
    }
    setAddDeviceDialogOpen(true);
  };

  const handleGenerateDeviceKey = async () => {
    const owner = selectedTreeUser?.headscale_name || selectedTreeUser?.username;
    if (!owner) {
      toast.error(t.devices.selectUserFirst);
      return;
    }

    try {
      const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res: any = await usersAPI.createPreAuthKey(owner, addDeviceReusable, addDeviceEphemeral, expiration);
      const key = res?.preAuthKey?.key || res?.key || res?.preauthkey?.key || '';
      if (!key) {
        toast.error(t.devices.keyGenerateFailed);
        return;
      }
      setGeneratedKey(key);
      toast.success(t.devices.keyGenerated);
    } catch (error: any) {
      toast.error(t.devices.keyGenerateFailed + (error.message ? `: ${error.message}` : ''));
    }
  };

  const handleRegisterDevice = async () => {
    const owner = selectedTreeUser?.headscale_name || selectedTreeUser?.username;
    if (!owner || !machineKey.trim()) {
      toast.error(t.devices.machineKeyRequired);
      return;
    }

    setRegisteringNode(true);
    try {
      await devicesAPI.registerNode(owner, machineKey.trim());
      toast.success(t.devices.registerNodeSuccess);
      setAddDeviceDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(t.devices.registerNodeFailed + (error.message ? `: ${error.message}` : ''));
    } finally {
      setRegisteringNode(false);
    }
  };

  const renderDeviceCard = (device: DeviceData, user: UserData) => (
    <div
      key={device.id}
      className="group/device flex items-center gap-3 rounded-lg border border-border/50 bg-background px-3 py-2.5 transition-colors hover:border-border hover:shadow-sm"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Monitor className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{device.given_name || device.name}</span>
          {device.online ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
              <Wifi className="h-3 w-3" />
              {t.common.status.online}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <WifiOff className="h-3 w-3" />
              {t.common.status.offline}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {device.ip_addresses.map((ip) => (
            <button
              key={ip}
              type="button"
              className="inline-flex items-center gap-1 rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              onClick={() => handleCopyIP(ip)}
            >
              {ip}
              <Copy className="h-2.5 w-2.5 opacity-0 group-hover/device:opacity-60" />
            </button>
          ))}
          {device.last_seen && (
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              {new Date(device.last_seen).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/device:opacity-100">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openRenameDeviceDialog(device)}>
              <Edit className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t.devices.renameDialogTitle}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleDeleteDevice(device)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t.common.actions.delete}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );

  const renderUserRow = (user: UserData, index: number) => {
    const userDevices = getDevicesForUser(user);
    const isDevicesExpanded = expandedUserDevices.has(user.ID);
    const isOnline = onlineUsers.has(user.headscale_name || user.username);

    return (
      <motion.div
        key={user.ID}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.2) }}
      >
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group/row">
          <button
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            onClick={() => toggleUserDevices(user.ID)}
          >
            {isDevicesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          <div className="relative shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                {(user.display_name || user.username).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-background',
                isOnline ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">{user.display_name || user.username}</span>
              <span
                className={cn(
                  'text-[11px] px-1.5 py-px rounded font-normal',
                  user.provider === 'oidc'
                    ? 'text-blue-600 bg-blue-500/8 dark:text-blue-400 dark:bg-blue-500/15'
                    : user.provider === 'headscale'
                      ? 'text-teal-600 bg-teal-500/8 dark:text-teal-400 dark:bg-teal-500/15'
                      : 'text-gray-500 bg-gray-500/8 dark:text-gray-400 dark:bg-gray-500/15'
                )}
              >
                {user.provider === 'oidc' ? 'OIDC' : user.provider === 'headscale' ? 'Headscale' : t.users.providerLocal}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                <Laptop className="inline h-3 w-3 mr-0.5 -mt-px" />
                {userDevices.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-px">{user.email || user.username}</p>
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openAddDeviceDialog(user)}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t.devices.addDevice}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleViewRoutes(user)}>
                  <Route className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t.users.viewRoutes}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleEditUser(user)}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t.users.editUser}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10 disabled:text-muted-foreground disabled:hover:bg-transparent"
                  onClick={() => handleDeleteUser(user)}
                  disabled={user.provider === 'oidc'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {user.provider === 'oidc' ? t.users.oidcManagedDeleteBlocked : t.users.deleteUser}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isDevicesExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 pt-0">
                <div className="ml-[52px] space-y-1.5">
                  {userDevices.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
                      {t.users.noDevices}
                    </div>
                  ) : (
                    userDevices.map((device) => renderDeviceCard(device, user))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const renderGroupBranch = (group: Group) => {
    const memberUsers = getUsersByGroup(group);
    const isExpanded = expandedGroups.has(group.ID);
    const isSelected = selectedNode.type === 'group' && selectedNode.groupId === group.ID;

    return (
      <div key={group.ID} className="rounded-xl border border-transparent hover:border-border/60 transition-colors">
        <div className="group/item relative">
          <button
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm',
              isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/60'
            )}
            onClick={() => selectNode({ type: 'group', groupId: group.ID })}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-background/80"
              onClick={(event) => {
                event.stopPropagation();
                toggleGroupExpanded(group.ID);
              }}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
            <UsersRound className="w-4 h-4 shrink-0 opacity-60" />
            <span className="flex-1 truncate">{group.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{memberUsers.length}</span>
          </button>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEditGroup(group);
                  }}
                >
                  <Edit className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t.common.actions.edit}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteGroup(group);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t.common.actions.delete}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pb-2 pr-2 pl-10 space-y-1">
                {memberUsers.map((user, index) => {
                  const isUserSelected = selectedNode.type === 'user' && selectedNode.userId === user.ID;
                  return (
                    <motion.button
                      key={user.ID}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, delay: index * 0.02 }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                        isUserSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => selectNode({ type: 'user', userId: user.ID, groupId: group.ID })}
                    >
                      <span
                        className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          onlineUsers.has(user.headscale_name || user.username) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                        )}
                      />
                      <span className="truncate">{user.display_name || user.username}</span>
                    </motion.button>
                  );
                })}
                {memberUsers.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">{t.users.noUsers}</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
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

  const rightPaneTitle =
    selectedNode.type === 'all'
      ? t.users.allUsers
      : selectedNode.type === 'ungrouped'
        ? t.users.ungroupedUsers
        : selectedNode.type === 'group'
          ? getGroupById(selectedNode.groupId)?.name || t.users.groups
          : selectedTreeUser?.display_name || selectedTreeUser?.username || t.users.userDevices;

  const rightPaneCount = selectedNode.type === 'user' ? 1 : filteredUsers.length;

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t.users.title}</h1>
              <p className="text-muted-foreground mt-1">{t.users.description}</p>
            </div>
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={loadData} disabled={loading}>
                    <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t.common.actions.refresh}</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    {t.users.new}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setCreateUserDialogOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    {t.users.newUser}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCreateGroupDialogOpen(true)}>
                    <UsersRound className="w-4 h-4 mr-2" />
                    {t.users.newGroup}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.users.totalUsers}</p>
                  <p className="text-2xl font-bold mt-1">{users.length}</p>
                </div>
                <Users className="h-8 w-8 opacity-80 text-blue-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.users.onlineUsers}</p>
                  <p className="text-2xl font-bold mt-1">{onlineCount}</p>
                </div>
                <UserCheck className="h-8 w-8 opacity-80 text-green-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.users.groups}</p>
                  <p className="text-2xl font-bold mt-1">{groups.length}</p>
                </div>
                <UsersRound className="h-8 w-8 opacity-80 text-violet-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.users.grouped}</p>
                  <p className="text-2xl font-bold mt-1">{users.filter((u) => aclGroups.some((g) => userMatchesAclGroup(u, g.name))).length}</p>
                </div>
                <UserPlus className="h-8 w-8 opacity-80 text-emerald-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.users.ungrouped}</p>
                  <p className="text-2xl font-bold mt-1">{ungroupedUsers.length}</p>
                </div>
                <User className="h-8 w-8 opacity-80 text-gray-500" />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-3">
              <Card className="p-0 overflow-hidden">
                <div className="flex min-h-[74px] items-center border-b border-border/60 px-5 py-3.5">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">{t.users.treeTitle}</h2>
                  </div>
                </div>
                <ScrollArea className="h-[calc(100vh-320px)]">
                  <div className="p-2 space-y-3">
                    <button
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm',
                        selectedNode.type === 'all' ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/60'
                      )}
                      onClick={() => selectNode({ type: 'all' })}
                    >
                      <Users className="w-4 h-4 shrink-0 opacity-60" />
                      <span className="flex-1 truncate">{t.users.allUsers}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{users.length}</span>
                    </button>

                    <div className="space-y-1">
                      <div className="px-3 pt-1 pb-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.users.groups}</p>
                      </div>
                      {groups.map(renderGroupBranch)}
                    </div>

                    <div className="space-y-1 rounded-xl border border-dashed border-border/60">
                      <button
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm',
                          selectedNode.type === 'ungrouped' ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/60'
                        )}
                        onClick={() => selectNode({ type: 'ungrouped' })}
                      >
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-background/80"
                          onClick={(event) => {
                            event.stopPropagation();
                            setUngroupedExpanded((current) => !current);
                          }}
                        >
                          {ungroupedExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                        <User className="w-4 h-4 shrink-0 opacity-60" />
                        <span className="flex-1 truncate">{t.users.ungroupedUsers}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{ungroupedUsers.length}</span>
                      </button>

                      <AnimatePresence initial={false}>
                        {ungroupedExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pb-2 pr-2 pl-10 space-y-1">
                              {ungroupedUsers.map((user, index) => {
                                const isSelected = selectedNode.type === 'user' && selectedNode.userId === user.ID && !selectedNode.groupId;
                                return (
                                  <motion.button
                                    key={user.ID}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.18, delay: index * 0.02 }}
                                    className={cn(
                                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                                    )}
                                    onClick={() => selectNode({ type: 'user', userId: user.ID })}
                                  >
                                    <span
                                      className={cn(
                                        'h-2.5 w-2.5 rounded-full',
                                        onlineUsers.has(user.headscale_name || user.username) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                                      )}
                                    />
                                    <span className="truncate">{user.display_name || user.username}</span>
                                  </motion.button>
                                );
                              })}
                              {ungroupedUsers.length === 0 && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">{t.users.noUsers}</div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </ScrollArea>
              </Card>
            </div>

            <div className="col-span-12 lg:col-span-9">
              <Card className="p-0 overflow-hidden">
                <div className="flex min-h-[74px] items-center justify-between border-b border-border/60 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">{rightPaneTitle}</h2>
                    <span className="text-base font-medium text-muted-foreground tabular-nums">{rightPaneCount}</span>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={t.users.searchPlaceholder}
                      className="h-10 rounded-xl border-border/70 pl-10 text-sm"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {selectedNode.type === 'user' && selectedTreeUser ? (
                    <motion.div
                      key={selectionKey(selectedNode)}
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -18 }}
                      transition={{ duration: 0.22 }}
                    >
                      <ScrollArea className="h-[calc(100vh-360px)]">
                        <div className="divide-y divide-border/40">
                          {renderUserRow(selectedTreeUser, 0)}
                        </div>
                      </ScrollArea>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={selectionKey(selectedNode)}
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -18 }}
                      transition={{ duration: 0.22 }}
                    >
                      <ScrollArea className="h-[calc(100vh-360px)]">
                        <div className="divide-y divide-border/40">
                          {filteredUsers.length === 0 ? (
                            <div className="p-12 text-center text-sm text-muted-foreground">
                              {searchQuery ? t.users.noSearchResult : t.users.noUsers}
                            </div>
                          ) : (
                            filteredUsers.map(renderUserRow)
                          )}
                        </div>
                      </ScrollArea>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </div>
          </div>

          <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  {t.users.createUserTitle}
                </DialogTitle>
                <DialogDescription>{oidcStatus.third_party ? t.users.createUserDescOidc : t.users.createUserDesc}</DialogDescription>
              </DialogHeader>
              {oidcStatus.oidc_enabled && (
                <div
                  className={cn(
                    'rounded-lg border px-4 py-3 text-sm',
                    oidcStatus.third_party
                      ? 'border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                      : 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                  )}
                >
                  {oidcStatus.third_party ? t.users.oidcModeHint : t.users.builtinOidcHint}
                </div>
              )}
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-username" className="text-right">
                    {t.users.usernameLabel}
                  </Label>
                  <Input
                    id="create-username"
                    value={newUser.username}
                    onChange={(event) => setNewUser({ ...newUser, username: event.target.value })}
                    className="col-span-3"
                    placeholder={t.users.usernamePlaceholder}
                  />
                </div>
                {oidcStatus.password_required && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="create-password" className="text-right">
                      {t.users.passwordLabel}
                    </Label>
                    <Input
                      id="create-password"
                      type="password"
                      value={newUser.password}
                      onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                      className="col-span-3"
                      placeholder={t.users.passwordPlaceholder}
                    />
                  </div>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-email" className="text-right">
                    {t.users.emailLabel}
                  </Label>
                  <Input
                    id="create-email"
                    type="email"
                    value={newUser.email}
                    onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="create-display-name" className="text-right">
                    {t.users.displayNameLabel}
                  </Label>
                  <Input
                    id="create-display-name"
                    value={newUser.display_name}
                    onChange={(event) => setNewUser({ ...newUser, display_name: event.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">{t.users.groupLabel}</Label>
                  <Select value={newUser.group_id || '__none__'} onValueChange={(value) => setNewUser({ ...newUser, group_id: value === '__none__' ? '' : value })}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={t.users.groupPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t.users.noGroup}</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.ID} value={String(group.ID)}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateUserDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleCreateUser}>{t.users.createUserBtn}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t.users.editUserTitle.replace('{username}', selectedUser?.username || '')}</DialogTitle>
                <DialogDescription>{t.users.editUserDesc}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-email" className="text-right">
                    {t.users.emailLabel}
                  </Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editUser.email}
                    onChange={(event) => setEditUser({ ...editUser, email: event.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-display-name" className="text-right">
                    {t.users.displayNameLabel}
                  </Label>
                  <Input
                    id="edit-display-name"
                    value={editUser.display_name}
                    onChange={(event) => setEditUser({ ...editUser, display_name: event.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-password" className="text-right">
                    {t.users.newPasswordLabel}
                  </Label>
                  <Input
                    id="edit-password"
                    type="password"
                    value={editUser.password}
                    onChange={(event) => setEditUser({ ...editUser, password: event.target.value })}
                    className="col-span-3"
                    placeholder={t.users.newPasswordPlaceholder}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">{t.users.groupLabel}</Label>
                  <Select value={editUser.group_id || '__none__'} onValueChange={(value) => setEditUser({ ...editUser, group_id: value === '__none__' ? '' : value })}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={t.users.groupPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t.users.noGroup}</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.ID} value={String(group.ID)}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleUpdateUser}>{t.users.saveChanges}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createGroupDialogOpen} onOpenChange={setCreateGroupDialogOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{t.users.createGroupTitle}</DialogTitle>
                <DialogDescription>{t.users.createGroupDesc}</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="new-group-name">{t.users.groupNameLabel}</Label>
                <Input
                  id="new-group-name"
                  className="mt-2"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder={t.users.groupNamePlaceholder}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateGroupDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleCreateGroup}>{t.common.actions.create}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={editGroupDialogOpen} onOpenChange={setEditGroupDialogOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{t.users.editGroupTitle}</DialogTitle>
                <DialogDescription>{t.users.editGroupDesc}</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="edit-group-name">{t.users.groupNameLabel}</Label>
                <Input
                  id="edit-group-name"
                  className="mt-2"
                  value={editGroupName}
                  onChange={(event) => setEditGroupName(event.target.value)}
                  placeholder={t.users.groupNamePlaceholder}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditGroupDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleUpdateGroup}>{t.users.saveChanges}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={renameDeviceDialogOpen} onOpenChange={setRenameDeviceDialogOpen}>
            <DialogContent className="sm:max-w-[460px]">
              <DialogHeader>
                <DialogTitle>{t.devices.renameDialogTitle}</DialogTitle>
                <DialogDescription>
                  {t.devices.renameDialogDesc.replace('{name}', selectedDevice?.name || '')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="user-device-name">{t.devices.newNameLabel}</Label>
                  <Input
                    id="user-device-name"
                    className="mt-2"
                    value={newDeviceName}
                    onChange={(event) => {
                      const value = event.target.value.toLowerCase();
                      setNewDeviceName(value);
                      if (value && !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
                        setDeviceNameError(t.devices.nameLowercaseError);
                      } else {
                        setDeviceNameError('');
                      }
                    }}
                  />
                  {deviceNameError && <p className="mt-2 text-sm text-destructive">{deviceNameError}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{t.devices.nameLowercaseHint}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRenameDeviceDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleRenameDevice} disabled={!!deviceNameError || !newDeviceName.trim()}>
                  {t.common.actions.save}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={addDeviceDialogOpen} onOpenChange={setAddDeviceDialogOpen}>
            <DialogContent className="sm:max-w-[720px]">
              <DialogHeader>
                <DialogTitle>{t.devices.addDeviceTitle}</DialogTitle>
                <DialogDescription>{t.devices.addDeviceDesc}</DialogDescription>
              </DialogHeader>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">{t.devices.selectUser}</span>
                  <span className="font-medium text-foreground">{selectedTreeUser?.display_name || selectedTreeUser?.username}</span>
                  <code className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {selectedTreeUser?.headscale_name || selectedTreeUser?.username}
                  </code>
                </div>
              </div>

              <Tabs value={addDeviceTab} onValueChange={(value) => { setAddDeviceTab(value); setGeneratedKey(''); setMachineKey(''); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preauth">
                    <Key className="mr-2 h-4 w-4" />
                    {t.devices.tabPreAuth}
                  </TabsTrigger>
                  <TabsTrigger value="machinekey">
                    <Terminal className="mr-2 h-4 w-4" />
                    {t.devices.tabMachineKey}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="preauth" className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
                    <div>
                      <Label>{t.devices.reusableKey}</Label>
                      <p className="text-xs text-muted-foreground">{t.devices.reusableKeyDesc}</p>
                    </div>
                    <Switch checked={addDeviceReusable} onCheckedChange={setAddDeviceReusable} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
                    <div>
                      <Label>{t.devices.ephemeralKey}</Label>
                      <p className="text-xs text-muted-foreground">{t.devices.ephemeralKeyDesc}</p>
                    </div>
                    <Switch checked={addDeviceEphemeral} onCheckedChange={setAddDeviceEphemeral} />
                  </div>

                  {!generatedKey ? (
                    <Button onClick={handleGenerateDeviceKey} className="w-full">
                      <Key className="mr-2 h-4 w-4" />
                      {t.devices.generateKey}
                    </Button>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-border/70 px-4 py-4">
                      <div className="flex items-center justify-between">
                        <Label>{t.devices.preAuthKey}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(generatedKey);
                            toast.success(t.devices.keyCopied);
                          }}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          {t.devices.copyCommand}
                        </Button>
                      </div>
                      <Input readOnly value={generatedKey} className="font-mono text-xs" />
                      <p className="text-xs text-muted-foreground">{t.devices.keyExpireHint}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="machinekey" className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="selected-user-machine-key">{t.devices.machineKeyLabel}</Label>
                    <Input
                      id="selected-user-machine-key"
                      className="mt-2 font-mono text-xs"
                      placeholder={t.devices.machineKeyPlaceholder}
                      value={machineKey}
                      onChange={(event) => setMachineKey(event.target.value)}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">{t.devices.machineKeyHint}</p>
                  </div>
                  <Button className="w-full" onClick={handleRegisterDevice} disabled={!machineKey.trim() || registeringNode}>
                    {registeringNode ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Terminal className="mr-2 h-4 w-4" />}
                    {t.devices.registerNode}
                  </Button>
                </TabsContent>
              </Tabs>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDeviceDialogOpen(false)}>
                  {t.common.actions.close}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
