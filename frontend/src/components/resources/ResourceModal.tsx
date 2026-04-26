import { useEffect, useState } from 'react';
import { Input, Modal, Space, Typography, message } from 'antd';
import { resourceApi } from '@/api';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface Resource {
  ID: number;
  name: string;
  ip_address: string;
  port: string;
  description?: string;
}

interface ResourceModalProps {
  open: boolean;
  editingResource: Resource | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function ResourceModal({ open, editingResource, onCancel, onSuccess }: ResourceModalProps) {
  const t = useTranslation();
  const [formData, setFormData] = useState({ name: '', ip_address: '', port: '', description: '' });

  useEffect(() => {
    if (open) {
      if (editingResource) {
        setFormData({ name: editingResource.name, ip_address: editingResource.ip_address, port: editingResource.port || '', description: editingResource.description || '' });
      } else {
        setFormData({ name: '', ip_address: '', port: '', description: '' });
      }
    }
  }, [open, editingResource]);

  const handleSave = async () => {
    if (!formData.name || !formData.ip_address) {
      message.error(t.resources.requiredFields);
      return;
    }
    try {
      if (editingResource) {
        await resourceApi.update({ id: editingResource.ID, ...formData });
        message.success(t.resources.updateSuccess);
      } else {
        await resourceApi.create(formData);
        message.success(t.resources.createSuccess);
      }
      onSuccess();
    } catch (error: any) {
      message.error((editingResource ? t.resources.updateFailed : t.resources.createFailed) + (error.message || ''));
    }
  };

  return (
    <Modal
      title={editingResource ? t.resources.editResourceTitle : t.resources.addResourceTitle}
      open={open}
      onCancel={onCancel}
      onOk={handleSave}
      okText={editingResource ? t.common.actions.save : t.common.actions.create}
      cancelText={t.common.actions.cancel}
    >
      <Space direction="vertical" size="middle" className="w-full mt-4">
        <div>
          <Text className="form-label">{t.resources.nameLabel}</Text>
          <Input placeholder={t.resources.namePlaceholder} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <Text type="secondary" className="text-12px">{t.resources.nameHint}</Text>
        </div>
        <div>
          <Text className="form-label">{t.resources.ipLabel}</Text>
          <Input placeholder={t.resources.ipPlaceholder} value={formData.ip_address} onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })} />
          <Text type="secondary" className="text-12px">{t.resources.ipHint}</Text>
        </div>
        <div>
          <Text className="form-label">{t.resources.portLabel}</Text>
          <Input placeholder={t.resources.portPlaceholder} value={formData.port} onChange={(e) => setFormData({ ...formData, port: e.target.value })} />
          <Text type="secondary" className="text-12px">{t.resources.portHint}</Text>
        </div>
        <div>
          <Text className="form-label">{t.resources.descriptionLabel}</Text>
          <Input placeholder={t.resources.descriptionPlaceholder} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        </div>
      </Space>
    </Modal>
  );
}
