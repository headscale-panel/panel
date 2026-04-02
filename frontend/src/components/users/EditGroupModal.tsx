import { useEffect, useState } from 'react';
import { Input, Modal, Typography, message } from 'antd';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface GroupLike {
  name: string;
}

interface EditGroupModalProps {
  open: boolean;
  group: GroupLike | null;
  onCancel: () => void;
  onSuccess: () => void;
  onSave: (nextName: string) => Promise<void>;
}

export default function EditGroupModal({ open, group, onCancel, onSuccess, onSave }: EditGroupModalProps) {
  const t = useTranslation();
  const [groupName, setGroupName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && group) {
      setGroupName(group.name);
    }
  }, [open, group]);

  const handleOk = async () => {
    const nextName = groupName.trim();
    if (!group || !nextName) {
      message.error(t.users.groupNameRequired);
      return;
    }

    setSaving(true);
    try {
      await onSave(nextName);
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
