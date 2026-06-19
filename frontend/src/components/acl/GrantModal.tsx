/*
 * Copyright (C) 2026
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ACLPolicy } from '@/lib/normalizers';
import { Button, Input, message, Modal, Select, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { aclApi } from '@/api';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

export interface GrantRuleValue {
  src: string[];
  dst: string[];
  ip?: string | string[];
  app?: Record<string, unknown>;
  via?: string[];
}

interface GrantModalProps {
  open: boolean;
  editingGrant: GrantRuleValue | null;
  editingIndex: number;
  policy: ACLPolicy | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function GrantModal({ open, editingGrant, editingIndex, policy, onCancel, onSuccess }: GrantModalProps) {
  const t = useTranslation();
  const [src, setSrc] = useState<string[]>([]);
  const [dst, setDst] = useState<string[]>([]);
  const [ip, setIP] = useState<string[]>(['*']);
  const [via, setVia] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const selectors = useMemo(() => {
    const values = new Set<string>(['*', 'autogroup:member', 'autogroup:tagged', 'autogroup:self', 'autogroup:internet']);
    Object.keys(policy?.groups || {}).forEach((value) => values.add(value));
    Object.keys(policy?.tagOwners || {}).forEach((value) => values.add(value));
    Object.keys(policy?.hosts || {}).forEach((value) => values.add(value));
    return [...values].map((value) => ({ label: value, value }));
  }, [policy]);

  const afterOpenChange = (nextOpen: boolean) => {
    if (!nextOpen)
      return;
    setSrc(editingGrant?.src ? [...editingGrant.src] : []);
    setDst(editingGrant?.dst ? [...editingGrant.dst] : []);
    const capabilities = editingGrant?.ip;
    setIP(typeof capabilities === 'string' ? [capabilities] : capabilities ? [...capabilities] : ['*']);
    setVia(editingGrant?.via ? [...editingGrant.via] : []);
  };

  const save = async () => {
    if (!policy || src.length === 0 || dst.length === 0 || (ip.length === 0 && !editingGrant?.app)) {
      message.error(t.acl.grantIncomplete);
      return;
    }
    const grant: GrantRuleValue = {
      ...(editingGrant?.app ? { app: editingGrant.app } : {}),
      src,
      dst,
      ...(ip.length ? { ip } : {}),
      ...(via.length ? { via } : {}),
    };
    const grants = [...(policy.grants || [])];
    if (editingIndex >= 0)
      grants[editingIndex] = grant;
    else
      grants.push(grant);

    setSaving(true);
    try {
      await aclApi.updatePolicy({ ...policy, grants });
      message.success(editingIndex >= 0 ? t.acl.grantUpdated : t.acl.grantAdded);
      onCancel();
      onSuccess();
    } catch {
      message.error(t.acl.grantSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editingIndex >= 0 ? t.acl.editGrant : t.acl.addGrant}
      width={720}
      onCancel={onCancel}
      afterOpenChange={afterOpenChange}
      footer={[
        <Button key="cancel" onClick={onCancel}>{t.common.actions.cancel}</Button>,
        <Button key="save" type="primary" loading={saving} onClick={save}>{t.common.actions.save}</Button>,
      ]}
    >
      <Text type="secondary" className="block mb-4">{t.acl.grantDesc}</Text>
      <Space direction="vertical" className="w-full" size={16}>
        <div>
          <Text className="field-label">{t.acl.sourceLabel}</Text>
          <Select mode="tags" value={src} options={selectors} onChange={setSrc} className="w-full" tokenSeparators={[',']} />
        </div>
        <div>
          <Text className="field-label">{t.acl.destinationLabel}</Text>
          <Select mode="tags" value={dst} options={selectors} onChange={setDst} className="w-full" tokenSeparators={[',']} />
        </div>
        <div>
          <Text className="field-label">{t.acl.ipCapabilities}</Text>
          <Text type="secondary" className="text-12px block mb-2">{t.acl.ipCapabilitiesDesc}</Text>
          <Select
            mode="tags"
            value={ip}
            onChange={setIP}
            className="w-full"
            tokenSeparators={[',']}
            options={['*', 'tcp:22', 'tcp:80', 'tcp:443', 'udp:53', 'icmp:*'].map((value) => ({ label: value, value }))}
          />
        </div>
        <div>
          <Text className="field-label">{t.acl.viaTags}</Text>
          <Input placeholder="tag:router" value={via.join(', ')} onChange={(event) => setVia(event.target.value.split(',').map((v) => v.trim()).filter(Boolean))} />
        </div>
      </Space>
    </Modal>
  );
}
