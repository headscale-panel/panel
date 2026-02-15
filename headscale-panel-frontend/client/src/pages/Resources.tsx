import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/index';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Edit,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Globe,
  Network,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import DashboardLayout from '@/components/DashboardLayout';
import { resourcesAPI } from '@/lib/api';

interface Resource {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  name: string;
  ip_address: string;
  port: string;
  description?: string;
}

export default function Resources() {
  const t = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    port: '',
    description: '',
  });

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    try {
      setLoading(true);
      const res = await resourcesAPI.list();
      setResources((res as any).list || []);
    } catch (error: any) {
      console.error(error);
      toast.error(t.resources.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.ip_address) {
      toast.error(t.resources.requiredFields);
      return;
    }

    try {
      await resourcesAPI.create({
        name: formData.name,
        ip_address: formData.ip_address,
        port: formData.port,
        description: formData.description,
      });
      toast.success(t.resources.createSuccess);
      setCreateDialogOpen(false);
      resetForm();
      loadResources();
    } catch (error: any) {
      toast.error(t.resources.createFailed + (error.message || ''));
    }
  };

  const handleEdit = (resource: Resource) => {
    setSelectedResource(resource);
    setFormData({
      name: resource.name,
      ip_address: resource.ip_address,
      port: resource.port || '',
      description: resource.description || '',
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedResource) return;
    if (!formData.name || !formData.ip_address) {
      toast.error(t.resources.requiredFields);
      return;
    }

    try {
      await resourcesAPI.update(selectedResource.ID, {
        name: formData.name,
        ip_address: formData.ip_address,
        port: formData.port,
        description: formData.description,
      });
      toast.success(t.resources.updateSuccess);
      setEditDialogOpen(false);
      setSelectedResource(null);
      resetForm();
      loadResources();
    } catch (error: any) {
      toast.error(t.resources.updateFailed + (error.message || ''));
    }
  };

  const handleDelete = async (resource: Resource) => {
    if (!confirm(t.resources.confirmDelete.replace('{name}', resource.name))) return;

    try {
      await resourcesAPI.delete(resource.ID);
      toast.success(t.resources.deleteSuccess);
      loadResources();
    } catch (error: any) {
      toast.error(t.resources.deleteFailed + (error.message || ''));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      ip_address: '',
      port: '',
      description: '',
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setCreateDialogOpen(true);
  };

  const filteredResources = resources.filter((resource) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      resource.name.toLowerCase().includes(q) ||
      resource.ip_address.toLowerCase().includes(q) ||
      (resource.description && resource.description.toLowerCase().includes(q))
    );
  });

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Page Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t.resources.title}</h1>
              <p className="text-muted-foreground mt-1">{t.resources.description}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadResources} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {t.common.actions.refresh}
              </Button>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                {t.resources.addResource}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.resources.totalResources}</p>
                  <p className="text-2xl font-bold mt-1">{resources.length}</p>
                </div>
                <Server className="h-8 w-8 opacity-80 text-blue-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.resources.withPort}</p>
                  <p className="text-2xl font-bold mt-1">
                    {resources.filter((r) => r.port).length}
                  </p>
                </div>
                <Network className="h-8 w-8 opacity-80 text-green-500" />
              </div>
            </Card>
            <Card className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.resources.withoutPort}</p>
                  <p className="text-2xl font-bold mt-1">
                    {resources.filter((r) => !r.port).length}
                  </p>
                </div>
                <Globe className="h-8 w-8 opacity-80 text-orange-500" />
              </div>
            </Card>
          </div>

          {/* Search and Table */}
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t.resources.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.resources.tableName}</TableHead>
                  <TableHead>{t.resources.tableIp}</TableHead>
                  <TableHead>{t.resources.tablePort}</TableHead>
                  <TableHead>{t.resources.tableDesc}</TableHead>
                  <TableHead>{t.resources.tableCreatedAt}</TableHead>
                  <TableHead>{t.resources.tableActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t.common.status.loading}
                    </TableCell>
                  </TableRow>
                ) : filteredResources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t.resources.noData}
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence>
                    {filteredResources.map((resource) => (
                      <motion.tr
                        key={resource.ID}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-muted/50 transition-colors group"
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{resource.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {resource.ip_address}
                          </code>
                        </TableCell>
                        <TableCell>
                          {resource.port ? (
                            <Badge variant="outline">{resource.port}</Badge>
                          ) : (
                            <span className="text-muted-foreground">{t.resources.allPorts}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {resource.description || '-'}
                        </TableCell>
                        <TableCell>
                          {new Date(resource.CreatedAt).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(resource)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t.common.actions.edit}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(resource)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t.common.actions.delete}</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Create Dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.resources.addResourceTitle}</DialogTitle>
                <DialogDescription>
                  {t.resources.addResourceDesc}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">{t.resources.nameLabel}</Label>
                  <Input
                    id="name"
                    placeholder={t.resources.namePlaceholder}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.resources.nameHint}
                  </p>
                </div>
                <div>
                  <Label htmlFor="ip_address">{t.resources.ipLabel}</Label>
                  <Input
                    id="ip_address"
                    placeholder={t.resources.ipPlaceholder}
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.resources.ipHint}
                  </p>
                </div>
                <div>
                  <Label htmlFor="port">{t.resources.portLabel}</Label>
                  <Input
                    id="port"
                    placeholder={t.resources.portPlaceholder}
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.resources.portHint}
                  </p>
                </div>
                <div>
                  <Label htmlFor="description">{t.resources.descriptionLabel}</Label>
                  <Input
                    id="description"
                    placeholder={t.resources.descriptionPlaceholder}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleCreate}>{t.common.actions.create}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.resources.editResourceTitle}</DialogTitle>
                <DialogDescription>{t.resources.editResourceDesc}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">{t.resources.nameLabel}</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-ip_address">{t.resources.ipLabel}</Label>
                  <Input
                    id="edit-ip_address"
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-port">{t.resources.portLabel}</Label>
                  <Input
                    id="edit-port"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-description">{t.resources.descriptionLabel}</Label>
                  <Input
                    id="edit-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  {t.common.actions.cancel}
                </Button>
                <Button onClick={handleUpdate}>{t.common.actions.save}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
