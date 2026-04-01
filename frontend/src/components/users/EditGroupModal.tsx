import { useEffect, useState } from 'react';
import { Input, Modal, Typography, message } from 'antd';
import { groupsAPI } from '@/lib/api';
import type { NormalizedGroup } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface EditGroupModalProps {
  open: boolean;
  group: NormalizedGroup | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function EditGroupModal({ open, group, onCancel, onSuccess }: EditGroupModalProps) {
  const t = useTranslation();
  const [groupName, setGroupName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && group) {
      setGroupName(group.name);
    }
  }, [open, group]);

  const handleOk = async () => {
    if (!group || !groupName.trim()) {
      message.error(t.users.groupNameRequired);
      return;
    }

    setSaving(true);
    try {
      await groupsAPI.update({ id: group.ID, name: groupName.trim() });
      message.success(t.users.updateGroupSuccess);
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
      title={t.users.editGroupTitle}
      onCancel={onCancel}
      onOk={handleOk}
      okText={t.users.saveChanges}
      cancelText={t.common.actions.cancel}
      confirmLoading={saving}
      width={420}
    >
      <Text type="secondary" className="block mb-4">{t.users.editGroupDesc}</Text>
      <div>
        <Text className="form-label">{t.users.groupNameLabel}</Text>
        <Input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder={t.users.groupNamePlaceholder}
          onPressEnter={handleOk}
        />
      </div>
    </Modal>
  );
}
