import { useState, useCallback } from 'react';
import {
  Button,
  Card,
  Collapse,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { derpApi } from '@/api';
import type { DERPRegion, DERPNode } from '@/api/derp.types';
import { useRequest } from 'ahooks';

const { Text } = Typography;

const DEFAULT_NODE: DERPNode = {
  name: '',
  regionid: 0,
  hostname: '',
  ipv4: '',
  ipv6: '',
  stunport: 3478,
  stunonly: false,
  derpport: 443,
};

const DEFAULT_REGION: DERPRegion = {
  regionid: 0,
  regioncode: '',
  regionname: '',
  nodes: [],
};

function NodeForm({
  value,
  onChange,
}: {
  value: DERPNode;
  onChange: (node: DERPNode) => void;
}) {
  const set = (field: keyof DERPNode, v: any) => onChange({ ...value, [field]: v });

  return (
    <Space direction="vertical" className="w-full" size={10}>
      <div className="flex gap-3">
        <div className="flex-1">
          <Text className="text-12px block mb-1">Node Name *</Text>
          <Input value={value.name} onChange={(e) => set('name', e.target.value)} placeholder="node1" />
        </div>
        <div className="flex-1">
          <Text className="text-12px block mb-1">Hostname *</Text>
          <Input value={value.hostname} onChange={(e) => set('hostname', e.target.value)} placeholder="derp1.example.com" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <Text className="text-12px block mb-1">IPv4</Text>
          <Input value={value.ipv4} onChange={(e) => set('ipv4', e.target.value)} placeholder="1.2.3.4" />
        </div>
        <div className="flex-1">
          <Text className="text-12px block mb-1">IPv6</Text>
          <Input value={value.ipv6} onChange={(e) => set('ipv6', e.target.value)} placeholder="::1" />
        </div>
      </div>
      <div className="flex gap-3 items-end">
        <div>
          <Text className="text-12px block mb-1">DERP Port</Text>
          <InputNumber min={1} max={65535} value={value.derpport} onChange={(v) => set('derpport', v ?? 443)} style={{ width: 120 }} />
        </div>
        <div>
          <Text className="text-12px block mb-1">STUN Port</Text>
          <InputNumber min={1} max={65535} value={value.stunport} onChange={(v) => set('stunport', v ?? 3478)} style={{ width: 120 }} />
        </div>
        <div>
          <Text className="text-12px block mb-1">STUN Only</Text>
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
  const set = (field: keyof Omit<DERPRegion, 'nodes'>, v: any) => onChange({ ...value, [field]: v });

  return (
    <Space direction="vertical" className="w-full" size={10}>
      <div className="flex gap-3">
        <div className="flex-1">
          <Text className="text-12px block mb-1">Region ID *</Text>
          <InputNumber min={1} value={value.regionid} onChange={(v) => set('regionid', v ?? 0)} style={{ width: '100%' }} />
        </div>
        <div className="flex-1">
          <Text className="text-12px block mb-1">Region Code *</Text>
          <Input value={value.regioncode} onChange={(e) => set('regioncode', e.target.value)} placeholder="custom" />
        </div>
      </div>
      <div>
        <Text className="text-12px block mb-1">Region Name *</Text>
        <Input value={value.regionname} onChange={(e) => set('regionname', e.target.value)} placeholder="Custom Region" />
      </div>
    </Space>
  );
}

export default function DerpManagement() {
  const [regions, setRegions] = useState<DERPRegion[]>([]);

  const { loading, run: refresh } = useRequest(
    () => derpApi.get().then((data) => {
      const regionList = Object.values(data.regions ?? {}) as DERPRegion[];
      regionList.sort((a, b) => a.regionid - b.regionid);
      setRegions(regionList);
    }),
    {
      onError: (e) => message.error('Failed to load DERP map: ' + (e as any).message),
    }
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
      message.error('Please fill in all required region fields');
      return;
    }
    setSavingRegion(true);
    try {
      if (editingRegion) {
        await derpApi.updateRegion(editingRegion.regionid, { ...regionForm, nodes: editingRegion.nodes });
        message.success('Region updated');
      } else {
        await derpApi.addRegion({ ...regionForm, nodes: [] });
        message.success('Region added');
      }
      setRegionModalOpen(false);
      refresh();
    } catch (e: any) {
      message.error('Failed to save region: ' + e.message);
    } finally {
      setSavingRegion(false);
    }
  };

  const handleDeleteRegion = useCallback(async (regionId: number) => {
    Modal.confirm({
      title: 'Delete Region',
      content: `Are you sure you want to delete region ${regionId}?`,
      okType: 'danger',
      onOk: async () => {
        await derpApi.deleteRegion(regionId);
        message.success('Region deleted');
        refresh();
      },
    });
  }, [refresh]);

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
      message.error('Node name and hostname are required');
      return;
    }
    setSavingNode(true);
    try {
      if (nodeIndex !== null) {
        await derpApi.updateNode(nodeRegionId, nodeIndex, { ...nodeForm, regionid: nodeRegionId });
        message.success('Node updated');
      } else {
        await derpApi.addNode(nodeRegionId, { ...nodeForm, regionid: nodeRegionId });
        message.success('Node added');
      }
      setNodeModalOpen(false);
      refresh();
    } catch (e: any) {
      message.error('Failed to save node: ' + e.message);
    } finally {
      setSavingNode(false);
    }
  };

  const handleDeleteNode = useCallback(async (regionId: number, idx: number, nodeName: string) => {
    Modal.confirm({
      title: 'Delete Node',
      content: `Delete node "${nodeName}"?`,
      okType: 'danger',
      onOk: async () => {
        await derpApi.deleteNode(regionId, idx);
        message.success('Node deleted');
        refresh();
      },
    });
  }, [refresh]);

  // ─── Node columns ──────────────────────────────────────────────────────────
  const nodeColumns = (regionId: number): ColumnsType<DERPNode & { _idx: number }> => [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v) => <Text code>{v}</Text> },
    { title: 'Hostname', dataIndex: 'hostname', key: 'hostname' },
    { title: 'IPv4', dataIndex: 'ipv4', key: 'ipv4', render: (v) => v || '—' },
    {
      title: 'Ports',
      key: 'ports',
      render: (_, r) => (
        <Space size={4}>
          {!r.stunonly && <Tag>DERP:{r.derpport}</Tag>}
          <Tag>STUN:{r.stunport}</Tag>
          {r.stunonly && <Tag color="orange">STUN only</Tag>}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, r) => (
        <Space>
          <Tooltip title="Edit">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditNode(regionId, r._idx, r)} />
          </Tooltip>
          <Tooltip title="Delete">
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
            Add Region
          </Button>
        </Space>
      </div>

      {regions.length === 0 && !loading && (
        <Card>
          <div className="text-center py-8">
            <NodeIndexOutlined style={{ fontSize: 32, opacity: 0.3 }} />
            <div className="mt-2 text-secondary">No DERP regions configured</div>
          </div>
        </Card>
      )}

      <Collapse
        items={regions.map((region) => ({
          key: String(region.regionid),
          label: (
            <Space>
              <Text strong>{region.regionname}</Text>
              <Text type="secondary" className="text-12px">({region.regioncode} · ID {region.regionid})</Text>
              <Tag>{region.nodes?.length ?? 0} node(s)</Tag>
            </Space>
          ),
          extra: (
            <Space onClick={(e) => e.stopPropagation()}>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openAddNode(region.regionid)}>
                Add Node
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
              locale={{ emptyText: 'No nodes in this region' }}
            />
          ),
        }))}
      />

      {/* Region Modal */}
      <Modal
        open={regionModalOpen}
        title={editingRegion ? 'Edit Region' : 'Add Region'}
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
        title={nodeIndex !== null ? 'Edit Node' : 'Add Node'}
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
