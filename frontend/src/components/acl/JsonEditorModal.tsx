import { useEffect, useState } from 'react';
import { Button, Modal, Typography, message, theme } from 'antd';
import Editor from '@monaco-editor/react';
import { aclAPI } from '@/lib/api';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface JsonEditorModalProps {
  open: boolean;
  initialJson: string;
  isDarkMode: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function JsonEditorModal({ open, initialJson, isDarkMode, onCancel, onSuccess }: JsonEditorModalProps) {
  const t = useTranslation();
  const { token } = theme.useToken();
  const [jsonContent, setJsonContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setJsonContent(initialJson);
    }
  }, [open, initialJson]);

  const handleOk = async () => {
    setSaving(true);
    try {
      await aclAPI.setPolicyRaw(jsonContent);
      message.success(t.acl.importSuccess);
      onCancel();
      onSuccess();
    } catch {
      message.error(t.acl.importFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t.acl.jsonEditorTitle}
      width={900}
      onCancel={onCancel}
      styles={{ body: { height: '60vh', padding: 0 } }}
      footer={[
        <Button key="cancel" onClick={onCancel}>{t.common.actions.cancel}</Button>,
        <Button key="ok" type="primary" onClick={handleOk} loading={saving}>{t.acl.saveAndApply}</Button>,
      ]}
    >
      <Text type="secondary" className="block pb-2">{t.acl.jsonEditorDesc}</Text>
      <div style={{ height: 'calc(60vh - 40px)', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, overflow: 'hidden' }}>
        <Editor
          height="100%"
          language="json"
          theme={isDarkMode ? 'vs-dark' : 'light'}
          value={jsonContent}
          onChange={(value) => setJsonContent(value || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>
    </Modal>
  );
}
