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

import type { NormalizedDevice } from '@/lib/normalizers';
import { InfoCircleOutlined, TagOutlined } from '@ant-design/icons';
import { Alert, message, Modal, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { aclApi, deviceApi } from '@/api';
import { useTranslation } from '@/i18n/index';
import { normalizeACLPolicy } from '@/lib/normalizers';

const { Text } = Typography;

interface EditDeviceTagsModalProps {
  open: boolean;
  device: NormalizedDevice | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function EditDeviceTagsModal({ open, device, onCancel, onSuccess }: EditDeviceTagsModalProps) {
  const t = useTranslation();
  const [saving, setSaving] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // A device that already has tags cannot have all tags removed (Headscale restriction)
  const deviceHasTags = (device?.tags || []).length > 0;
  const wouldClearAllTags = deviceHasTags && selectedTags.length === 0;

  // Load available tags from ACL policy when modal opens
  useEffect(() => {
    if (!open) {
      return;
    }

    // Init selected tags from device
    setSelectedTags(device?.tags || []);

    // Fetch ACL tagOwners
    setLoadingTags(true);
    aclApi.getPolicy()
      .then((res) => {
        const policy = normalizeACLPolicy(res);
        const owners = policy?.tagOwners ? Object.keys(policy.tagOwners) : [];
        setAvailableTags(owners);
      })
      .catch(() => {
        setAvailableTags([]);
      })
      .finally(() => {
        setLoadingTags(false);
      });
  }, [open, device]);

  const handleOk = async () => {
    if (!device) {
      return;
    }

    setSaving(true);
    try {
      await deviceApi.setTags({ id: device.id, tags: selectedTags });
      message.success(t.devices.updateTagsSuccess);
      onSuccess();
    } catch (error: any) {
      const msg: string = error?.response?.data?.message || error?.message || '';
      if (msg.includes('cannot remove all tags') || msg.includes('must have at least one tag')) {
        message.error(t.devices.updateTagsCannotClearHint);
      } else if (msg.includes('not permitted') || msg.includes('invalid')) {
        message.error(t.devices.updateTagsInvalidHint);
      } else {
        message.error(t.devices.updateTagsFailed + (msg ? `: ${msg}` : ''));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (saving) {
      return;
    }
    onCancel();
  };

  const deviceName = device?.given_name || device?.name || '';

  return (
    <Modal
      open={open}
      title={(
        <Space>
          <TagOutlined />
          {t.devices.editTags}
        </Space>
      )}
      onCancel={handleCancel}
      onOk={handleOk}
      okButtonProps={{ loading: saving, disabled: wouldClearAllTags }}
      okText={t.common.actions.save}
      cancelText={t.common.actions.cancel}
    >
      <Space direction="vertical" className="w-full" size={12}>
        {deviceName && (
          <Text type="secondary">
            {t.devices.editTagsDescription.replace('{name}', deviceName)}
          </Text>
        )}

        {availableTags.length === 0 && !loadingTags
          ? (
              <Alert
                type="warning"
                showIcon
                icon={<InfoCircleOutlined />}
                message={t.devices.noTagOwnersHint}
              />
            )
          : (
              <Select
                mode="multiple"
                className="w-full"
                value={selectedTags}
                onChange={setSelectedTags}
                loading={loadingTags}
                options={availableTags.map((tag) => ({ label: tag, value: tag }))}
                placeholder={t.devices.tagsSelectPlaceholder}
                allowClear={!deviceHasTags}
              />
            )}

        {wouldClearAllTags && (
          <Alert
            type="error"
            showIcon
            message={t.devices.updateTagsCannotClearHint}
          />
        )}

        <Text type="secondary" className="text-12px">
          <InfoCircleOutlined className="mr-1" />
          {t.devices.tagOwnersHint}
        </Text>
      </Space>
    </Modal>
  );
}
