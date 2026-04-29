import type { HeadscaleGroupOption } from './CreateUserModal';
import type { NormalizedHeadscaleUser } from '@/lib/normalizers';
import { Input, message, Modal, Select, Space, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface EditUserModalProps {
  open: boolean;
  user: NormalizedHeadscaleUser | null;
  groups: HeadscaleGroupOption[];
  currentGroupName?: string;
  onCancel: () => void;
  onSuccess: () => void;
  onSave: (payload: { oldName: string; newName: string; displayName: string; email: string; groupName?: string }) => Promise<void>;
}

const DEFAULT_FORM = {
  username: '',
  displayName: '',
  email: '',
  groupName: undefined as string | undefined,
};

export default function EditUserModal({
  open,
  user,
  groups,
  currentGroupName,
  onCancel,
  onSuccess,
  onSave,
}: EditUserModalProps) {
  const t = useTranslation();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const handleAfterOpenChange = (nextOpen: boolean) => {
    if (!nextOpen || !user)
      return;

    setForm({
      username: user.headscale_name || user.username,
      displayName: user.display_name || '',
      email: user.email || '',
      groupName: currentGroupName,
    });
  };

  const handleOk = async () => {
    if (!user)
      return;

    const newName = form.username.trim();
    const displayName = form.displayName.trim();
    const email = form.email.trim();
    if (!newName || !displayName || !email) {
      message.error(t.users.requiredEditFields);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        oldName: user.headscale_name || user.username,
        newName,
        displayName,
        email,
        groupName: form.groupName,
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
      title={t.users.editUserTitle.replace('{username}', user?.headscale_name || user?.username || '')}
      onCancel={onCancel}
      afterOpenChange={handleAfterOpenChange}
      onOk={handleOk}
      okText={t.users.saveChanges}
      cancelText={t.common.actions.cancel}
      confirmLoading={saving}
      width={500}
    >
      <Text type="secondary" className="modal-desc">{t.users.editUserDesc}</Text>
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
          <Text className="text-right text-13px">
            {t.users.displayNameLabel}
            {' '}
            *
          </Text>
          <Input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder={t.users.displayNameLabel}
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">
            {t.users.emailLabel}
            {' '}
            *
          </Text>
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
