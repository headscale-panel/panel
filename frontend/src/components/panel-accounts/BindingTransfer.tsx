import { useState, useMemo, useCallback } from 'react';
import {
  Button,
  Space,
  Table,
  Tag,
  Transfer,
  Typography,
  message,
} from 'antd';
import {
  EditOutlined,
  SaveOutlined,
  StarFilled,
  StarOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import { panelAccountsAPI } from '@/lib/api';
import type { NetworkBinding, NetworkIdentityItem } from '@/api/panel-account.types';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface Props {
  accountId: number;
  bindings: NetworkBinding[];
  onUpdated: () => void;
}

export default function BindingTransfer({ accountId, bindings, onUpdated }: Props) {
  const t = useTranslation();
  const pa = t.panelAccounts;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Transfer state: selectedKeys = headscale_name of bound items
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const [primaryName, setPrimaryName] = useState<string>('');

  // Load available network identities when editing
  const { data: available, run: loadAvailable } = useRequest(
    () => panelAccountsAPI.listAvailableNetworkIdentities({ exclude_account_id: accountId }),
    { manual: true },
  );

  const startEdit = useCallback(() => {
    setTargetKeys(bindings.map((b) => b.headscale_name));
    setPrimaryName(bindings.find((b) => b.is_primary)?.headscale_name ?? bindings[0]?.headscale_name ?? '');
    loadAvailable();
    setEditing(true);
  }, [bindings, loadAvailable]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await panelAccountsAPI.updateNetworkBindings(accountId, {
        bindings: targetKeys.map((name) => ({
          headscale_name: name,
          is_primary: name === primaryName,
        })),
      });
      message.success(pa.toast.bindingUpdateSuccess);
      setEditing(false);
      onUpdated();
    } catch (error: any) {
      message.error(error?.message || pa.toast.loadFailed);
    } finally {
      setSaving(false);
    }
  }, [accountId, targetKeys, primaryName, pa, onUpdated]);

  const handleSetPrimary = useCallback(
    async (bindingId: number) => {
      try {
        await panelAccountsAPI.setPrimaryBinding(accountId, { binding_id: bindingId });
        message.success(pa.toast.primaryBindingSuccess);
        onUpdated();
      } catch (error: any) {
        message.error(error?.message || pa.toast.loadFailed);
      }
    },
    [accountId, pa, onUpdated],
  );

  // Build unified data source: available (not bound) + currently bound
  // NOTE: Must be above the early return to keep hooks order consistent.
  const dataSource = useMemo(() => {
    const items: { key: string; title: string; description: string }[] = [];
    for (const b of bindings) {
      items.push({
        key: b.headscale_name,
        title: b.headscale_name,
        description: b.display_name || b.email || '',
      });
    }
    const boundNames = new Set(bindings.map((b) => b.headscale_name));
    for (const a of available ?? []) {
      if (!boundNames.has(a.name)) {
        items.push({
          key: a.name,
          title: a.name,
          description: a.display_name || a.email || '',
        });
      }
    }
    return items;
  }, [bindings, available]);

  // ── Read-only view (not editing) ──────────────────
  if (!editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-12px">
          <Text strong>{pa.detail.binding.title}</Text>
          <Button size="small" icon={<EditOutlined />} onClick={startEdit}>
            {pa.detail.binding.editBindings}
          </Button>
        </div>
        {bindings.length === 0 ? (
          <Text type="secondary">{pa.detail.binding.noBindings}</Text>
        ) : (
          <Table
            rowKey="id"
            dataSource={bindings}
            size="small"
            pagination={false}
            columns={[
              {
                title: pa.detail.binding.hsUserName,
                dataIndex: 'headscale_name',
                key: 'headscale_name',
              },
              {
                title: pa.detail.binding.displayName,
                dataIndex: 'display_name',
                key: 'display_name',
                render: (v: string) => v || '-',
              },
              {
                title: pa.detail.binding.primary,
                key: 'primary',
                width: 100,
                render: (_: unknown, record: NetworkBinding) =>
                  record.is_primary ? (
                    <Tag icon={<StarFilled />} color="gold">
                      {pa.detail.binding.primary}
                    </Tag>
                  ) : (
                    <Button
                      size="small"
                      type="link"
                      icon={<StarOutlined />}
                      onClick={() => handleSetPrimary(record.id)}
                    >
                      {pa.detail.binding.setPrimary}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </div>
    );
  }

  // ── Transfer editing mode ─────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-12px">
        <Text strong>{pa.detail.binding.title}</Text>
        <Space>
          <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit}>
            {pa.detail.binding.cancelEdit}
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          >
            {pa.detail.binding.saveBindings}
          </Button>
        </Space>
      </div>
      <Transfer
        dataSource={dataSource}
        targetKeys={targetKeys}
        onChange={(nextKeys) => setTargetKeys(nextKeys as string[])}
        render={(item) => (
          <span>
            {item.title}
            {item.description ? <Text type="secondary" className="ml-4px text-12px">({item.description})</Text> : null}
          </span>
        )}
        titles={pa.detail.binding.transferTitles as unknown as [string, string]}
        showSearch
        filterOption={(input, item) =>
          (item.title ?? '').toLowerCase().includes(input.toLowerCase()) ||
          (item.description ?? '').toLowerCase().includes(input.toLowerCase())
        }
        listStyle={{ width: 260, height: 320 }}
      />
      {targetKeys.length > 0 && (
        <div className="mt-12px">
          <Text type="secondary" className="text-12px">
            {pa.detail.binding.primary}:
          </Text>
          <Space wrap className="mt-4px">
            {targetKeys.map((name) => (
              <Tag
                key={name}
                color={name === primaryName ? 'gold' : undefined}
                icon={name === primaryName ? <StarFilled /> : <StarOutlined />}
                className="cursor-pointer"
                onClick={() => setPrimaryName(name)}
              >
                {name}
              </Tag>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
}
