import { useEffect, useState } from 'react';
import { Input, Modal, Select, Space, Typography, message, theme } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import { systemUsersAPI } from '@/lib/api';
import type { NormalizedGroup, OIDCStatusData } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface CreateUserModalProps {
  open: boolean;
  groups: NormalizedGroup[];
  oidcStatus: OIDCStatusData;
  onCancel: () => void;
  onSuccess: () => void;
}

const DEFAULT_FORM = {
  username: '',
  email: '',
  password: '',
  group_id: '',
  display_name: '',
};

export default function CreateUserModal({ open, groups, oidcStatus, onCancel, onSuccess }: CreateUserModalProps) {
  const t = useTranslation();
  const { token } = theme.useToken();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(DEFAULT_FORM);
    }
  }, [open]);

  const handleOk = async () => {
    if (!form.username || (oidcStatus.password_required && !form.password)) {
      message.error(oidcStatus.password_required ? t.users.requiredFields : t.users.requiredFieldsOidc);
      return;
    }

    setSaving(true);
    try {
      await systemUsersAPI.create({
        username: form.username,
        password: form.password,
        email: form.email,
        group_id: form.group_id ? parseInt(form.group_id, 10) : undefined,
        display_name: form.display_name,
        headscale_name: form.username,
      });
      message.success(t.users.createUserSuccess.replace('{username}', form.username));
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
      title={<span><UserAddOutlined className="mr-2" />{t.users.createUserTitle}</span>}
      onCancel={onCancel}
      onOk={handleOk}
      okText={t.users.createUserBtn}
      cancelText={t.common.actions.cancel}
      confirmLoading={saving}
      width={500}
    >
      <Text type="secondary" className="modal-desc">
        {oidcStatus.third_party ? t.users.createUserDescOidc : t.users.createUserDesc}
      </Text>
      {oidcStatus.oidc_enabled && (
        <div style={{
          borderRadius: token.borderRadius, padding: '12px 16px', marginBottom: 16, fontSize: 13,
          background: oidcStatus.third_party ? token.colorInfoBg : token.colorWarningBg,
          border: `1px solid ${oidcStatus.third_party ? token.colorInfoBorder : token.colorWarningBorder}`,
        }}>
          {oidcStatus.third_party ? t.users.oidcModeHint : t.users.builtinOidcHint}
        </div>
      )}
      <Space direction="vertical" className="w-full" size={12}>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.usernameLabel}</Text>
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder={t.users.usernamePlaceholder}
          />
        </div>
        {oidcStatus.password_required && (
          <div className="form-grid-row">
            <Text className="text-right text-13px">{t.users.passwordLabel}</Text>
            <Input.Password
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t.users.passwordPlaceholder}
            />
          </div>
        )}
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.emailLabel}</Text>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.displayNameLabel}</Text>
          <Input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>
        <div className="form-grid-row">
          <Text className="text-right text-13px">{t.users.groupLabel}</Text>
          <Select
            value={form.group_id || undefined}
            onChange={(value) => setForm({ ...form, group_id: value || '' })}
            placeholder={t.users.groupPlaceholder}
            allowClear
            className="w-full"
            options={[
              { value: '', label: t.users.noGroup },
              ...groups.map(g => ({ value: String(g.ID), label: g.name })),
            ]}
          />
        </div>
      </Space>
    </Modal>
  );
}
