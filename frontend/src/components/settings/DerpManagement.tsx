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
import type { DERPNode, DERPRegion } from '@/api/derp.types';
import {
  DeleteOutlined,
  EditOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import {
  Button,
  Card,
  Collapse,
  Input,
  InputNumber,
  message,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useState } from 'react';
import { derpApi } from '@/api';
import { useTranslation } from '@/i18n';

const { Text } = Typography;

const DEFAULT_NODE: DERPNode = {
  name: '',
  hostname: '',
  ipv4: '',
  ipv6: '',
  derpport: 443,
  stunport: 3478,
  stunonly: false,
  regionid: 0,
};

const DEFAULT_REGION: Omit<DERPRegion, 'nodes'> = {
  regionid: 0,
  regioncode: '',
  regionname: '',
};

function NodeForm({
  value,
  onChange,
}: {
  value: DERPNode;
  onChange: (node: DERPNode) => void;
}) {
  const t = useTranslation();
  const set = (field: keyof DERPNode, v: any) => onChange({ ...value, [field]: v });

  return (
    <Space direction="vertical" className="w-full" size={10}>
      <div className="flex gap-3">
        <div className="flex-1">
          <Text className="text-12px block mb-1">
            {t.derp.nodeName}
            {' *'}
          </Text>
          <Input value={value.name} onChange={(e) => set('name', e.target.value)} placeholder="node1" />
        </div>
        <div className="flex-1">
          <Text className="text-12px block mb-1">
            {t.derp.hostname}
            {' *'}
          </Text>
          <Input value={value.hostname} onChange={(e) => set('hostname', e.target.value)} placeholder="derp1.example.com" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <Text className="text-12px block mb-1">{t.derp.ipv4}</Text>
          <Input value={value.ipv4} onChange={(e) => set('ipv4', e.target.value)} placeholder="1.2.3.4" />
        </div>
        <div className="flex-1">
          <Text className="text-12px block mb-1">{t.derp.ipv6}</Text>
          <Input value={value.ipv6} onChange={(e) => set('ipv6', e.target.value)} placeholder="::1" />
        </div>
      </div>
      <div className="flex gap-3 items-end">
        <div>
          <Text className="text-12px block mb-1">{t.derp.derpPort}</Text>
          <InputNumber min={1} max={65535} value={value.derpport} onChange={(v) => set('derpport', v ?? 443)} style={{ width: 120 }} />
        </div>
        <div>
          <Text className="text-12px block mb-1">{t.derp.stunPort}</Text>
          <InputNumber min={1} max={65535} value={value.stunport} onChange={(v) => set('stunport', v ?? 3478)} style={{ width: 120 }} />
        </div>
        <div>
          <Text className="text-12px block mb-1">{t.derp.stunOnly}</Text>
          <Switch checked={value.stunonly} onChange={(v) => set('stunonly', v)} />
        </div>
      </div>
    </Space>
  );
}

function RegionForm({
  value,
  onChange,
}: {
  value: Omit<DERPRegion, 'nodes'>;
  onChange: (region: Omit<DERPRegion, 'nodes'>) => void;
}) {
  const t = useTranslation();
  const set = (field: keyof Omit<DERPRegion, 'nodes'>, v: any) => onChange({ ...value, [field]: v });

  return (
    <Space direction="vertical" className="w-full" size={10}>
      <div className="flex gap-3">
        <div className="flex-1">
          <Text className="text-12px block mb-1">
            {t.derp.regionId}
            {' *'}
          </Text>
          <InputNumber min={1} value={value.regionid} onChange={(v) => set('regionid', v ?? 0)} style={{ width: '100%' }} />
        </div>
        <div className="flex-1">
          <Text className="text-12px block mb-1">
            {t.derp.regionCode}
            {' *'}
          </Text>
          <Input value={value.regioncode} onChange={(e) => set('regioncode', e.target.value)} placeholder="custom" />
        </div>
      </div>
      <div>
        <Text className="text-12px block mb-1">
          {t.derp.regionName}
          {' *'}
        </Text>
        <Input value={value.regionname} onChange={(e) => set('regionname', e.target.value)} placeholder="Custom Region" />
      </div>
    </Space>
  );
}

export default function DerpManagement() {
  const t = useTranslation();
  const [regions, setRegions] = useState<DERPRegion[]>([]);

  const { loading, run: refresh } = useRequest(
    () => derpApi.get().then((data) => {
      const regionList = Object.values(data.regions ?? {}) as DERPRegion[];
      regionList.sort((a, b) => a.regionid - b.regionid);
      setRegions(regionList);
    }),
    {
      onError: (e) => message.error(`${t.derp.failedToLoadDERPMap}: ${(e as any).message}`),
    },
  );

  // ─── Region modal ──────────────────────────────────────────────────────────
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<DERPRegion | null>(null);
  const [regionForm, setRegionForm] = useState<Omit<DERPRegion, 'nodes'>>(DEFAULT_REGION);
  const [savingRegion, setSavingRegion] = useState(false);

  const openAddRegion = () => {
    setEditingRegion(null);
    setRegionForm({ ...DEFAULT_REGION });
    setRegionModalOpen(true);
  };

  const openEditRegion = (region: DERPRegion) => {
    setEditingRegion(region);
    const { nodes: _nodes, ...rest } = region;
    setRegionForm(rest);
    setRegionModalOpen(true);
  };

  const handleSaveRegion = async () => {
    if (!regionForm.regionid || !regionForm.regioncode || !regionForm.regionname) {
      message.error(t.derp.pleaseFillRequired);
      return;
    }
    setSavingRegion(true);
    try {
      if (editingRegion) {
        await derpApi.updateRegion(editingRegion.regionid, { ...regionForm, nodes: editingRegion.nodes });
        message.success(t.derp.regionUpdated);
      } else {
        await derpApi.addRegion({ ...regionForm, nodes: [] });
        message.success(t.derp.regionAdded);
      }
      setRegionModalOpen(false);
      refresh();
    } catch (e: any) {
      message.error(`${t.derp.failedToSaveRegion}: ${e.message}`);
    } finally {
      setSavingRegion(false);
    }
  };

  const handleDeleteRegion = useCallback(async (regionId: number) => {
    Modal.confirm({
      title: t.derp.confirmDeleteRegion,
      content: t.derp.confirmDeleteRegionContent.replace('{id}', String(regionId)),
      okType: 'danger',
      onOk: async () => {
        await derpApi.deleteRegion(regionId);
        message.success(t.derp.regionDeleted);
        refresh();
      },
    });
  }, [refresh, t]);

  // ─── Node modal ────────────────────────────────────────────────────────────
  const [nodeModalOpen, setNodeModalOpen] = useState(false);
  const [nodeRegionId, setNodeRegionId] = useState(0);
  const [nodeIndex, setNodeIndex] = useState<number | null>(null);
  const [nodeForm, setNodeForm] = useState<DERPNode>({ ...DEFAULT_NODE });
  const [savingNode, setSavingNode] = useState(false);

  const openAddNode = (regionId: number) => {
    setNodeRegionId(regionId);
    setNodeIndex(null);
    setNodeForm({ ...DEFAULT_NODE, regionid: regionId });
    setNodeModalOpen(true);
  };

  const openEditNode = (regionId: number, idx: number, node: DERPNode) => {
    setNodeRegionId(regionId);
    setNodeIndex(idx);
    setNodeForm({ ...node });
    setNodeModalOpen(true);
  };

  const handleSaveNode = async () => {
    if (!nodeForm.name || !nodeForm.hostname) {
      message.error(t.derp.nodeRequired);
      return;
    }
    setSavingNode(true);
    try {
      if (nodeIndex !== null) {
        await derpApi.updateNode(nodeRegionId, nodeIndex, { ...nodeForm, regionid: nodeRegionId });
        message.success(t.derp.nodeUpdated);
      } else {
        await derpApi.addNode(nodeRegionId, { ...nodeForm, regionid: nodeRegionId });
        message.success(t.derp.nodeAdded);
      }
      setNodeModalOpen(false);
      refresh();
    } catch (e: any) {
      message.error(`${t.derp.failedToSaveNode}: ${e.message}`);
    } finally {
      setSavingNode(false);
    }
  };

  const handleDeleteNode = useCallback(async (regionId: number, idx: number, nodeName: string) => {
    Modal.confirm({
      title: t.derp.confirmDeleteNode,
      content: t.derp.confirmDeleteNodeContent.replace('{name}', nodeName),
      okType: 'danger',
      onOk: async () => {
        await derpApi.deleteNode(regionId, idx);
        message.success(t.derp.nodeDeleted);
        refresh();
      },
    });
  }, [refresh, t]);

  // ─── Node columns ──────────────────────────────────────────────────────────
  const nodeColumns = (regionId: number): ColumnsType<DERPNode & { _idx: number }> => [
    { title: t.derp.name, dataIndex: 'name', key: 'name', render: (v) => <Text code>{v}</Text> },
    { title: t.derp.hostname, dataIndex: 'hostname', key: 'hostname' },
    { title: t.derp.ipv4, dataIndex: 'ipv4', key: 'ipv4', render: (v) => v || '—' },
    {
      title: t.derp.ports,
      key: 'ports',
      render: (_, r) => (
        <Space size={4}>
          {!r.stunonly && (
            <Tag>
              DERP:
              {r.derpport}
            </Tag>
          )}
          <Tag>
            STUN:
            {r.stunport}
          </Tag>
          {r.stunonly && <Tag color="orange">{t.derp.stunOnlyTag}</Tag>}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, r) => (
        <Space>
          <Tooltip title={t.derp.editTooltip}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditNode(regionId, r._idx, r)} />
          </Tooltip>
          <Tooltip title={t.derp.deleteTooltip}>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteNode(regionId, r._idx, r.name)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="w-full">
      <div className="flex justify-between items-center">
        <Space>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={refresh} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddRegion}>
            {t.derp.addRegion}
          </Button>
        </Space>
      </div>

      {regions.length === 0 && !loading && (
        <Card>
          <div className="text-center py-8">
            <NodeIndexOutlined style={{ fontSize: 32, opacity: 0.3 }} />
            <div className="mt-2 text-secondary">{t.derp.noRegions}</div>
          </div>
        </Card>
      )}

      <Collapse
        items={regions.map((region) => ({
          key: String(region.regionid),
          label: (
            <Space>
              <Text strong>{region.regionname}</Text>
              <Text type="secondary" className="text-12px">
                (
                {region.regioncode}
                {' '}
                · ID
                {region.regionid}
                )
              </Text>
              <Tag>
                {region.nodes?.length ?? 0}
                {' '}
                {t.derp.nodeCount}
              </Tag>
            </Space>
          ),
          extra: (
            <Space onClick={(e) => e.stopPropagation()}>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openAddNode(region.regionid)}>
                {t.derp.addNode}
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditRegion(region)} />
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteRegion(region.regionid)} />
            </Space>
          ),
          children: (
            <Table
              rowKey="_idx"
              size="small"
              pagination={false}
              dataSource={(region.nodes ?? []).map((n, i) => ({ ...n, _idx: i }))}
              columns={nodeColumns(region.regionid)}
              locale={{ emptyText: t.derp.noNodes }}
            />
          ),
        }))}
      />

      {/* Region Modal */}
      <Modal
        open={regionModalOpen}
        title={editingRegion ? t.derp.editRegion : t.derp.addRegion}
        onCancel={() => setRegionModalOpen(false)}
        onOk={handleSaveRegion}
        confirmLoading={savingRegion}
        width={480}
        destroyOnHidden
      >
        <RegionForm value={regionForm} onChange={setRegionForm} />
      </Modal>

      {/* Node Modal */}
      <Modal
        open={nodeModalOpen}
        title={nodeIndex !== null ? t.derp.editNode : t.derp.addNode}
        onCancel={() => setNodeModalOpen(false)}
        onOk={handleSaveNode}
        confirmLoading={savingNode}
        width={520}
        destroyOnHidden
      >
        <NodeForm value={nodeForm} onChange={setNodeForm} />
      </Modal>
    </Space>
  );
}
