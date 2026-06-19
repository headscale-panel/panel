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

import type { Monaco } from '@monaco-editor/react';
import Editor, { loader } from '@monaco-editor/react';
import { Button, message, Modal, theme, Typography } from 'antd';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { jsonDefaults } from 'monaco-editor/esm/vs/language/json/monaco.contribution';
import { useState } from 'react';
import { aclApi } from '@/api';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker?: (_workerId: string, label: string) => Worker;
  };
};

if (!monacoGlobal.MonacoEnvironment?.getWorker) {
  monacoGlobal.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') {
        return new JsonWorker();
      }
      return new EditorWorker();
    },
  };
}

loader.config({ monaco });

function configureJsonLanguage(monacoInstance: Monaco) {
  monacoInstance.languages.register({ id: 'json' });
  jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    trailingCommas: 'ignore',
  });
}

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
  const [checking, setChecking] = useState(false);

  const handleAfterOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setJsonContent(initialJson);
    }
  };

  const handleOk = async () => {
    setSaving(true);
    try {
      await aclApi.setPolicyRaw({ policy: jsonContent });
      message.success(t.acl.importSuccess);
      onCancel();
      onSuccess();
    } catch {
      message.error(t.acl.importFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      await aclApi.checkPolicy({ policy: jsonContent });
      message.success(t.acl.policyCheckSuccess);
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { msg?: string } } })?.response?.data?.msg;
      message.error(detail || t.acl.policyCheckFailed);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t.acl.jsonEditorTitle}
      width={900}
      onCancel={onCancel}
      afterOpenChange={handleAfterOpenChange}
      styles={{ body: { height: '60vh', padding: 0 } }}
      footer={[
        <Button key="cancel" onClick={onCancel}>{t.common.actions.cancel}</Button>,
        <Button key="check" onClick={handleCheck} loading={checking}>{t.acl.checkPolicy}</Button>,
        <Button key="ok" type="primary" onClick={handleOk} loading={saving}>{t.acl.saveAndApply}</Button>,
      ]}
    >
      <Text type="secondary" className="block pb-2">{t.acl.jsonEditorDesc}</Text>
      <div style={{ height: 'calc(60vh - 40px)', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, overflow: 'hidden' }}>
        <Editor
          beforeMount={configureJsonLanguage}
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
