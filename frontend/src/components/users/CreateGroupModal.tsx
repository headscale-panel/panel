import { useEffect, useState } from 'react';
import { Input, Modal, Typography, message } from 'antd';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface CreateGroupModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  onCreate: (name: string) => Promise<void>;
}

export default function CreateGroupModal({ open, onCancel, onSuccess, onCreate }: CreateGroupModalProps) {
  const t = useTranslation();
  const [groupName, setGroupName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setGroupName('');
    }
  }, [open]);

  const handleOk = async () => {
    const nextName = groupName.trim();
    if (!nextName) {
      message.error(t.users.groupNameRequired);
      return;
    }

    setSaving(true);
    try {
      await onCreate(nextName);
      message.success(t.users.createGroupSuccess);
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
      title={t.users.createGroupTitle}
      onCancel={onCancel}
      onOk={handleOk}
      okText={t.common.actions.create}
      cancelText={t.common.actions.cancel}
      confirmLoading={saving}
      width={420}
    >
      <Text type="secondary" className="block mb-4">{t.users.createGroupDesc}</Text>
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
