import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/index';
import { dnsAPI, DNSRecord } from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Button, Card, Input, Modal, Select, Space, Table, Tag, Typography, message, theme } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined, SaveOutlined, ReloadOutlined, SearchOutlined, GlobalOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRequest } from 'ahooks';

const { Title, Text } = Typography;

export default function DNS() {
  const t = useTranslation();
  theme.useToken();
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const [showDialog, setShowDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'A' as 'A' | 'AAAA',
    value: '',
    comment: '',
  });
  const [importing, setImporting] = useState(false);
  const [hasTriedAutoImport, setHasTriedAutoImport] = useState(false);

  const { data: listData, loading, refresh } = useRequest(
    async () => dnsAPI.list({ page, pageSize, keyword, type: typeFilter }),
    {
      refreshDeps: [page, pageSize, keyword, typeFilter],
      onError: (error) => {
        console.error('Failed to load DNS records:', error);
        message.error(t.dns.loadFailed);
      },
    },
  );

  const records: DNSRecord[] = listData?.list || [];
  const total = listData?.total || 0;

  useEffect(() => {
    if (!loading && !hasTriedAutoImport && records.length === 0 && total === 0) {
      setHasTriedAutoImport(true);
      handleImportFromFile(true);
    }
  }, [loading, records, total, hasTriedAutoImport]);

  const handleImportFromFile = async (silent = false) => {
    setImporting(true);
    try {
      const res: any = await dnsAPI.import();
      const imported = res?.imported || 0;
      if (imported > 0) {
        message.success(t.dns.importSuccess.replace('{count}', String(imported)));
      } else if (!silent) {
        message.info(t.dns.importNoNewRecords);
      }
      refresh();
    } catch (error: any) {
      if (!silent) {
        message.error(t.dns.importFailed + (error.message ? ': ' + error.message : ''));
      }
    } finally {
      setImporting(false);
    }
  };

  const handleCreate = () => {
    setEditingRecord(null);
    setFormData({ name: '', type: 'A', value: '', comment: '' });
    setShowDialog(true);
  };

  const handleEdit = (record: DNSRecord) => {
    setEditingRecord(record);
    setFormData({ name: record.name, type: record.type, value: record.value, comment: record.comment || '' });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingRecord) {
        await dnsAPI.update({ id: editingRecord.id, ...formData });
        message.success(t.dns.recordUpdated);
      } else {
        await dnsAPI.create(formData);
        message.success(t.dns.recordCreated);
      }
      setShowDialog(false);
      refresh();
    } catch (error: any) {
      message.error(error.message || t.common.errors.operationFailed);
    }
  };

  const handleDelete = (record: DNSRecord) => {
    Modal.confirm({
      title: t.dns.deleteDialogTitle,
      content: t.dns.deleteDialogDesc.replace('{name}', record.name),
      okButtonProps: { danger: true },
      okText: t.common.actions.delete,
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await dnsAPI.delete(record.id);
          message.success(t.dns.recordDeleted);
          refresh();
        } catch (error: any) {
          message.error(error.message || t.dns.deleteFailed);
        }
      },
    });
  };

  const handleApply = () => {
    Modal.confirm({
      title: t.dns.applyDialogTitle,
      content: (<div>{t.dns.applyDialogDesc}<br /><br /><Text type="warning" strong>{t.dns.applyDialogWarning}</Text></div>),
      okText: t.dns.confirmApply,
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await dnsAPI.sync();
          message.success(t.dns.applySuccess);
        } catch (error: any) {
          message.error(error.message || t.dns.applyFailed);
        }
      },
    });
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
      message.success(t.dns.exportSuccess);
    } catch (error: any) {
      message.error(error.message || t.dns.exportFailed);
    }
  };

  const validateIPv4 = (ip: string) => /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
  const validateIPv6 = (ip: string) => /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/.test(ip);

  const isFormValid = () => {
    if (!formData.name || !formData.value) return false;
    if (formData.type === 'A' && !validateIPv4(formData.value)) return false;
    if (formData.type === 'AAAA' && !validateIPv6(formData.value)) return false;
    return true;
  };

  const columns: ColumnsType<DNSRecord> = [
    { title: t.dns.tableDomain, dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text> },
    {
      title: t.dns.tableType, dataIndex: 'type', key: 'type', width: 100,
      render: (v: string) => <Tag color={v === 'A' ? 'blue' : 'purple'}>{v}</Tag>,
    },
    { title: t.dns.tableIp, dataIndex: 'value', key: 'value', render: (v: string) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text> },
    { title: t.dns.tableComment, dataIndex: 'comment', key: 'comment', render: (v: string) => <Text type="secondary">{v || '-'}</Text> },
    {
      title: t.dns.tableActions, key: 'actions', width: 100, align: 'right',
      render: (_: any, record: DNSRecord) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={() => handleDelete(record)} />
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}><GlobalOutlined style={{ marginRight: 8 }} />{t.dns.title}</Title>
            <Text type="secondary">{t.dns.description}</Text>
          </div>
          <Space wrap>
            <Button icon={<UploadOutlined />} onClick={() => handleImportFromFile(false)} loading={importing}>{importing ? t.dns.importing : t.dns.importFromFile}</Button>
            <Button icon={<DownloadOutlined />} onClick={handleExportJson}>{t.dns.exportJson}</Button>
            <Button icon={<SaveOutlined />} onClick={handleApply}>{t.dns.applyConfig}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>{t.dns.addRecord}</Button>
          </Space>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: t.dns.totalRecords, value: total, icon: <GlobalOutlined style={{ fontSize: 28, color: '#1677ff' }} />, watermark: 'DNS' },
            { label: t.dns.aRecords, value: records.filter(r => r.type === 'A').length, icon: <GlobalOutlined style={{ fontSize: 28, color: '#52c41a' }} />, watermark: 'A' },
            { label: t.dns.aaaaRecords, value: records.filter(r => r.type === 'AAAA').length, icon: <GlobalOutlined style={{ fontSize: 28, color: '#722ed1' }} />, watermark: 'AAAA' },
          ].map((stat, i) => (
            <Card key={i} size="small" style={{ padding: 4, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: 8, bottom: -4, fontSize: 48, fontWeight: 900, opacity: 0.04, letterSpacing: -2, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>{stat.watermark}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{stat.label}</Text>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{stat.value}</div>
                </div>
                {stat.icon}
              </div>
            </Card>
          ))}
        </div>

        {/* Records Table */}
        <Card title={t.dns.recordListTitle} extra={<Text type="secondary">{t.dns.recordListDesc}</Text>}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Input prefix={<SearchOutlined />} placeholder={t.dns.searchPlaceholder} value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ flex: 1, minWidth: 200, maxWidth: 360 }} allowClear />
            <Select value={typeFilter || 'all'} onChange={(v) => setTypeFilter(v === 'all' ? '' : v)} style={{ width: 130 }}
              options={[{ value: 'all', label: t.dns.allTypes }, { value: 'A', label: 'A' }, { value: 'AAAA', label: 'AAAA' }]}
            />
            <Button icon={<ReloadOutlined />} onClick={refresh} />
          </div>

          <Table
            columns={columns}
            dataSource={records}
            rowKey="id"
            loading={loading}
            pagination={total > pageSize ? {
              current: page,
              pageSize,
              total,
              onChange: setPage,
              showTotal: (t) => `${t} records`,
            } : false}
            locale={{ emptyText: t.dns.noData }}
          />
        </Card>

        {/* Create/Edit Modal */}
        <Modal
          title={editingRecord ? t.dns.editRecordTitle : t.dns.addRecordTitle}
          open={showDialog}
          onCancel={() => setShowDialog(false)}
          onOk={handleSubmit}
          okText={editingRecord ? t.common.actions.save : t.common.actions.create}
          cancelText={t.common.actions.cancel}
          okButtonProps={{ disabled: !isFormValid() }}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.dns.domainLabel}</Text>
              <Input placeholder={t.dns.domainPlaceholder} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.dns.typeLabel}</Text>
              <Select value={formData.type} onChange={(v: 'A' | 'AAAA') => setFormData({ ...formData, type: v })} style={{ width: '100%' }}
                options={[{ value: 'A', label: 'A (IPv4)' }, { value: 'AAAA', label: 'AAAA (IPv6)' }]}
              />
            </div>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.dns.ipLabel}</Text>
              <Input placeholder={formData.type === 'A' ? '192.168.1.100' : '2001:db8::1'} value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} />
              {formData.value && formData.type === 'A' && !validateIPv4(formData.value) && <Text type="danger" style={{ fontSize: 12 }}>{t.dns.invalidIpv4}</Text>}
              {formData.value && formData.type === 'AAAA' && !validateIPv6(formData.value) && <Text type="danger" style={{ fontSize: 12 }}>{t.dns.invalidIpv6}</Text>}
            </div>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.dns.commentLabel}</Text>
              <Input placeholder={t.dns.commentPlaceholder} value={formData.comment} onChange={(e) => setFormData({ ...formData, comment: e.target.value })} />
            </div>
          </Space>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
