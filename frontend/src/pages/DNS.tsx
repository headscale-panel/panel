import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/index';
import { dnsAPI, DNSRecord } from '@/lib/api';
import RecordModal from '@/components/dns/RecordModal';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { Button, Card, Input, Modal, Select, Space, Table, Tag, Typography, message, theme } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined, SaveOutlined, ReloadOutlined, SearchOutlined, GlobalOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRequest } from 'ahooks';

const { Title, Text } = Typography;

export default function DNS() {
  const t = useTranslation();
  theme.useToken();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const [showDialog, setShowDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);

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
    setShowDialog(true);
  };

  const handleEdit = (record: DNSRecord) => {
    setEditingRecord(record);
    setShowDialog(true);
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

  const columns: ColumnsType<DNSRecord> = [
    { title: t.dns.tableDomain, dataIndex: 'name', key: 'name', render: (v: string) => <Text className="mono-text">{v}</Text> },
    {
      title: t.dns.tableType, dataIndex: 'type', key: 'type', width: 100,
      render: (v: string) => <Tag color={v === 'A' ? 'blue' : 'purple'}>{v}</Tag>,
    },
    { title: t.dns.tableIp, dataIndex: 'value', key: 'value', render: (v: string) => <Text className="mono-text">{v}</Text> },
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
      <div className="app-page-stack">
        {/* Header */}
        <div className="page-header-row">
          <div>
            <Title level={4} className="page-title-with-icon"><GlobalOutlined />{t.dns.title}</Title>
            <Text type="secondary">{t.dns.description}</Text>
          </div>
          <Space wrap className="header-actions-wrap">
            <Button icon={<UploadOutlined />} onClick={() => handleImportFromFile(false)} loading={importing}>{importing ? t.dns.importing : t.dns.importFromFile}</Button>
            <Button icon={<DownloadOutlined />} onClick={handleExportJson}>{t.dns.exportJson}</Button>
            <Button data-tour-id="dns-apply" icon={<SaveOutlined />} onClick={handleApply}>{t.dns.applyConfig}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} data-tour-id="dns-add-record">{t.dns.addRecord}</Button>
          </Space>
        </div>

        {/* Stats */}
        <PageHeaderStatCards
          items={[
            { label: t.dns.totalRecords, value: total, icon: <GlobalOutlined className="stat-icon-primary" />, watermark: 'DNS' },
            { label: t.dns.aRecords, value: records.filter(r => r.type === 'A').length, icon: <GlobalOutlined className="stat-icon-success" />, watermark: 'A' },
            { label: t.dns.aaaaRecords, value: records.filter(r => r.type === 'AAAA').length, icon: <GlobalOutlined className="stat-icon-accent" />, watermark: 'AAAA' },
          ]}
        />

        {/* Records Table */}
        <Card title={t.dns.recordListTitle} extra={<Text type="secondary">{t.dns.recordListDesc}</Text>}>
          <div className="table-filter-row" data-tour-id="dns-filters">
            <Input prefix={<SearchOutlined />} placeholder={t.dns.searchPlaceholder} value={keyword} onChange={(e) => setKeyword(e.target.value)} className="table-search-input" allowClear />
            <Select value={typeFilter || 'all'} onChange={(v) => setTypeFilter(v === 'all' ? '' : v)} className="select-fixed-sm"
              options={[{ value: 'all', label: t.dns.allTypes }, { value: 'A', label: 'A' }, { value: 'AAAA', label: 'AAAA' }]}
            />
            <Button icon={<ReloadOutlined />} onClick={refresh} />
          </div>

          <Table
            columns={columns}
            dataSource={records}
            rowKey="id"
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); },
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (t) => `${t} records`,
            }}
            locale={{ emptyText: t.dns.noData }}
          />
        </Card>

        <RecordModal
          open={showDialog}
          editingRecord={editingRecord}
          onCancel={() => setShowDialog(false)}
          onSuccess={() => { setShowDialog(false); refresh(); }}
        />
      </div>
    </DashboardLayout>
  );
}
