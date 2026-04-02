import { useEffect, useState } from 'react';
import { Input, Modal, Select, Space, Typography, message } from 'antd';
import { useTranslation } from '@/i18n/index';
import type { NormalizedHeadscaleUser } from '@/lib/normalizers';
import type { HeadscaleGroupOption } from './CreateUserModal';

const { Text } = Typography;

interface EditUserModalProps {
  open: boolean;
  user: NormalizedHeadscaleUser | null;
  groups: HeadscaleGroupOption[];
  currentGroupName?: string;
  onCancel: () => void;
  onSuccess: () => void;
  onSave: (payload: { oldName: string; newName: string; groupName?: string }) => Promise<void>;
}

const DEFAULT_FORM = {
  username: '',
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

  useEffect(() => {
    if (open && user) {
      setForm({
        username: user.headscale_name || user.username,
        groupName: currentGroupName,
      });
    }
  }, [open, user, currentGroupName]);

  const handleOk = async () => {
    if (!user) return;

    const newName = form.username.trim();
    if (!newName) {
      message.error(t.users.requiredFieldsOidc);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        oldName: user.headscale_name || user.username,
        newName,
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
