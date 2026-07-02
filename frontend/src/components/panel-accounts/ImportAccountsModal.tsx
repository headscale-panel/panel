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

import type { ColumnsType } from 'antd/es/table';
import type { PanelAccountImportResult, PanelAccountImportRow, PanelAccountImportRowResult } from '@/api/panel-account.types';
import { CheckCircleOutlined, CloseCircleOutlined, ImportOutlined } from '@ant-design/icons';
import { Alert, Button, Input, message, Modal, Space, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { panelAccountApi } from '@/api';

const { Text } = Typography;

interface Props {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const sampleCsv = `username,password,email,display_name,group_name,is_active
alice,ChangeMe123,alice@example.com,Alice,User,true
bob,ChangeMe123,bob@example.com,Bob,User,true`;

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized)
    return undefined;
  if (['true', '1', 'yes', 'y', 'active', 'enabled', '启用', '是'].includes(normalized))
    return true;
  if (['false', '0', 'no', 'n', 'inactive', 'disabled', '禁用', '否'].includes(normalized))
    return false;
  return undefined;
}

function parseImportRows(csv: string): PanelAccountImportRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2)
    return [];

  const headers = parseCSVLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line, index) => {
    const cells = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] || '';
    });

    const groupID = Number.parseInt(row.group_id || '', 10);
    return {
      row_number: index + 2,
      username: row.username || '',
      password: row.password || '',
      email: row.email || '',
      display_name: row.display_name || row.displayname || '',
      group_id: Number.isFinite(groupID) && groupID > 0 ? groupID : undefined,
      group_name: row.group_name || row.group || '',
      is_active: parseBoolean(row.is_active || row.active || ''),
    };
  });
}

export default function ImportAccountsModal({ open, onCancel, onSuccess }: Props) {
  const [csv, setCsv] = useState(sampleCsv);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<PanelAccountImportResult | null>(null);

  const rows = useMemo(() => parseImportRows(csv), [csv]);

  const resetAndClose = () => {
    setResult(null);
    onCancel();
  };

  const handleDryRun = async () => {
    if (rows.length === 0) {
      message.warning('请粘贴包含表头和至少一行账号数据的 CSV');
      return;
    }
    setChecking(true);
    try {
      const res = await panelAccountApi.importAccounts({ dry_run: true, rows });
      setResult(res);
      if (res.has_errors) {
        message.warning(`预检完成：${res.invalid} 行需要修正`);
      } else {
        message.success(`预检通过：${res.valid} 个账号可导入`);
      }
    } catch (error: any) {
      message.error(error?.message || '批量导入预检失败');
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async () => {
    if (!result?.can_import) {
      message.warning('请先通过预检');
      return;
    }
    setImporting(true);
    try {
      const res = await panelAccountApi.importAccounts({ dry_run: false, rows });
      message.success(`已导入 ${res.imported} 个 Panel 账号`);
      onSuccess();
    } catch (error: any) {
      message.error(error?.message || '批量导入失败');
    } finally {
      setImporting(false);
    }
  };

  const columns: ColumnsType<PanelAccountImportRowResult> = [
    {
      title: '行',
      dataIndex: 'row_number',
      width: 64,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      ellipsis: true,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      ellipsis: true,
      render: (value: string) => value || <Text type="secondary">-</Text>,
    },
    {
      title: '角色',
      dataIndex: 'group_name',
      ellipsis: true,
      render: (_: string, row) => row.group_name || (row.group_id ? `#${row.group_id}` : <Text type="secondary">未分配</Text>),
    },
    {
      title: '状态',
      dataIndex: 'valid',
      width: 120,
      render: (valid: boolean) => valid
        ? <Tag color="success" icon={<CheckCircleOutlined />}>可导入</Tag>
        : <Tag color="error" icon={<CloseCircleOutlined />}>有错误</Tag>,
    },
    {
      title: '说明',
      key: 'errors',
      render: (_, row) => row.errors?.length ? row.errors.join('; ') : <Text type="secondary">-</Text>,
    },
  ];

  return (
    <Modal
      open={open}
      title={(
        <span>
          <ImportOutlined className="mr-2" />
          批量导入 Panel 账号
        </span>
      )}
      onCancel={resetAndClose}
      width={920}
      destroyOnHidden
      footer={(
        <Space>
          <Button onClick={resetAndClose}>取消</Button>
          <Button onClick={handleDryRun} loading={checking}>预检</Button>
          <Button type="primary" onClick={handleImport} loading={importing} disabled={!result?.can_import}>
            确认导入
          </Button>
        </Space>
      )}
    >
      <div className="flex flex-col gap-4">
        <Alert
          showIcon
          type="info"
          message="CSV 表头支持 username,password,email,display_name,group_name,group_id,is_active"
          description="导入采用全量预检模式：存在任何错误时不会写入账号。用户名不能重复，密码至少 6 位，group_name 需要匹配现有角色分组。"
        />
        <Input.TextArea
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value);
            setResult(null);
          }}
          autoSize={{ minRows: 8, maxRows: 12 }}
          spellCheck={false}
        />
        {result && (
          <Space direction="vertical" className="w-full" size={12}>
            <Alert
              showIcon
              type={result.has_errors ? 'warning' : 'success'}
              message={`预检结果：共 ${result.total} 行，${result.valid} 行可导入，${result.invalid} 行有错误`}
            />
            <Table
              rowKey="row_number"
              size="small"
              columns={columns}
              dataSource={result.rows}
              pagination={{ pageSize: 8 }}
            />
          </Space>
        )}
      </div>
    </Modal>
  );
}
