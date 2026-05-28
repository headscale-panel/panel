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

import { UserAddOutlined } from '@ant-design/icons';
import { Alert, Input, message, Modal, Select, Space, Typography } from 'antd';
import { useState } from 'react';
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

  const handleAfterOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setForm(DEFAULT_FORM);
    }
  };

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
      title={(
        <span>
          <UserAddOutlined className="mr-2" />
          {t.users.createUserTitle}
        </span>
      )}
      onCancel={onCancel}
      afterOpenChange={handleAfterOpenChange}
      onOk={handleOk}
      okText={t.users.createUserBtn}
      cancelText={t.common.actions.cancel}
      confirmLoading={saving}
      width={500}
    >
      <Text type="secondary" className="modal-desc">
        {t.users.createUserDesc}
      </Text>
      <Alert
        type="warning"
        showIcon
        message={t.users.createUserOidcMergeWarning}
        className="mt-3 mb-1"
      />
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
