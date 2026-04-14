import { useEffect, useState } from 'react';
import { Input, Modal, Select, Typography, message } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import { panelAccountsAPI } from '@/lib/api';
import type { NormalizedGroup } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface Props {
  open: boolean;
  groups: NormalizedGroup[];
  onCancel: () => void;
  onSuccess: () => void;
}

const DEFAULT_FORM = {
  username: '',
  email: '',
  password: '',
  group_id: undefined as number | undefined,
};

export default function CreateAccountModal({ open, groups, onCancel, onSuccess }: Props) {
  const t = useTranslation();
  const pa = t.panelAccounts;
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(DEFAULT_FORM);
  }, [open]);

  const handleOk = async () => {
    if (!form.username) {
      message.warning(pa.create.usernameLabel);
      return;
    }
    if (!form.password) {
      message.warning(pa.create.passwordLabel);
      return;
    }
    setSaving(true);
    try {
      await panelAccountsAPI.create({
        username: form.username,
        password: form.password,
        email: form.email || undefined,
        group_id: form.group_id,
      });
      message.success(pa.toast.createSuccess.replace('{username}', form.username));
      onSuccess();
    } catch (error: any) {
      message.error(error?.message || pa.toast.loadFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={<span><UserAddOutlined className="mr-2" />{pa.create.title}</span>}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={saving}
      width={480}
      destroyOnHidden
    >
      <Text type="secondary" className="block mb-16px">{pa.create.description}</Text>

      <div className="flex flex-col gap-12px">
        <div>
          <Text className="block mb-4px">{pa.create.usernameLabel}</Text>
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder={pa.create.usernamePlaceholder}
          />
        </div>
        <div>
          <Text className="block mb-4px">{pa.create.passwordLabel}</Text>
          <Input.Password
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={pa.create.passwordPlaceholder}
          />
        </div>
        <div>
          <Text className="block mb-4px">{pa.create.emailLabel}</Text>
          <Input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder={pa.create.emailPlaceholder}
          />
        </div>
        <div>
          <Text className="block mb-4px">{pa.create.groupLabel}</Text>
          <Select
            value={form.group_id}
            onChange={(v) => setForm({ ...form, group_id: v })}
            placeholder={pa.create.groupPlaceholder}
            allowClear
            style={{ width: '100%' }}
            options={[
              ...groups.map((g) => ({ label: g.name, value: g.ID })),
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}
