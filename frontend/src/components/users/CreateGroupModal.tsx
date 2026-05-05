/*
 * Copyright (C) 2026 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { Input, message, Modal, Typography } from 'antd';
import { useState } from 'react';
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

  const handleAfterOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setGroupName('');
    }
  };

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
      afterOpenChange={handleAfterOpenChange}
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
