import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  Edit,
  FolderTree,
  Laptop,
  MoreVertical,
  Plus,
  RefreshCw,
  Route,
  Search,
  Trash2,
  User,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { systemUsersAPI, groupsAPI, aclAPI } from '@/lib/api';
import { useTranslation } from '@/i18n/index';

// ACL Group from policy
interface ACLGroup {
  name: string; // e.g., "admin" (without "group:" prefix)
  members: string[]; // email patterns like "user@", "user@example.com"
}

interface Group {
  ID: number;
  name: string;
  CreatedAt?: string;
}

interface UserData {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  username: string;
  email: string;
  display_name: string;
  headscale_name: string;
  group_id: number;
  group?: Group;
  is_active: boolean;
  profile_pic_url?: string;
}

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersRes, groupsRes, policyRes] = await Promise.all([
        systemUsersAPI.list({ pageSize: 1000 }),
        groupsAPI.list({ pageSize: 100 }),
        aclAPI.getPolicy().catch(() => null)
      ]);
      
      const userList = (usersRes as any).list || [];
      setUsers(Array.isArray(userList) ? userList : []);
      
      const groupList = Array.isArray(groupsRes) ? groupsRes : (groupsRes as any).list || [];
      setGroups(Array.isArray(groupList) ? groupList : []);
      
      // Parse ACL groups from policy
      console.log('Policy response:', policyRes);
      if (policyRes?.data?.data?.groups) {
        const policyGroups: Record<string, string[]> = policyRes.data.data.groups;
        const parsedGroups: ACLGroup[] = Object.entries(policyGroups).map(([key, members]) => ({
          name: key.replace(/^group:/, ''), // Remove "group:" prefix
          members: members,
        }));
        console.log('ACL Groups loaded:', parsedGroups);
        setAclGroups(parsedGroups);
      } else if (policyRes?.data?.groups) {
        // Try alternative path
        const policyGroups: Record<string, string[]> = policyRes.data.groups;
        const parsedGroups: ACLGroup[] = Object.entries(policyGroups).map(([key, members]) => ({
          name: key.replace(/^group:/, ''), // Remove "group:" prefix
          members: members,
        }));
        console.log('ACL Groups loaded (alt path):', parsedGroups);
        setAclGroups(parsedGroups);
      } else if (policyRes?.groups) {
        // Try another alternative path
        const policyGroups: Record<string, string[]> = policyRes.groups;
        const parsedGroups: ACLGroup[] = Object.entries(policyGroups).map(([key, members]) => ({
          name: key.replace(/^group:/, ''), // Remove "group:" prefix
          members: members,
        }));
        console.log('ACL Groups loaded (direct):', parsedGroups);
        setAclGroups(parsedGroups);
      } else {
      }
      
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
    if (!newUser.username || !newUser.password) {
      toast.error(t.users.requiredFields);
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

  return (
    <DashboardLayout>
      <TooltipProvider>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Page Header */}
        <div className="flex justify-between items-center">
          <div>
              <h1 className="text-2xl font-bold text-foreground">{t.users.title}</h1>
            <p className="text-muted-foreground mt-1">{t.users.description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              {t.common.actions.refresh}
            </Button>
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

        {/* Stats - Compact style matching Routes page */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t.users.totalUsers}</p>
                <p className="text-2xl font-bold mt-1">{users.length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </Card>
          <Card className="p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t.users.groups}</p>
                <p className="text-2xl font-bold mt-1">{groups.length}</p>
              </div>
              <FolderTree className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
          </Card>
          <Card className="p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t.users.grouped}</p>
                <p className="text-2xl font-bold mt-1">{users.filter(u => aclGroups.some(g => userMatchesAclGroup(u, g.name))).length}</p>
              </div>
              <UsersRound className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </Card>
          <Card className="p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t.users.ungrouped}</p>
                <p className="text-2xl font-bold mt-1">{getUngroupedUsers().length}</p>
              </div>
              <User className="h-8 w-8 text-orange-500 opacity-80" />
            </div>
          </Card>
        </div>

        {/* Main Content - Tree + List Layout */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Panel - Tree View */}
          <Card className="col-span-12 lg:col-span-3 gap-0">
            <CardHeader className="pb-4 border-b border-border/60">
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderTree className="w-5 h-5" />
                {t.users.treeTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="p-2">
                  {/* All Users */}
                  <motion.div
                    whileHover={{ x: 2 }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      selectedGroupId === 'all' 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-muted"
                    )}
                    onClick={() => setSelectedGroupId('all')}
                  >
                    <Users className="w-4 h-4" />
                    <span className="flex-1 font-medium">{t.users.allUsers}</span>
                    <Badge variant="secondary" className="text-xs">
                      {users.length}
                    </Badge>
                  </motion.div>

                  {/* Ungrouped Users */}
                  <motion.div
                    whileHover={{ x: 2 }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      selectedGroupId === 'ungrouped' 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-muted"
                    )}
                    onClick={() => setSelectedGroupId('ungrouped')}
                  >
                    <User className="w-4 h-4" />
                    <span className="flex-1">{t.users.ungroupedUsers}</span>
                    <Badge variant="outline" className="text-xs">
                      {getUngroupedUsers().length}
                    </Badge>
                  </motion.div>

                  <Separator className="my-2" />

                  {/* Database Groups */}
                  {groups.map((group) => {
                    const memberCount = getUsersByGroup(group).length;
                    const isSelected = selectedGroupId === group.ID;

                    return (
                      <motion.div
                        key={group.ID}
                        whileHover={{ x: 2 }}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group/item",
                          isSelected 
                            ? "bg-primary text-primary-foreground" 
                            : "hover:bg-muted"
                        )}
                        onClick={() => setSelectedGroupId(group.ID)}
                      >
                        <UsersRound className="w-4 h-4" />
                        <span className="flex-1 truncate">{group.name}</span>
                        <Badge variant={isSelected ? "secondary" : "outline"} className="text-xs">
                          {memberCount}
                        </Badge>
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right Panel - User List */}
          <Card className="col-span-12 lg:col-span-9 gap-0">
            <CardHeader className="pb-4 border-b border-border/60">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {selectedGroupId === 'all' && t.users.allUsers}
                  {selectedGroupId === 'ungrouped' && t.users.ungroupedUsers}
                  {typeof selectedGroupId === 'number' && 
                    groups.find(g => g.ID === selectedGroupId)?.name
                  }
                  <span className="text-muted-foreground font-normal ml-2">
                    ({filteredUsers.length})
                  </span>
                </CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t.users.searchPlaceholder}
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y divide-border/60">
                  <AnimatePresence>
                    {loading ? (
                      <div className="p-8 text-center text-muted-foreground">
                        {t.common.status.loading}
                      </div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        {searchQuery ? t.users.noSearchResult : t.users.noUsers}
                      </div>
                    ) : (
                      filteredUsers.map((user, index) => (
                        <motion.div
                          key={user.ID}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ delay: index * 0.02 }}
                          className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors group"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {user.display_name?.[0]?.toUpperCase() || user.username[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {user.display_name || user.username}
                              </span>
                              {user.group && (
                                <Badge variant="outline" className="text-xs">
                                  {user.group.name}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="truncate">{user.email || '-'}</span>
                              {user.headscale_name && (
                                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                                  {user.headscale_name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewDevices(user)}
                                >
                                  <Laptop className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t.users.viewDevices}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewRoutes(user)}
                                >
                                  <Route className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t.users.viewRoutes}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditUser(user)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t.users.editUser}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteUser(user)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t.users.deleteUser}</TooltipContent>
                            </Tooltip>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
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
                {t.users.createUserDesc}
              </DialogDescription>
            </DialogHeader>
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
            <div className="grid gap-4 py-4">
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-display-name" className="text-right">{t.users.displayNameLabel}</Label>
                <Input
                  id="edit-display-name"
                  value={editUser.display_name}
                  onChange={(e) => setEditUser({...editUser, display_name: e.target.value})}
                  className="col-span-3"
                />
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
