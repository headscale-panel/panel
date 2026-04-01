import { useEffect, useState } from 'react';
import { Input, Modal, Typography, message } from 'antd';
import { devicesAPI } from '@/lib/api';
import type { NormalizedDevice } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface RenameDeviceModalProps {
  open: boolean;
  device: NormalizedDevice | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function RenameDeviceModal({ open, device, onCancel, onSuccess }: RenameDeviceModalProps) {
  const t = useTranslation();
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && device) {
      setNewName((device.given_name || device.name).toLowerCase());
      setNameError('');
    }
  }, [open, device]);

  const validateName = (value: string): string => {
    if (value && !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
      return t.devices.nameLowercaseError;
    }
    return '';
  };

  const handleNameChange = (value: string) => {
    const lower = value.toLowerCase();
    setNewName(lower);
    setNameError(validateName(lower));
  };

  const handleOk = async () => {
    if (!device || !newName.trim()) return;

    const error = validateName(newName.trim());
    if (error) {
      setNameError(error);
      return;
    }

    setSaving(true);
    try {
      await devicesAPI.rename(device.id, newName.trim());
      message.success(t.devices.renameSuccess);
      onCancel();
      onSuccess();
    } catch (error: any) {
      message.error(t.devices.renameFailed + (error.message || t.common.errors.unknownError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t.devices.renameDialogTitle}
      onCancel={onCancel}
      onOk={handleOk}
      okText={t.common.actions.save}
      cancelText={t.common.actions.cancel}
      okButtonProps={{ disabled: !!nameError || !newName.trim() }}
      confirmLoading={saving}
      width={460}
    >
      <Text type="secondary" className="block mb-4">
        {t.devices.renameDialogDesc.replace('{name}', device?.name || '')}
      </Text>
      <div>
        <Text className="form-label">{t.devices.newNameLabel}</Text>
        <Input
          value={newName}
          onChange={(e) => handleNameChange(e.target.value)}
          status={nameError ? 'error' : undefined}
          onPressEnter={handleOk}
        />
        {nameError && <Text type="danger" className="text-12px mt-1 block">{nameError}</Text>}
        <Text type="secondary" className="text-12px mt-1 block">{t.devices.nameLowercaseHint}</Text>
      </div>
    </Modal>
  );
}
