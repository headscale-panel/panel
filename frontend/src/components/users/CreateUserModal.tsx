import { useEffect, useState } from 'react';
import { Input, Modal, Select, Space, Typography, message } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

export interface HeadscaleGroupOption {
  name: string;
}

interface CreateUserModalProps {
  open: boolean;
  groups: HeadscaleGroupOption[];
  onCancel: () => void;
  onSuccess: () => void;
  onCreate: (payload: { username: string; displayName: string; email: string; groupName?: string }) => Promise<void>;
}

const DEFAULT_FORM = {
  username: '',
  displayName: '',
  email: '',
  groupName: undefined as string | undefined,
};

export default function CreateUserModal({ open, groups, onCancel, onSuccess, onCreate }: CreateUserModalProps) {
  const t = useTranslation();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(DEFAULT_FORM);
    }
  }, [open]);

  const handleOk = async () => {
    const username = form.username.trim();
    const displayName = form.displayName.trim();
    const email = form.email.trim();
    if (!username || !displayName || !email) {
      message.error(t.users.requiredCreateFields);
      return;
    }

    setSaving(true);
    try {
      await onCreate({
        username,
        displayName,
        email,
        groupName: form.groupName,
      });
      message.success(t.users.createUserSuccess.replace('{username}', username));
      onCancel();
      onSuccess();
    } catch (error: any) {
      message.error(t.users.createFailed + (error.message || t.common.errors.systemError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={<span><UserAddOutlined className="mr-2" />{t.users.createUserTitle}</span>}
      onCancel={onCancel}
      onOk={handleOk}
      okText={t.users.createUserBtn}
      cancelText={t.common.actions.cancel}
      confirmLoading={saving}
      width={500}
    >
      <Text type="secondary" className="modal-desc">
        {t.users.createUserDesc}
      </Text>
      <Space direction="vertical" className="w-full" size={12}>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.usernameLabel}</Text>
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder={t.users.usernamePlaceholder}
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.displayNameLabel} *</Text>
          <Input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder={t.users.displayNameLabel}
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.emailLabel} *</Text>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="user@example.com"
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.groupLabel}</Text>
          <Select
            value={form.groupName}
            onChange={(value) => setForm({ ...form, groupName: value })}
            placeholder={t.users.groupPlaceholder}
            allowClear
            className="w-full"
            options={groups.map((group) => ({ value: group.name, label: group.name }))}
          />
        </div>
      </Space>
    </Modal>
  );
}
