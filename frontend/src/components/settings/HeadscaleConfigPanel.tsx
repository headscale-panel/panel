// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import type { MessageInstance } from 'antd/es/message/interface';
import type { ConfigField, ConfigOwnershipMode, HeadscaleConfigView } from '@/api/headscale-config.types';
import {
  CloseOutlined,
  CodeOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { headscaleConfigApi } from '@/api';
import { useTranslation } from '@/i18n/index';
import {
  ConfigFieldKind,
  ConfigOwnerKind,
  ConfigOwnershipModeEnum,
  EMPTY_DISPLAY_VALUE,
  REDACTED_SECRET_PLACEHOLDER,
} from '@/lib/enums';

const { Text } = Typography;

const DEFAULT_CONFIG_SECTION = 'general';
const YAML_MODAL_WIDTH = 720;

/** Initial form value for a field, based on its registry kind. */
function initialValue(field: ConfigField): unknown {
  if (field.secret)
    return field.value ? REDACTED_SECRET_PLACEHOLDER : '';
  if (field.kind === ConfigFieldKind.Bool)
    return field.value ?? false;
  if (field.kind === ConfigFieldKind.Strings)
    return Array.isArray(field.value) ? field.value : [];
  if (field.kind === ConfigFieldKind.StringMap)
    return field.value && typeof field.value === 'object' ? field.value : {};
  return field.value ?? '';
}

function renderValue(value: unknown): string {
  if (value === undefined || value === null)
    return EMPTY_DISPLAY_VALUE;
  if (Array.isArray(value))
    return value.join(', ');
  if (typeof value === 'object')
    return JSON.stringify(value);
  return String(value);
}

/**
 * The headscale config editor.
 *
 * Fields come from the backend's ownership registry, not from a hand-written form:
 * one declaration drives what is editable, what is read-only, and what the write
 * path will accept. Only changed managed keys are submitted, which is what keeps the
 * panel from rewriting the parts of the file it does not own.
 */
export default function HeadscaleConfigPanel({ message }: { message: MessageInstance }) {
  const t = useTranslation();

  const [view, setView] = useState<HeadscaleConfigView | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runningYaml, setRunningYaml] = useState<string | null>(null);
  const [runningLoading, setRunningLoading] = useState(false);

  const { loading, refresh } = useRequest(() => headscaleConfigApi.get(), {
    onSuccess: (data) => {
      setView(data ?? null);
      setDraft({});
    },
    onError: () => message.error(t.common.errors.requestFailed),
  });

  const fields = view?.fields ?? [];
  const sections = useMemo(() => {
    const grouped = new Map<string, ConfigField[]>();
    fields.forEach((field) => {
      const key = field.section || DEFAULT_CONFIG_SECTION;
      const list = grouped.get(key) ?? [];
      list.push(field);
      grouped.set(key, list);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [fields]);

  const dirtyKeys = Object.keys(draft);
  const mode = view?.mode ?? ConfigOwnershipModeEnum.Managed;
  const canWrite = mode === ConfigOwnershipModeEnum.Managed;

  const setValue = (key: string, value: unknown) =>
    setDraft((previous) => {
      const next = { ...previous };
      // Dropping the key when it returns to its loaded value keeps the submit set
      // minimal, so the panel never sends a value the operator did not touch.
      const loaded = fields.find((field) => field.key === key);
      const original = loaded ? initialValue(loaded) : undefined;
      if (JSON.stringify(original) === JSON.stringify(value))
        delete next[key];
      else
        next[key] = value;
      return next;
    });

  const handleSave = async () => {
    if (dirtyKeys.length === 0)
      return;
    setSaving(true);
    try {
      const result = await headscaleConfigApi.update({ values: draft });
      if (result?.blocked?.length) {
        message.warning(
          `${t.settings.hsconfig.blockedTitle}: ${result.blocked.map((entry) => entry.key).join(', ')}`,
        );
      }
      if (result?.restart?.requires_manual)
        message.info(result.restart.manual_hint || t.settings.hsconfig.restartManual);
      else
        message.success(t.settings.hsconfig.saveSuccess);
      refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const result = await headscaleConfigApi.preview(draft);
      setPreview(result?.yaml ?? '');
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleViewRunning = async () => {
    setRunningLoading(true);
    try {
      const result = await headscaleConfigApi.getRunning(true);
      setRunningYaml(result?.yaml ?? '');
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    } finally {
      setRunningLoading(false);
    }
  };

  const handleModeChange = async (next: ConfigOwnershipMode) => {
    setSwitchingMode(true);
    try {
      await headscaleConfigApi.updateMode({ mode: next });
      message.success(t.settings.toast.saved);
      refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || t.common.errors.requestFailed);
    } finally {
      setSwitchingMode(false);
    }
  };

  if (loading && !view)
    return <div className="flex justify-center py-60px"><Spin size="large" /></div>;

  const drift = view?.drift;
  const driftRows = drift?.drift ?? [];
  const missing = drift?.missing ?? [];
  const unmodelled = view?.unmodelled ?? [];

  return (
    <Space direction="vertical" size={16} className="w-full">
      <Card>
        <div className="flex justify-between items-start mb-4 gap-4 flex-wrap">
          <div>
            <Text strong className="text-15px">{t.settings.hsconfig.title}</Text>
            <div>
              <Text type="secondary" className="text-13px">
                {view?.configured ? view.path : `${view?.path ?? ''} (${t.settings.hsconfig.noFile})`}
              </Text>
            </div>
          </div>
          <Space>
            <Segmented
              value={mode}
              disabled={switchingMode}
              onChange={(value) => handleModeChange(value as ConfigOwnershipMode)}
              options={[
                { label: t.settings.hsconfig.modeManaged, value: 'managed' },
                { label: t.settings.hsconfig.modeObserved, value: 'observed' },
              ]}
            />
            <Button icon={<ReloadOutlined spin={loading} />} onClick={refresh} />
          </Space>
        </div>
        <Alert
          type={mode === 'managed' ? 'info' : 'warning'}
          showIcon
          message={mode === 'managed'
            ? t.settings.hsconfig.modeManagedHint
            : t.settings.hsconfig.modeObservedHint}
        />
      </Card>

      {driftRows.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t.settings.hsconfig.driftTitle}
          description={(
            <Table
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={driftRows}
              columns={[
                { title: t.settings.hsconfig.driftKey, dataIndex: 'key' },
                {
                  title: t.settings.hsconfig.driftFile,
                  dataIndex: 'in_file',
                  render: (value: unknown) => renderValue(value),
                },
                {
                  title: t.settings.hsconfig.driftExpected,
                  dataIndex: 'expected',
                  render: (value: unknown) => renderValue(value),
                },
              ]}
            />
          )}
        />
      )}

      {missing.length > 0 && (
        <Alert
          type="info"
          showIcon
          message={t.settings.hsconfig.missingTitle}
          description={missing.join(', ')}
        />
      )}

      {sections.map(([section, sectionFields]) => (
        <Card key={section} title={<Text strong className="text-14px">{section}</Text>}>
          <Space direction="vertical" className="w-full" size={16}>
            {sectionFields.map((field) => (
              <ConfigFieldRow
                key={field.key}
                field={field}
                value={field.key in draft ? draft[field.key] : initialValue(field)}
                disabled={!canWrite || field.owner !== 'managed'}
                readOnlyTag={t.settings.hsconfig.readOnlyTag}
                secretPlaceholder={t.settings.hsconfig.secretPlaceholder}
                onChange={(value) => setValue(field.key, value)}
              />
            ))}
          </Space>
        </Card>
      ))}

      {unmodelled.length > 0 && (
        <Card title={<Text strong className="text-14px">{t.settings.hsconfig.unmodelledTitle}</Text>}>
          <Space direction="vertical" className="w-full" size={8}>
            <Text type="secondary" className="text-12px">{t.settings.hsconfig.unmodelledHint}</Text>
            <Space wrap>
              {unmodelled.map((key) => <Tag key={key}>{key}</Tag>)}
            </Space>
          </Space>
        </Card>
      )}

      {!view?.configured && (
        <Alert type="info" showIcon message={t.settings.hsconfig.notGenerated} />
      )}

      <Card>
        <Space className="w-full" style={{ justifyContent: 'flex-end' }}>
          <Button
            icon={<CodeOutlined />}
            loading={runningLoading}
            onClick={handleViewRunning}
          >
            {t.settings.hsconfig.runningButton}
          </Button>
          <Button
            icon={<EyeOutlined />}
            loading={previewLoading}
            onClick={handlePreview}
          >
            {t.settings.hsconfig.previewButton}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!canWrite || dirtyKeys.length === 0}
            loading={saving}
            onClick={handleSave}
          >
            {t.settings.hsconfig.saveButton}
          </Button>
        </Space>
      </Card>

      <Modal
        open={preview !== null}
        title={t.settings.hsconfig.previewTitle}
        width={YAML_MODAL_WIDTH}
        footer={null}
        onCancel={() => setPreview(null)}
      >
        <pre className="text-12px whitespace-pre-wrap max-h-60vh overflow-auto">{preview}</pre>
      </Modal>

      <Modal
        open={runningYaml !== null}
        title={t.settings.hsconfig.runningTitle}
        width={YAML_MODAL_WIDTH}
        footer={null}
        onCancel={() => setRunningYaml(null)}
      >
        <pre className="text-12px whitespace-pre-wrap max-h-60vh overflow-auto">{runningYaml}</pre>
      </Modal>
    </Space>
  );
}

function ConfigFieldRow({
  field,
  value,
  disabled,
  readOnlyTag,
  secretPlaceholder,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  disabled: boolean;
  readOnlyTag: string;
  secretPlaceholder: string;
  onChange: (value: unknown) => void;
}) {
  const label = (
    <Space size={6}>
      <Text className="text-13px font-mono">{field.key}</Text>
      {field.owner === ConfigOwnerKind.ReadOnly && <Tag color="default">{readOnlyTag}</Tag>}
    </Space>
  );

  const control = () => {
    switch (field.kind) {
      case ConfigFieldKind.Bool:
        return (
          <Switch
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(checked) => onChange(checked)}
          />
        );
      case ConfigFieldKind.Int:
        return (
          <InputNumber
            className="w-full"
            value={typeof value === 'number' ? value : Number(value) || 0}
            disabled={disabled}
            onChange={(next) => onChange(next ?? 0)}
          />
        );
      case ConfigFieldKind.Strings:
        return (
          <StringListEditor
            value={Array.isArray(value) ? value.map(String) : []}
            disabled={disabled}
            onChange={(next) => onChange(next)}
          />
        );
      case ConfigFieldKind.StringMap:
        return (
          <Input.TextArea
            rows={3}
            disabled={disabled}
            value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
            onChange={(event) => {
              try {
                onChange(JSON.parse(event.target.value || '{}'));
              } catch {
                // Intermediate keystrokes are not JSON yet; keeping the text as-is
                // would break the draft, so the last valid object stays.
              }
            }}
          />
        );
      default:
        return (
          <Input
            disabled={disabled}
            value={typeof value === 'string' ? value : renderValue(value)}
            placeholder={field.secret ? secretPlaceholder : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        );
    }
  };

  return (
    <div>
      {label}
      <div className="mt-1">{control()}</div>
      {field.note && <Text type="secondary" className="text-12px">{field.note}</Text>}
    </div>
  );
}

function StringListEditor({
  value,
  disabled,
  onChange,
}: {
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  if (disabled && value.length === 0)
    return <Text type="secondary">—</Text>;

  return (
    <Space direction="vertical" className="w-full" size={8}>
      {value.map((item, index) => (
        <Space.Compact key={index} className="w-full">
          <Input
            value={item}
            disabled={disabled}
            onChange={(event) => {
              const next = [...value];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          {!disabled && (
            <Button
              icon={<CloseOutlined />}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            />
          )}
        </Space.Compact>
      ))}
      {!disabled && (
        <Button icon={<PlusOutlined />} size="small" onClick={() => onChange([...value, ''])}>
          +
        </Button>
      )}
    </Space>
  );
}
