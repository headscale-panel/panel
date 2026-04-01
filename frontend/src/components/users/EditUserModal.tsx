import { useEffect, useState } from 'react';
import { Input, Modal, Select, Space, Typography, message } from 'antd';
import { systemUsersAPI } from '@/lib/api';
import type { NormalizedGroup, NormalizedSystemUser } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface EditUserModalProps {
  open: boolean;
  user: NormalizedSystemUser | null;
  groups: NormalizedGroup[];
  onCancel: () => void;
  onSuccess: () => void;
}

const DEFAULT_FORM = {
  email: '',
  password: '',
  group_id: '',
  display_name: '',
};

export default function EditUserModal({ open, user, groups, onCancel, onSuccess }: EditUserModalProps) {
  const t = useTranslation();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setForm({
        email: user.email || '',
        password: '',
        group_id: user.group_id?.toString() || '',
        display_name: user.display_name || '',
      });
    }
  }, [open, user]);

  const handleOk = async () => {
    if (!user) return;

    setSaving(true);
    try {
      await systemUsersAPI.update({
        id: user.ID,
        email: form.email,
        group_id: form.group_id ? parseInt(form.group_id, 10) : undefined,
        display_name: form.display_name,
        password: form.password || undefined,
      });
      message.success(t.users.updateUserSuccess);
      onCancel();
      onSuccess();
    } catch (error: any) {
      message.error(t.users.updateFailed + (error.message || t.common.errors.systemError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t.users.editUserTitle.replace('{username}', user?.username || '')}
      onCancel={onCancel}
      onOk={handleOk}
      okText={t.users.saveChanges}
      cancelText={t.common.actions.cancel}
      confirmLoading={saving}
      width={500}
    >
      <Text type="secondary" className="modal-desc">{t.users.editUserDesc}</Text>
      <Space direction="vertical" className="w-full" size={12}>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.emailLabel}</Text>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.displayNameLabel}</Text>
          <Input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.newPasswordLabel}</Text>
          <Input.Password
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={t.users.newPasswordPlaceholder}
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.groupLabel}</Text>
          <Select
            value={form.group_id || undefined}
            onChange={(value) => setForm({ ...form, group_id: value || '' })}
            placeholder={t.users.groupPlaceholder}
            allowClear
            className="w-full"
            options={[
              { value: '', label: t.users.noGroup },
              ...groups.map(g => ({ value: String(g.ID), label: g.name })),
            ]}
          />
        </div>
      </Space>
    </Modal>
  );
}
