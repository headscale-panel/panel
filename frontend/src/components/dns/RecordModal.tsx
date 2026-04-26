import { useEffect, useState } from 'react';
import { Input, Modal, Select, Space, Typography, message } from 'antd';
import { dnsApi } from '@/api';
import type { DNSRecord } from '@/api/entities';
import { DNSRecordType } from '@/lib/enums';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface RecordModalProps {
  open: boolean;
  editingRecord: DNSRecord | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function RecordModal({ open, editingRecord, onCancel, onSuccess }: RecordModalProps) {
  const t = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    type: DNSRecordType.A,
    value: '',
    comment: '',
  });

  useEffect(() => {
    if (open) {
      if (editingRecord) {
        setFormData({ name: editingRecord.name, type: editingRecord.type, value: editingRecord.value, comment: editingRecord.comment || '' });
      } else {
        setFormData({ name: '', type: DNSRecordType.A, value: '', comment: '' });
      }
    }
  }, [open, editingRecord]);

  const validateIPv4 = (ip: string) => /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
  const validateIPv6 = (ip: string) => /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/.test(ip);

  const isFormValid = () => {
    if (!formData.name || !formData.value) return false;
    if (formData.type === 'A' && !validateIPv4(formData.value)) return false;
    if (formData.type === 'AAAA' && !validateIPv6(formData.value)) return false;
    return true;
  };

  const handleSubmit = async () => {
    try {
      if (editingRecord) {
        await dnsApi.update({ id: editingRecord.id, ...formData });
        message.success(t.dns.recordUpdated);
      } else {
        await dnsApi.create(formData);
        message.success(t.dns.recordCreated);
      }
      onSuccess();
    } catch (error: any) {
      message.error(error.message || t.common.errors.operationFailed);
    }
  };

  return (
    <Modal
      title={editingRecord ? t.dns.editRecordTitle : t.dns.addRecordTitle}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText={editingRecord ? t.common.actions.save : t.common.actions.create}
      cancelText={t.common.actions.cancel}
      okButtonProps={{ disabled: !isFormValid() }}
    >
      <Space direction="vertical" size="middle" className="form-stack">
        <div className="field-block">
          <Text className="field-label">{t.dns.domainLabel}</Text>
          <Input placeholder={t.dns.domainPlaceholder} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        </div>
        <div className="field-block">
          <Text className="field-label">{t.dns.typeLabel}</Text>
          <Select value={formData.type} onChange={(v: DNSRecordType) => setFormData({ ...formData, type: v })} className="full-width"
            options={[{ value: 'A', label: 'A (IPv4)' }, { value: 'AAAA', label: 'AAAA (IPv6)' }]}
          />
        </div>
        <div className="field-block">
          <Text className="field-label">{t.dns.ipLabel}</Text>
          <Input placeholder={formData.type === 'A' ? '192.168.1.100' : '2001:db8::1'} value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} />
          {formData.value && formData.type === 'A' && !validateIPv4(formData.value) && <Text type="danger" className="field-hint-error">{t.dns.invalidIpv4}</Text>}
          {formData.value && formData.type === 'AAAA' && !validateIPv6(formData.value) && <Text type="danger" className="field-hint-error">{t.dns.invalidIpv6}</Text>}
        </div>
        <div className="field-block">
          <Text className="field-label">{t.dns.commentLabel}</Text>
          <Input placeholder={t.dns.commentPlaceholder} value={formData.comment} onChange={(e) => setFormData({ ...formData, comment: e.target.value })} />
        </div>
      </Space>
    </Modal>
  );
}
