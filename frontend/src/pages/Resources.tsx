import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/index';
import { Button, Card, Input, Modal, Table, Tooltip, Statistic, Space, Typography, message, theme } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined, CloudServerOutlined, GlobalOutlined, ApiOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DashboardLayout from '@/components/DashboardLayout';
import { resourcesAPI } from '@/lib/api';

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
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);

  const [formData, setFormData] = useState({ name: '', ip_address: '', port: '', description: '' });

  useEffect(() => { loadResources(); }, []);

  const loadResources = async () => {
    try {
      setLoading(true);
      const res = await resourcesAPI.list();
      setResources((res as any).list || []);
    } catch (error: any) {
      console.error(error);
      message.error(t.resources.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.ip_address) {
      message.error(t.resources.requiredFields);
      return;
    }
    try {
      if (editingResource) {
        await resourcesAPI.update(editingResource.ID, formData);
        message.success(t.resources.updateSuccess);
      } else {
        await resourcesAPI.create(formData);
        message.success(t.resources.createSuccess);
      }
      setDialogOpen(false);
      resetForm();
      loadResources();
    } catch (error: any) {
      message.error((editingResource ? t.resources.updateFailed : t.resources.createFailed) + (error.message || ''));
    }
  };

  const handleEdit = (resource: Resource) => {
    setEditingResource(resource);
    setFormData({ name: resource.name, ip_address: resource.ip_address, port: resource.port || '', description: resource.description || '' });
    setDialogOpen(true);
  };

  const handleDelete = (resource: Resource) => {
    Modal.confirm({
      title: t.common.actions.delete,
      content: t.resources.confirmDelete.replace('{name}', resource.name),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await resourcesAPI.delete(resource.ID);
          message.success(t.resources.deleteSuccess);
          loadResources();
        } catch (error: any) {
          message.error(t.resources.deleteFailed + (error.message || ''));
        }
      },
    });
  };

  const resetForm = () => {
    setFormData({ name: '', ip_address: '', port: '', description: '' });
    setEditingResource(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const filteredResources = resources.filter((resource) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return resource.name.toLowerCase().includes(q) || resource.ip_address.toLowerCase().includes(q) || (resource.description && resource.description.toLowerCase().includes(q));
  });

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{t.resources.title}</Title>
            <Text type="secondary">{t.resources.description}</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={loadResources} loading={loading}>{t.common.actions.refresh}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDialog}>{t.resources.addResource}</Button>
          </Space>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          <Card hoverable><Statistic title={t.resources.totalResources} value={resources.length} prefix={<CloudServerOutlined />} /></Card>
          <Card hoverable><Statistic title={t.resources.withPort} value={resources.filter(r => r.port).length} prefix={<ApiOutlined />} valueStyle={{ color: '#52c41a' }} /></Card>
          <Card hoverable><Statistic title={t.resources.withoutPort} value={resources.filter(r => !r.port).length} prefix={<GlobalOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card>
        </div>

        {/* Table */}
        <Card>
          <div style={{ marginBottom: 16 }}>
            <Input prefix={<SearchOutlined />} placeholder={t.resources.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ maxWidth: 360 }} allowClear />
          </div>
          <Table columns={columns} dataSource={filteredResources} rowKey="ID" loading={loading} pagination={false} locale={{ emptyText: t.resources.noData }} />
        </Card>

        {/* Create/Edit Modal */}
        <Modal
          title={editingResource ? t.resources.editResourceTitle : t.resources.addResourceTitle}
          open={dialogOpen}
          onCancel={() => setDialogOpen(false)}
          onOk={handleSave}
          okText={editingResource ? t.common.actions.save : t.common.actions.create}
          cancelText={t.common.actions.cancel}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.resources.nameLabel}</Text>
              <Input placeholder={t.resources.namePlaceholder} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              <Text type="secondary" style={{ fontSize: 12 }}>{t.resources.nameHint}</Text>
            </div>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.resources.ipLabel}</Text>
              <Input placeholder={t.resources.ipPlaceholder} value={formData.ip_address} onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })} />
              <Text type="secondary" style={{ fontSize: 12 }}>{t.resources.ipHint}</Text>
            </div>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.resources.portLabel}</Text>
              <Input placeholder={t.resources.portPlaceholder} value={formData.port} onChange={(e) => setFormData({ ...formData, port: e.target.value })} />
              <Text type="secondary" style={{ fontSize: 12 }}>{t.resources.portHint}</Text>
            </div>
            <div>
              <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.resources.descriptionLabel}</Text>
              <Input placeholder={t.resources.descriptionPlaceholder} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
          </Space>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
