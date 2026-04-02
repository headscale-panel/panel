import { useEffect, useState } from 'react';
import { Input, Modal, Select, Typography, message } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { panelAccountsAPI } from '@/lib/api';
import type { PanelAccountListItem } from '@/api/panel-account.types';
import type { NormalizedGroup } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface Props {
  open: boolean;
  account: PanelAccountListItem | null;
  groups: NormalizedGroup[];
  onCancel: () => void;
  onSuccess: () => void;
}

export default function EditAccountModal({ open, account, groups, onCancel, onSuccess }: Props) {
  const t = useTranslation();
  const pa = t.panelAccounts;
  const [form, setForm] = useState({
    email: '',
    display_name: '',
    password: '',
    group_id: undefined as number | undefined,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && account) {
      setForm({
        email: account.email || '',
        display_name: account.display_name || '',
        password: '',
        group_id: account.group?.id,
      });
    }
  }, [open, account]);

  const handleOk = async () => {
    if (!account) return;
    setSaving(true);
    try {
      await panelAccountsAPI.update(account.id, {
        email: form.email || undefined,
        display_name: form.display_name || undefined,
        password: form.password || undefined,
        group_id: form.group_id,
      });
      message.success(pa.toast.updateSuccess);
      onSuccess();
    } catch (error: any) {
      message.error(error?.message || pa.toast.loadFailed);
    } finally {
      setSaving(false);
    }
  };

  const title = account
    ? pa.edit.title.replace('{username}', account.username)
    : pa.edit.title;

  return (
    <Modal
      open={open}
      title={<span><EditOutlined className="mr-2" />{title}</span>}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={saving}
      width={480}
      destroyOnClose
    >
      <Text type="secondary" className="block mb-16px">{pa.edit.description}</Text>

      <div className="flex flex-col gap-12px">
        <div>
          <Text className="block mb-4px">{pa.create.emailLabel}</Text>
          <Input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder={pa.create.emailPlaceholder}
          />
        </div>
        <div>
          <Text className="block mb-4px">{pa.create.displayNameLabel}</Text>
          <Input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder={pa.create.displayNamePlaceholder}
          />
        </div>
        <div>
          <Text className="block mb-4px">{pa.edit.newPasswordLabel}</Text>
          <Input.Password
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={pa.edit.newPasswordPlaceholder}
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
            options={groups.map((g) => ({ label: g.name, value: g.ID }))}
          />
        </div>
      </div>
    </Modal>
  );
}
