import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Download, Globe, Search, Save, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/i18n/index';
import { dnsAPI, DNSRecord } from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function DNS() {
  const t = useTranslation();
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  
  const [showDialog, setShowDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DNSRecord | null>(null);
  const [applyConfirm, setApplyConfirm] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'A' as 'A' | 'AAAA',
    value: '',
    comment: '',
  });

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await dnsAPI.list({ page, pageSize, keyword, type: typeFilter });
      if (res) {
        setRecords(res.list || []);
        setTotal(res.total || 0);
      }
    } catch (error) {
      console.error('Failed to load DNS records:', error);
      toast.error(t.dns.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, typeFilter]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleCreate = () => {
    setEditingRecord(null);
    setFormData({ name: '', type: 'A', value: '', comment: '' });
    setShowDialog(true);
  };

  const handleEdit = (record: DNSRecord) => {
    setEditingRecord(record);
    setFormData({
      name: record.name,
      type: record.type,
      value: record.value,
      comment: record.comment || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingRecord) {
        await dnsAPI.update({
          id: editingRecord.id,
          ...formData,
        });
        toast.success(t.dns.recordUpdated);
      } else {
        await dnsAPI.create(formData);
        toast.success(t.dns.recordCreated);
      }
      setShowDialog(false);
      loadRecords();
    } catch (error: any) {
      toast.error(error.message || t.common.errors.operationFailed);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await dnsAPI.delete(deleteConfirm.id);
      toast.success(t.dns.recordDeleted);
      setDeleteConfirm(null);
      loadRecords();
    } catch (error: any) {
      toast.error(error.message || t.dns.deleteFailed);
    }
  };

  const handleApply = async () => {
    try {
      await dnsAPI.sync();
      toast.success(t.dns.applySuccess);
      setApplyConfirm(false);
    } catch (error: any) {
      toast.error(error.message || t.dns.applyFailed);
    }
  };

  const handleExportJson = async () => {
    try {
      const res = await dnsAPI.getFile();
      const blob = new Blob([JSON.stringify(res || [], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'extra-records.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t.dns.exportSuccess);
    } catch (error: any) {
      toast.error(error.message || t.dns.exportFailed);
    }
  };

  const validateIPv4 = (ip: string) => {
    const regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return regex.test(ip);
  };

  const validateIPv6 = (ip: string) => {
    const regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    return regex.test(ip);
  };

  const isFormValid = () => {
    if (!formData.name || !formData.value) return false;
    if (formData.type === 'A' && !validateIPv4(formData.value)) return false;
    if (formData.type === 'AAAA' && !validateIPv6(formData.value)) return false;
    return true;
  };

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6" />
            {t.dns.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t.dns.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportJson}>
            <Download className="h-4 w-4 mr-1" />
            {t.dns.exportJson}
          </Button>
          <Button variant="default" size="sm" onClick={() => setApplyConfirm(true)}>
            <Save className="h-4 w-4 mr-1" />
            {t.dns.applyConfig}
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t.dns.addRecord}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.dns.totalRecords}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.dns.aRecords}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {records.filter(r => r.type === 'A').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.dns.aaaaRecords}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {records.filter(r => r.type === 'AAAA').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t.dns.recordListTitle}</CardTitle>
          <CardDescription>
            {t.dns.recordListDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t.dns.searchPlaceholder}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t.dns.allTypes} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.dns.allTypes}</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="AAAA">AAAA</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadRecords}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.dns.tableDomain}</TableHead>
                <TableHead className="w-24">{t.dns.tableType}</TableHead>
                <TableHead>{t.dns.tableIp}</TableHead>
                <TableHead>{t.dns.tableComment}</TableHead>
                <TableHead className="w-24 text-right">{t.dns.tableActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t.common.status.loading}
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t.dns.noData}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono">{record.name}</TableCell>
                    <TableCell>
                      <Badge variant={record.type === 'A' ? 'default' : 'secondary'}>
                        {record.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{record.value}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {record.comment || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(record)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(record)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {total > pageSize && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                {t.common.pagination.totalRecords.replace('{total}', String(total))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  {t.common.pagination.prevPage}
                </Button>
                <span className="text-sm">
                  {t.common.pagination.pageNum.replace('{page}', String(page))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * pageSize >= total}
                  onClick={() => setPage(p => p + 1)}
                >
                  {t.common.pagination.nextPage}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? t.dns.editRecordTitle : t.dns.addRecordTitle}
            </DialogTitle>
            <DialogDescription>
              {t.dns.recordDialogDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t.dns.domainLabel}</Label>
              <Input
                id="name"
                placeholder={t.dns.domainPlaceholder}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">{t.dns.typeLabel}</Label>
              <Select
                value={formData.type}
                onValueChange={(v: 'A' | 'AAAA') => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A (IPv4)</SelectItem>
                  <SelectItem value="AAAA">AAAA (IPv6)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">{t.dns.ipLabel}</Label>
              <Input
                id="value"
                placeholder={formData.type === 'A' ? '192.168.1.100' : '2001:db8::1'}
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              />
              {formData.value && formData.type === 'A' && !validateIPv4(formData.value) && (
                <p className="text-sm text-destructive">{t.dns.invalidIpv4}</p>
              )}
              {formData.value && formData.type === 'AAAA' && !validateIPv6(formData.value) && (
                <p className="text-sm text-destructive">{t.dns.invalidIpv6}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="comment">{t.dns.commentLabel}</Label>
              <Input
                id="comment"
                placeholder={t.dns.commentPlaceholder}
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t.common.actions.cancel}
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid()}>
              {editingRecord ? t.common.actions.save : t.common.actions.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.dns.deleteDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.dns.deleteDialogDesc.replace('{name}', deleteConfirm?.name || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t.common.actions.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply Configuration Confirmation */}
      <AlertDialog open={applyConfirm} onOpenChange={setApplyConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.dns.applyDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.dns.applyDialogDesc}
              <br /><br />
              <strong className="text-orange-500">{t.dns.applyDialogWarning}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply}>
              {t.dns.confirmApply}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </DashboardLayout>
  );
}
