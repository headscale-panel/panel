import { useState } from 'react';
import { useRequest } from 'ahooks';
import { useTranslation } from '@/i18n/index';
import { Button, Card, Input, Modal, Table, Tooltip, Space, Typography, message, theme } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined, CloudServerOutlined, GlobalOutlined, ApiOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DashboardLayout from '@/components/DashboardLayout';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { resourceApi } from '@/api';
import ResourceModal from '@/components/resources/ResourceModal';

const { Title, Text } = Typography;

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
  const { token: themeToken } = theme.useToken();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);


  const { data: listData, loading, refresh } = useRequest(
    async () => resourceApi.list({ page, pageSize, keyword: searchQuery || undefined }),
    {
      refreshDeps: [page, pageSize, searchQuery],
      onError: (error: any) => {
        message.error(t.resources.loadFailed);
      },
    },
  );

  const resources: Resource[] = (listData?.list || []) as any;
  const total = listData?.total || 0;

  const handleEdit = (resource: Resource) => {
    setEditingResource(resource);
    setDialogOpen(true);
  };

  const handleDelete = (resource: Resource) => {
    Modal.confirm({
      title: t.common.actions.delete,
      content: t.resources.confirmDelete.replace('{name}', resource.name),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await resourceApi.delete({ id: resource.ID });
          message.success(t.resources.deleteSuccess);
          refresh();
        } catch (error: any) {
          message.error(t.resources.deleteFailed + (error.message || ''));
        }
      },
    });
  };

  const openCreateDialog = () => {
    setEditingResource(null);
    setDialogOpen(true);
  };

  const columns: ColumnsType<Resource> = [
    {
      title: t.resources.tableName, dataIndex: 'name', key: 'name',
      render: (name: string) => <span><CloudServerOutlined style={{ marginRight: 6, color: themeToken.colorTextSecondary }} /><Text strong>{name}</Text></span>,
    },
    {
      title: t.resources.tableIp, dataIndex: 'ip_address', key: 'ip_address',
      render: (ip: string) => <Text code>{ip}</Text>,
    },
    {
      title: t.resources.tablePort, dataIndex: 'port', key: 'port',
      render: (port: string) => port ? <Text code>{port}</Text> : <Text type="secondary">{t.resources.allPorts}</Text>,
    },
    {
      title: t.resources.tableDesc, dataIndex: 'description', key: 'description', ellipsis: true,
      render: (desc: string) => <Text type="secondary">{desc || '-'}</Text>,
    },
    {
      title: t.resources.tableCreatedAt, dataIndex: 'CreatedAt', key: 'CreatedAt',
      render: (d: string) => new Date(d).toLocaleString('zh-CN'),
    },
    {
      title: t.resources.tableActions, key: 'actions', align: 'right',
      render: (_: any, record: Resource) => (
        <Space>
          <Tooltip title={t.common.actions.edit}>
            <Button type="text" icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          </Tooltip>
          <Tooltip title={t.common.actions.delete}>
            <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={() => handleDelete(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="page-header-row">
          <div>
            <Title level={4} className="m-0">{t.resources.title}</Title>
            <Text type="secondary">{t.resources.description}</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={refresh} loading={loading}>{t.common.actions.refresh}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDialog} data-tour-id="resources-create">{t.resources.addResource}</Button>
          </Space>
        </div>

        {/* Stats */}
        <PageHeaderStatCards
          minCardWidth={200}
          gap={16}
          items={[
            { label: t.resources.totalResources, value: resources.length, icon: <CloudServerOutlined className="stat-icon-primary" />, watermark: 'ALL' },
            { label: t.resources.withPort, value: resources.filter(r => r.port).length, icon: <ApiOutlined className="stat-icon-success" />, watermark: 'PORT' },
            { label: t.resources.withoutPort, value: resources.filter(r => !r.port).length, icon: <GlobalOutlined className="stat-icon-warn" />, watermark: 'ANY' },
          ]}
        />

        {/* Table */}
        <Card>
          <div className="mb-4">
            <Input data-tour-id="resources-search" prefix={<SearchOutlined />} placeholder={t.resources.searchPlaceholder} value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} className="max-w-90" allowClear />
          </div>
          <Table
            columns={columns}
            dataSource={resources}
            rowKey="ID"
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
            locale={{ emptyText: t.resources.noData }}
          />
        </Card>

        <ResourceModal
          open={dialogOpen}
          editingResource={editingResource}
          onCancel={() => setDialogOpen(false)}
          onSuccess={() => { setDialogOpen(false); refresh(); }}
        />
      </div>
    </DashboardLayout>
  );
}
