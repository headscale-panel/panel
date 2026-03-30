import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  Edit,
  Laptop,
  Loader2,
  Plus,
  RefreshCw,
  Route,
  Search,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
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
import { systemUsersAPI, groupsAPI } from '@/lib/api';
import type {
  NormalizedGroup,
  NormalizedSystemUser,
  OIDCStatusData,
} from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

// ACL Group from policy
interface ACLGroup {
  name: string; // e.g., "admin" (without "group:" prefix)
  members: string[]; // email patterns like "user@", "user@example.com"
}

type Group = NormalizedGroup;
type UserData = NormalizedSystemUser;

export default function UsersPage() {
  const t = useTranslation();
  const [, setLocation] = useLocation();
  const [users, setUsers] = useState<UserData[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [aclGroups, setAclGroups] = useState<ACLGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedGroupId, setSelectedGroupId] = useState<number | 'all' | 'ungrouped'>('all');
  
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editGroupDialogOpen, setEditGroupDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  
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
      setAclGroups(
        Object.entries(aclPolicy?.groups || {}).map(([key, members]) => ({
          name: key.replace(/^group:/, ''),
          members,
        }))
      );
      setOnlineUsers(onlineUsers);
      
    } catch (error: any) {
      toast.error(t.users.loadFailed + (error.message || t.common.errors.unknownError));
    } finally {
      setLoading(false);
    }
  };

  // Get users belonging to a database group (matched by ACL groups)
  const getUsersByGroup = (group: Group): UserData[] => {
    // Try to find matching ACL group by name (e.g., database "company" -> ACL "company")
    const aclGroupName = group.name.toLowerCase();
    
    return users.filter(user => {
      // Check if user matches the ACL group pattern
      return userMatchesAclGroup(user, aclGroupName);
    });
  };

  // Match user to ACL group based on email/username
  const userMatchesAclGroup = (user: UserData, groupName: string): boolean => {
    // Case-insensitive match
    const group = aclGroups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
    if (!group) {
      return false;
    }
    
    const matches = group.members.some(pattern => {
      // Pattern like "user@" (prefix match) or "user@example.com" (exact match)
      if (pattern.endsWith('@')) {
        // Prefix match - e.g., "cxl@" matches user with headscale_name="cxl"
        const prefix = pattern.slice(0, -1);
        const userEmail = user.email || '';
        const userHeadscaleName = user.headscale_name || user.username || '';
        const matched = (
          userEmail.toLowerCase().startsWith(prefix.toLowerCase() + '@') ||
          userHeadscaleName.toLowerCase() === prefix.toLowerCase() ||
          userEmail.toLowerCase().split('@')[0] === prefix.toLowerCase()
        );
        return matched;
      } else {
        // Full email match
        const userEmail = user.email || '';
        const matched = userEmail.toLowerCase() === pattern.toLowerCase();
        return matched;
      }
    });
    
    return matches;
  };

  // Get users not in any ACL group
  const getUngroupedUsers = (): UserData[] => {
    return users.filter(user => !aclGroups.some(g => userMatchesAclGroup(user, g.name)));
  };

  // Filtered users based on selection
  const filteredUsers = users.filter((user) => {
    // First apply search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = (
        user.username.toLowerCase().includes(q) ||
        (user.email && user.email.toLowerCase().includes(q)) ||
        (user.display_name && user.display_name.toLowerCase().includes(q)) ||
        (user.headscale_name && user.headscale_name.toLowerCase().includes(q))
      );
      if (!matchesSearch) return false;
    }
    
    // Filter by group selection
    if (selectedGroupId === 'ungrouped') {
      // Show users not in any ACL group
      return !aclGroups.some(g => userMatchesAclGroup(user, g.name));
    } else if (selectedGroupId === 'all') {
      // Show all users
      return true;
    } else if (typeof selectedGroupId === 'number') {
      // Database group ID - match by ACL group name
      const group = groups.find(g => g.ID === selectedGroupId);
      if (!group) return false;
      return userMatchesAclGroup(user, group.name.toLowerCase());
    }
    return false;
  });

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
        group_id: newUser.group_id ? parseInt(newUser.group_id) : undefined,
        display_name: newUser.display_name,
        headscale_name: newUser.username,
      });
      toast.success(t.users.createUserSuccess.replace('{username}', newUser.username));
      setCreateUserDialogOpen(false);
      setNewUser({ username: '', email: '', password: '', group_id: '', display_name: '' });
      loadData();
    } catch (error: any) {
      console.error(error);
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
    if (!selectedUser) return;

    try {
      await systemUsersAPI.update({
        id: selectedUser.ID,
        email: editUser.email,
        group_id: editUser.group_id ? parseInt(editUser.group_id) : undefined,
        display_name: editUser.display_name,
        password: editUser.password || undefined,
      });
      toast.success(t.users.updateUserSuccess);
      setEditUserDialogOpen(false);
      setSelectedUser(null);
      loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(t.users.updateFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleDeleteUser = async (user: UserData) => {
    if (user.provider === 'oidc') {
      toast.error(t.users.oidcManagedDeleteBlocked);
      return;
    }

    if (confirm(t.users.confirmDeleteUser.replace('{username}', user.username))) {
      try {
        await systemUsersAPI.delete(user.ID);
        toast.success(t.users.deleteSuccess);
        loadData();
      } catch (error: any) {
        console.error(error);
        toast.error(t.users.deleteFailed + (error.message || t.common.errors.systemError));
      }
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
      console.error(error);
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
      await groupsAPI.update({
        id: selectedGroup.ID,
        name: editGroupName.trim(),
      });
      toast.success(t.users.updateGroupSuccess);
      setEditGroupDialogOpen(false);
      setSelectedGroup(null);
      loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(t.users.updateFailed + (error.message || t.common.errors.systemError));
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    const memberCount = getUsersByGroup(group).length;
    if (memberCount > 0) {
      toast.error(t.users.cannotDeleteGroup.replace('{count}', String(memberCount)));
      return;
    }

    if (confirm(t.users.confirmDeleteGroup.replace('{name}', group.name))) {
      try {
        await groupsAPI.delete(group.ID);
        toast.success(t.users.deleteSuccess);
        if (selectedGroupId === group.ID) {
          setSelectedGroupId('all');
        }
        loadData();
      } catch (error: any) {
        console.error(error);
        toast.error(t.users.deleteFailed + (error.message || t.common.errors.systemError));
      }
    }
  };

  const handleViewDevices = (user: UserData) => {
    setLocation(`/devices?user=${user.headscale_name || user.username}`);
  };

  const handleViewRoutes = (user: UserData) => {
    setLocation(`/routes?user=${user.headscale_name || user.username}`);
  };

  const shouldSuggestOIDCMigration = (user: UserData) =>
    oidcStatus.mode === 'builtin_oidc' && user.provider !== 'oidc';

  const onlineCount = users.filter(u => onlineUsers.has(u.headscale_name || u.username)).length;

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
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.users.title}</h1>
            <p className="text-muted-foreground mt-1">{t.users.description}</p>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={loadData} disabled={loading}>
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
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

        {/* Stats row — ACL card style */}
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
                <p className="text-2xl font-bold mt-1">{users.filter(u => aclGroups.some(g => userMatchesAclGroup(u, g.name))).length}</p>
              </div>
              <UserPlus className="h-8 w-8 opacity-80 text-emerald-500" />
            </div>
          </Card>
          <Card className="p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t.users.ungrouped}</p>
                <p className="text-2xl font-bold mt-1">{getUngroupedUsers().length}</p>
              </div>
              <User className="h-8 w-8 opacity-80 text-gray-500" />
            </div>
          </Card>
        </div>

        {/* Main Content — Tree + List */}
        <div className="grid grid-cols-12 gap-4">
          {/* Left Panel — Sidebar tree */}
          <div className="col-span-12 lg:col-span-3">
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t.users.treeTitle}</p>
              </div>
              <ScrollArea className="h-[520px]">
                <div className="p-1.5">
                  {/* Quick Filter Section */}
                  <div className="space-y-0.5">
                    <button
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm",
                        selectedGroupId === 'all' 
                          ? "bg-primary/10 text-primary font-medium" 
                          : "text-foreground hover:bg-muted/60"
                      )}
                      onClick={() => setSelectedGroupId('all')}
                    >
                      <Users className="w-4 h-4 shrink-0 opacity-60" />
                      <span className="flex-1 truncate">{t.users.allUsers}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{users.length}</span>
                    </button>

                    <button
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm",
                        selectedGroupId === 'ungrouped' 
                          ? "bg-primary/10 text-primary font-medium" 
                          : "text-foreground hover:bg-muted/60"
                      )}
                      onClick={() => setSelectedGroupId('ungrouped')}
                    >
                      <User className="w-4 h-4 shrink-0 opacity-60" />
                      <span className="flex-1 truncate">{t.users.ungroupedUsers}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{getUngroupedUsers().length}</span>
                    </button>
                  </div>

                  {/* Groups Section */}
                  {groups.length > 0 && (
                    <>
                      <div className="px-3 pt-4 pb-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.users.groups}</p>
                      </div>
                      <div className="space-y-0.5">
                        {groups.map((group) => {
                          const memberCount = getUsersByGroup(group).length;
                          const isSelected = selectedGroupId === group.ID;

                          return (
                            <div key={group.ID} className="group/item relative">
                              <button
                                className={cn(
                                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm",
                                  isSelected 
                                    ? "bg-primary/10 text-primary font-medium" 
                                    : "text-foreground hover:bg-muted/60"
                                )}
                                onClick={() => setSelectedGroupId(group.ID)}
                              >
                                <UsersRound className="w-4 h-4 shrink-0 opacity-60" />
                                <span className="flex-1 truncate">{group.name}</span>
                                <span className="text-xs tabular-nums text-muted-foreground">{memberCount}</span>
                              </button>
                              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }}>
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">{t.common.actions.edit}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60 hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">{t.common.actions.delete}</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* Right Panel — User List */}
          <div className="col-span-12 lg:col-span-9">
            <Card className="p-0 overflow-hidden">
              {/* List header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-foreground">
                    {selectedGroupId === 'all' && t.users.allUsers}
                    {selectedGroupId === 'ungrouped' && t.users.ungroupedUsers}
                    {typeof selectedGroupId === 'number' && 
                      groups.find(g => g.ID === selectedGroupId)?.name
                    }
                  </h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{filteredUsers.length}</span>
                </div>
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={t.users.searchPlaceholder}
                    className="pl-8 h-8 text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* User rows */}
              <ScrollArea className="h-[520px]">
                <div className="divide-y divide-border/50">
                  <AnimatePresence>
                    {loading ? (
                      <div className="p-12 text-center text-sm text-muted-foreground">
                        {t.common.status.loading}
                      </div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="p-12 text-center text-sm text-muted-foreground">
                        {searchQuery ? t.users.noSearchResult : t.users.noUsers}
                      </div>
                    ) : (
                      filteredUsers.map((user, index) => (
                        <motion.div
                          key={user.ID}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: index * 0.015 }}
                          className="flex items-center gap-3.5 px-4 py-3 hover:bg-muted/30 transition-colors group/row"
                        >
                          {/* Avatar with online indicator */}
                          <div className="relative shrink-0">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                                {(user.display_name || user.username).slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-background",
                                    onlineUsers.has(user.headscale_name || user.username)
                                      ? "bg-green-500"
                                      : "bg-gray-300 dark:bg-gray-600"
                                  )}
                                />
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                {onlineUsers.has(user.headscale_name || user.username)
                                  ? t.common.status.online
                                  : t.common.status.offline}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {user.display_name || user.username}
                              </span>
                              {/* Provider — subtle inline text */}
                              <span className={cn(
                                "text-[11px] px-1.5 py-px rounded font-normal",
                                user.provider === 'oidc' 
                                  ? "text-blue-600 bg-blue-500/8 dark:text-blue-400 dark:bg-blue-500/15" 
                                  : user.provider === 'headscale' 
                                    ? "text-teal-600 bg-teal-500/8 dark:text-teal-400 dark:bg-teal-500/15" 
                                    : "text-gray-500 bg-gray-500/8 dark:text-gray-400 dark:bg-gray-500/15"
                              )}>
                                {user.provider === 'oidc' ? 'OIDC' : 
                                 user.provider === 'headscale' ? 'Headscale' : 
                                 t.users.providerLocal}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-px">
                              {user.email || user.username}
                            </p>
                            {shouldSuggestOIDCMigration(user) && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                {t.users.migrateToOidcHint}
                              </p>
                            )}
                          </div>

                          {/* Actions — show on hover */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleViewDevices(user)}>
                                  <Laptop className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">{t.users.viewDevices}</TooltipContent>
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
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </Card>
          </div>
        </div>

        {/* Create User Dialog */}
        <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                {t.users.createUserTitle}
              </DialogTitle>
              <DialogDescription>
                {oidcStatus.third_party ? t.users.createUserDescOidc : t.users.createUserDesc}
              </DialogDescription>
            </DialogHeader>
            {oidcStatus.oidc_enabled && (
              <div className={cn(
                "rounded-lg border px-4 py-3 text-sm",
                oidcStatus.third_party
                  ? "border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                  : "border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-700 dark:text-amber-300"
              )}>
                {oidcStatus.third_party ? t.users.oidcModeHint : t.users.builtinOidcHint}
              </div>
            )}
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-username" className="text-right">{t.users.usernameLabel}</Label>
                <Input
                  id="create-username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  className="col-span-3"
                  placeholder={t.users.usernamePlaceholder}
                />
              </div>
              {oidcStatus.password_required && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-password" className="text-right">{t.users.passwordLabel}</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="col-span-3"
                  placeholder={t.users.passwordPlaceholder}
                />
              </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-email" className="text-right">{t.users.emailLabel}</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-group" className="text-right">{t.users.groupLabel}</Label>
                <Select 
                  value={newUser.group_id || "0"} 
                  onValueChange={(val) => setNewUser({...newUser, group_id: val === "0" ? "" : val})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={t.users.groupPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t.users.noGroup}</SelectItem>
                    {groups.map(g => (
                      <SelectItem key={g.ID} value={g.ID.toString()}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-display-name" className="text-right">{t.users.displayNameLabel}</Label>
                <Input
                  id="create-display-name"
                  value={newUser.display_name}
                  onChange={(e) => setNewUser({...newUser, display_name: e.target.value})}
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateUserDialogOpen(false)}>{t.common.actions.cancel}</Button>
              <Button onClick={handleCreateUser}>{t.users.createUserBtn}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="w-5 h-5" />
                {t.users.editUserTitle.replace('{username}', selectedUser?.username || '')}
              </DialogTitle>
              <DialogDescription>
                {t.users.editUserDesc}
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-20 shrink-0">{t.users.usernameLabel.replace(' *', '')}</span>
                  <span className="font-medium text-foreground">{selectedUser.username}</span>
                </div>
                {selectedUser.headscale_name && selectedUser.headscale_name !== selectedUser.username && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-20 shrink-0">Headscale</span>
                    <span className="font-mono text-xs text-muted-foreground">{selectedUser.headscale_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-20 shrink-0">{t.users.providerLabel}</span>
                  <span className={cn(
                    "text-xs px-1.5 py-px rounded",
                    selectedUser.provider === 'oidc' ? "text-blue-600 bg-blue-500/10" :
                    selectedUser.provider === 'headscale' ? "text-teal-600 bg-teal-500/10" :
                    "text-gray-500 bg-gray-500/10"
                  )}>
                    {selectedUser.provider === 'oidc' ? 'OIDC' :
                     selectedUser.provider === 'headscale' ? 'Headscale' :
                     t.users.providerLocal}
                  </span>
                </div>
              </div>
            )}
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-display-name" className="text-right">{t.users.displayNameLabel}</Label>
                <Input
                  id="edit-display-name"
                  value={editUser.display_name}
                  onChange={(e) => setEditUser({...editUser, display_name: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-email" className="text-right">{t.users.emailLabel}</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editUser.email}
                  onChange={(e) => setEditUser({...editUser, email: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-password" className="text-right">{t.users.newPasswordLabel}</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={editUser.password}
                  onChange={(e) => setEditUser({...editUser, password: e.target.value})}
                  className="col-span-3"
                  placeholder={t.users.newPasswordPlaceholder}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-group" className="text-right">{t.users.groupLabel}</Label>
                <Select 
                  value={editUser.group_id || "0"} 
                  onValueChange={(val) => setEditUser({...editUser, group_id: val === "0" ? "" : val})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={t.users.groupPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t.users.noGroup}</SelectItem>
                    {groups.map(g => (
                      <SelectItem key={g.ID} value={g.ID.toString()}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>{t.common.actions.cancel}</Button>
              <Button onClick={handleUpdateUser}>{t.users.saveChanges}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Group Dialog */}
        <Dialog open={createGroupDialogOpen} onOpenChange={setCreateGroupDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UsersRound className="w-5 h-5" />
                {t.users.createGroupTitle}
              </DialogTitle>
              <DialogDescription>{t.users.createGroupDesc}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-group-name">{t.users.groupNameLabel}</Label>
                <Input
                  id="new-group-name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={t.users.groupNamePlaceholder}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateGroupDialogOpen(false)}>{t.common.actions.cancel}</Button>
              <Button onClick={handleCreateGroup}>{t.common.actions.create}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Group Dialog */}
        <Dialog open={editGroupDialogOpen} onOpenChange={setEditGroupDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="w-5 h-5" />
                {t.users.editGroupTitle}
              </DialogTitle>
              <DialogDescription>{t.users.editGroupDesc}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-group-name">{t.users.groupNameLabel}</Label>
                <Input
                  id="edit-group-name"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  placeholder={t.users.groupNamePlaceholder}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateGroup()}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditGroupDialogOpen(false)}>{t.common.actions.cancel}</Button>
              <Button onClick={handleUpdateGroup}>{t.common.actions.save}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
