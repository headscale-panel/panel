import { useEffect, useState, useMemo } from 'react';
import { useSearch } from 'wouter';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DownOutlined,
  EditOutlined,
  FilterOutlined,
  KeyOutlined,
  LaptopOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  CodeOutlined,
  UserOutlined,
  UpOutlined,
  WifiOutlined,
  DisconnectOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { Button, Card, Input, Modal, Select, Space, Statistic, Switch, Table, Tabs, Tag, Tooltip, Typography, Dropdown, message, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DashboardLayout from '@/components/DashboardLayout';
import { devicesAPI, usersAPI } from '@/lib/api';
import { loadDevicesPageData } from '@/lib/page-data';
import type { HeadscaleUserOption, NormalizedDevice } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Title, Text } = Typography;

type Device = NormalizedDevice;
type HeadscaleUser = HeadscaleUserOption;

interface DeployParams {
  loginServer: string;
  hostname: string;
  acceptDns: boolean;
  acceptRoutes: boolean;
  advertiseExitNode: boolean;
  advertiseRoutes: string;
  advertiseTags: string;
  ssh: boolean;
  shieldsUp: boolean;
  exitNode: string;
  exitNodeAllowLan: boolean;
  forceReauth: boolean;
  reset: boolean;
  advertiseConnector: boolean;
  operator: string;
  netfilterMode: string;
  snatSubnetRoutes: boolean;
  statefulFiltering: boolean;
}

const defaultDeployParams: DeployParams = {
  loginServer: '',
  hostname: '',
  acceptDns: true,
  acceptRoutes: false,
  advertiseExitNode: false,
  advertiseRoutes: '',
  advertiseTags: '',
  ssh: false,
  shieldsUp: false,
  exitNode: '',
  exitNodeAllowLan: false,
  forceReauth: false,
  reset: false,
  advertiseConnector: false,
  operator: '',
  netfilterMode: '',
  snatSubnetRoutes: true,
  statefulFiltering: false,
};

function DeployParamSwitch({ label, description, checked, onChange, linuxOnly }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  linuxOnly?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: token.borderRadius, border: `1px solid ${token.colorBorderSecondary}` }}>
      <div>
        <Text strong style={{ fontSize: 13 }}>{label}{linuxOnly && <Tag style={{ marginLeft: 4, fontSize: 10 }}>Linux</Tag>}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>{description}</Text>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

export default function Devices() {
  const t = useTranslation();
  const { token } = theme.useToken();
  const search = useSearch();
  const [devices, setDevices] = useState<Device[]>([]);
  const [headscaleUsers, setHeadscaleUsers] = useState<HeadscaleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUser, setFilterUser] = useState(() => {
    const params = new URLSearchParams(search);
    return params.get('user') || 'all';
  });
  const [filterStatus, setFilterStatus] = useState('all');

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');

  const [addDeviceDialogOpen, setAddDeviceDialogOpen] = useState(false);
  const [addDeviceTab, setAddDeviceTab] = useState('preauth');
  const [addDeviceUser, setAddDeviceUser] = useState('');
  const [addDeviceReusable, setAddDeviceReusable] = useState(false);
  const [addDeviceEphemeral, setAddDeviceEphemeral] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [machineKey, setMachineKey] = useState('');
  const [registeringNode, setRegisteringNode] = useState(false);
  const [deployParams, setDeployParams] = useState<DeployParams>({ ...defaultDeployParams });
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { devices, headscaleUsers, serverUrl } = await loadDevicesPageData();
      setDevices(devices);
      setHeadscaleUsers(headscaleUsers);
      setServerUrl(serverUrl);
    } catch (error: any) {
      console.error(error);
      message.error(t.devices.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyIP = (ip: string) => {
    navigator.clipboard.writeText(ip);
    message.success(t.devices.ipCopied);
  };

  const handleRename = async () => {
    if (!selectedDevice || !newName.trim()) return;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(newName.trim())) {
      setNameError(t.devices.nameLowercaseError);
      return;
    }
    try {
      await devicesAPI.rename(selectedDevice.id, newName);
      message.success(t.devices.renameSuccess);
      setRenameDialogOpen(false);
      loadData();
    } catch (error: any) {
      message.error(t.devices.renameFailed + (error.message || t.common.errors.unknownError));
    }
  };

  const handleGenerateKey = async () => {
    if (!addDeviceUser) {
      message.error(t.devices.selectUserFirst);
      return;
    }
    try {
      const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res: any = await usersAPI.createPreAuthKey(addDeviceUser, addDeviceReusable, addDeviceEphemeral, expiration);
      const key = res?.preAuthKey?.key || res?.key || res?.preauthkey?.key || '';
      if (key) {
        setGeneratedKey(key);
        message.success(t.devices.keyGenerated);
      } else {
        message.error(t.devices.keyGenerateFailed);
      }
    } catch (error: any) {
      message.error(t.devices.keyGenerateFailed + (error.message ? ': ' + error.message : ''));
    }
  };

  const handleRegisterNode = async () => {
    if (!addDeviceUser || !machineKey.trim()) {
      message.error(t.devices.machineKeyRequired);
      return;
    }
    setRegisteringNode(true);
    try {
      await devicesAPI.registerNode(addDeviceUser, machineKey.trim());
      message.success(t.devices.registerNodeSuccess);
      setAddDeviceDialogOpen(false);
      loadData();
    } catch (error: any) {
      message.error(t.devices.registerNodeFailed + (error.message ? ': ' + error.message : ''));
    } finally {
      setRegisteringNode(false);
    }
  };

  const buildTailscaleCommand = useMemo(() => {
    const parts = ['tailscale up'];
    const p = deployParams;

    if (p.loginServer) parts.push(`--login-server=${p.loginServer}`);
    if (generatedKey && addDeviceTab === 'preauth') parts.push(`--auth-key=${generatedKey}`);
    if (p.hostname) parts.push(`--hostname=${p.hostname}`);
    if (!p.acceptDns) parts.push('--accept-dns=false');
    if (p.acceptRoutes) parts.push('--accept-routes');
    if (p.advertiseExitNode) parts.push('--advertise-exit-node');
    if (p.advertiseRoutes) parts.push(`--advertise-routes=${p.advertiseRoutes}`);
    if (p.advertiseTags) parts.push(`--advertise-tags=${p.advertiseTags}`);
    if (p.ssh) parts.push('--ssh');
    if (p.shieldsUp) parts.push('--shields-up');
    if (p.exitNode) parts.push(`--exit-node=${p.exitNode}`);
    if (p.exitNodeAllowLan) parts.push('--exit-node-allow-lan-access');
    if (p.forceReauth) parts.push('--force-reauth');
    if (p.reset) parts.push('--reset');
    if (p.advertiseConnector) parts.push('--advertise-connector');
    if (p.operator) parts.push(`--operator=${p.operator}`);
    if (p.netfilterMode && p.netfilterMode !== 'on') parts.push(`--netfilter-mode=${p.netfilterMode}`);
    if (!p.snatSubnetRoutes) parts.push('--snat-subnet-routes=false');
    if (p.statefulFiltering) parts.push('--stateful-filtering');

    return parts.join(' \\\n  ');
  }, [deployParams, generatedKey, addDeviceTab]);

  const handleDelete = (device: Device) => {
    Modal.confirm({
      title: t.devices.deleteDevice,
      content: t.devices.confirmDelete.replace('{name}', device.given_name || device.name),
      okText: t.common.actions.delete,
      okButtonProps: { danger: true },
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await devicesAPI.delete(device.id);
          message.success(t.devices.deleteSuccess);
          loadData();
        } catch (error: any) {
          message.error(t.devices.deleteFailed);
        }
      },
    });
  };

  const openRenameDialog = (device: Device) => {
    setSelectedDevice(device);
    setNewName(device.given_name || device.name);
    setNameError('');
    setRenameDialogOpen(true);
  };

  const filteredDevices = devices.filter((device) => {
    if (filterUser !== 'all' && device.user?.name !== filterUser) return false;

    if (filterStatus !== 'all') {
      if (filterStatus === 'online' && !device.online) return false;
      if (filterStatus === 'offline' && device.online) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        device.name.toLowerCase().includes(q) ||
        (device.given_name && device.given_name.toLowerCase().includes(q)) ||
        (device.user?.name && device.user.name.toLowerCase().includes(q)) ||
        device.ip_addresses?.some((ip) => ip.includes(q))
      );
    }
    return true;
  });

  const stats = {
    total: devices.length,
    online: devices.filter((d) => d.online).length,
    offline: devices.filter((d) => !d.online).length,
  };

  const columns: ColumnsType<Device> = [
    {
      title: t.devices.tableStatus,
      dataIndex: 'online',
      key: 'status',
      width: 120,
      render: (online: boolean) => online
        ? <Tag icon={<CheckCircleOutlined />} color="success">{t.common.status.online}</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="default">{t.common.status.offline}</Tag>,
    },
    {
      title: t.devices.tableName,
      key: 'name',
      render: (_: any, device: Device) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LaptopOutlined style={{ color: token.colorTextSecondary }} />
          <div>
            <Text strong>{device.given_name || device.name}</Text>
            {device.given_name && device.given_name !== device.name && (
              <div><Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{device.name}</Text></div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: t.devices.tableIp,
      key: 'ip',
      render: (_: any, device: Device) => (
        <Space direction="vertical" size={2}>
          {device.ip_addresses?.slice(0, 2).map((ip) => (
            <Tooltip key={ip} title={t.devices.clickToCopy}>
              <Tag
                style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}
                onClick={() => handleCopyIP(ip)}
              >
                {ip}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      ),
    },
    {
      title: t.devices.tableOwner,
      key: 'owner',
      render: (_: any, device: Device) => (
        <Space size={4}>
          <UserOutlined style={{ color: token.colorTextSecondary }} />
          <Text>{device.user?.name || 'Unknown'}</Text>
        </Space>
      ),
    },
    {
      title: t.devices.tableLastOnline,
      dataIndex: 'last_seen',
      key: 'last_seen',
      render: (last_seen: string) => last_seen ? new Date(last_seen).toLocaleString('zh-CN') : 'Never',
    },
    {
      title: t.devices.tableActions,
      key: 'actions',
      width: 80,
      render: (_: any, device: Device) => (
        <Dropdown
          menu={{
            items: [
              { key: 'rename', icon: <EditOutlined />, label: t.devices.rename, onClick: () => openRenameDialog(device) },
              { type: 'divider' },
              { key: 'delete', icon: <DeleteOutlined />, label: t.devices.deleteDevice, danger: true, onClick: () => handleDelete(device) },
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" size="small" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  const exitNodeDevices = devices.filter(d =>
    d.approved_routes?.some(r => r === '0.0.0.0/0' || r === '::/0') ||
    d.available_routes?.some(r => r === '0.0.0.0/0' || r === '::/0')
  );

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{t.devices.title}</Title>
            <Text type="secondary">{t.devices.description}</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={loadData} disabled={loading}>
              {t.common.actions.refresh}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setAddDeviceUser(''); setAddDeviceReusable(false); setAddDeviceEphemeral(false);
              setGeneratedKey(''); setMachineKey(''); setRegisteringNode(false);
              setDeployParams({ ...defaultDeployParams, loginServer: serverUrl });
              setShowAdvancedParams(false); setAddDeviceTab('preauth'); setAddDeviceDialogOpen(true);
            }}>
              {t.devices.addDevice}
            </Button>
          </Space>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Card><Statistic title={t.devices.totalDevices} value={stats.total} prefix={<CloudServerOutlined style={{ color: token.colorPrimary }} />} /></Card>
          <Card><Statistic title={t.devices.onlineDevices} value={stats.online} prefix={<WifiOutlined style={{ color: token.colorSuccess }} />} /></Card>
          <Card><Statistic title={t.devices.offlineDevices} value={stats.offline} prefix={<DisconnectOutlined style={{ color: token.colorTextQuaternary }} />} /></Card>
        </div>

        {/* Filters */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
            <FilterOutlined style={{ color: token.colorTextSecondary }} />
            <Text strong style={{ fontSize: 16 }}>{t.devices.filterTitle}</Text>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t.devices.filterByUser}</Text>
              <Select
                style={{ width: '100%' }}
                value={filterUser}
                onChange={setFilterUser}
                options={[
                  { value: 'all', label: t.devices.allUsers },
                  ...headscaleUsers.map((u) => ({ value: u.name, label: u.name })),
                ]}
              />
            </div>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t.devices.filterByStatus}</Text>
              <Select
                style={{ width: '100%' }}
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: 'all', label: t.devices.allStatus },
                  { value: 'online', label: t.common.status.online },
                  { value: 'offline', label: t.common.status.offline },
                ]}
              />
            </div>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>{t.devices.search}</Text>
              <Input
                prefix={<SearchOutlined />}
                placeholder={t.devices.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Devices Table */}
        <Card styles={{ body: { padding: 0 } }}>
          <Table<Device>
            columns={columns}
            dataSource={filteredDevices}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
            locale={{ emptyText: t.devices.noData }}
          />
        </Card>

        {/* Rename Dialog */}
        <Modal
          open={renameDialogOpen}
          onCancel={() => setRenameDialogOpen(false)}
          title={t.devices.renameDialogTitle}
          onOk={handleRename}
          okButtonProps={{ disabled: !!nameError }}
          okText={t.common.actions.save}
          cancelText={t.common.actions.cancel}
        >
          <Text type="secondary">{t.devices.renameDialogDesc.replace('{name}', selectedDevice?.name || '')}</Text>
          <div style={{ marginTop: 16 }}>
            <Text style={{ display: 'block', marginBottom: 4 }}>{t.devices.newNameLabel}</Text>
            <Input
              value={newName}
              onChange={(e) => {
                const val = e.target.value.toLowerCase();
                setNewName(val);
                if (val && !/^[a-z0-9][a-z0-9-]*$/.test(val)) {
                  setNameError(t.devices.nameLowercaseError);
                } else {
                  setNameError('');
                }
              }}
              status={nameError ? 'error' : undefined}
            />
            {nameError && <Text type="danger" style={{ fontSize: 12 }}>{nameError}</Text>}
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{t.devices.nameLowercaseHint}</Text>
          </div>
        </Modal>

        {/* Add Device Dialog */}
        <Modal
          open={addDeviceDialogOpen}
          onCancel={() => setAddDeviceDialogOpen(false)}
          title={t.devices.addDeviceTitle}
          width={960}
          footer={<Button onClick={() => setAddDeviceDialogOpen(false)}>{t.common.actions.close}</Button>}
          styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
        >
          <Text type="secondary">{t.devices.addDeviceDesc}</Text>

          <Tabs
            activeKey={addDeviceTab}
            onChange={(v) => { setAddDeviceTab(v); setGeneratedKey(''); setMachineKey(''); }}
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'preauth',
                label: <span><KeyOutlined /> {t.devices.tabPreAuth}</span>,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <div>
                      <Text style={{ display: 'block', marginBottom: 4 }}>{t.devices.selectUser}</Text>
                      <Select
                        style={{ width: '100%' }}
                        value={addDeviceUser || undefined}
                        onChange={setAddDeviceUser}
                        placeholder={t.devices.selectUserPlaceholder}
                        options={headscaleUsers.map((u) => ({ value: u.name, label: u.name }))}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Text strong>{t.devices.reusableKey}</Text>
                        <br /><Text type="secondary" style={{ fontSize: 12 }}>{t.devices.reusableKeyDesc}</Text>
                      </div>
                      <Switch checked={addDeviceReusable} onChange={setAddDeviceReusable} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Text strong>{t.devices.ephemeralKey}</Text>
                        <br /><Text type="secondary" style={{ fontSize: 12 }}>{t.devices.ephemeralKeyDesc}</Text>
                      </div>
                      <Switch checked={addDeviceEphemeral} onChange={setAddDeviceEphemeral} />
                    </div>
                    {!generatedKey && (
                      <Button type="primary" block onClick={handleGenerateKey} disabled={!addDeviceUser} icon={<KeyOutlined />}>
                        {t.devices.generateKey}
                      </Button>
                    )}
                    {generatedKey && (
                      <div>
                        <Text style={{ display: 'block', marginBottom: 4 }}>{t.devices.preAuthKey}</Text>
                        <Space.Compact style={{ width: '100%' }}>
                          <Input readOnly value={generatedKey} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                          <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(generatedKey); message.success(t.devices.keyCopied); }} />
                        </Space.Compact>
                        <Text type="secondary" style={{ fontSize: 12 }}>{t.devices.keyExpireHint}</Text>
                      </div>
                    )}
                  </Space>
                ),
              },
              {
                key: 'machinekey',
                label: <span><CodeOutlined /> {t.devices.tabMachineKey}</span>,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <div>
                      <Text style={{ display: 'block', marginBottom: 4 }}>{t.devices.selectUser}</Text>
                      <Select
                        style={{ width: '100%' }}
                        value={addDeviceUser || undefined}
                        onChange={setAddDeviceUser}
                        placeholder={t.devices.selectUserPlaceholder}
                        options={headscaleUsers.map((u) => ({ value: u.name, label: u.name }))}
                      />
                    </div>
                    <div>
                      <Text style={{ display: 'block', marginBottom: 4 }}>{t.devices.machineKeyLabel}</Text>
                      <Input
                        placeholder={t.devices.machineKeyPlaceholder}
                        value={machineKey}
                        onChange={(e) => setMachineKey(e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>{t.devices.machineKeyHint}</Text>
                    </div>
                    <Button type="primary" block onClick={handleRegisterNode} disabled={!addDeviceUser || !machineKey.trim() || registeringNode} loading={registeringNode} icon={<CloudServerOutlined />}>
                      {t.devices.registerNode}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />

          {/* Deployment Parameters */}
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16, marginTop: 16 }}>
            <Button
              type="text"
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
            >
              <SettingOutlined />
              <span style={{ flex: 1 }}>{t.devices.deployParams}</span>
              {showAdvancedParams ? <UpOutlined /> : <DownOutlined />}
            </Button>

            {showAdvancedParams && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
                <div>
                  <Text style={{ display: 'block', marginBottom: 4 }}>{t.devices.paramHostname}</Text>
                  <Input
                    placeholder={t.devices.paramHostnamePlaceholder}
                    value={deployParams.hostname}
                    onChange={(e) => setDeployParams({ ...deployParams, hostname: e.target.value.toLowerCase() })}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>{t.devices.paramHostnameDesc}</Text>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <DeployParamSwitch label="--accept-dns" description={t.devices.paramAcceptDns} checked={deployParams.acceptDns} onChange={(v) => setDeployParams({ ...deployParams, acceptDns: v })} />
                  <DeployParamSwitch label="--accept-routes" description={t.devices.paramAcceptRoutes} checked={deployParams.acceptRoutes} onChange={(v) => setDeployParams({ ...deployParams, acceptRoutes: v })} />
                  <DeployParamSwitch label="--advertise-exit-node" description={t.devices.paramAdvertiseExitNode} checked={deployParams.advertiseExitNode} onChange={(v) => setDeployParams({ ...deployParams, advertiseExitNode: v })} />
                  <DeployParamSwitch label="--ssh" description={t.devices.paramSsh} checked={deployParams.ssh} onChange={(v) => setDeployParams({ ...deployParams, ssh: v })} />
                  <DeployParamSwitch label="--shields-up" description={t.devices.paramShieldsUp} checked={deployParams.shieldsUp} onChange={(v) => setDeployParams({ ...deployParams, shieldsUp: v })} />
                  <DeployParamSwitch label="--advertise-connector" description={t.devices.paramAdvertiseConnector} checked={deployParams.advertiseConnector} onChange={(v) => setDeployParams({ ...deployParams, advertiseConnector: v })} />
                </div>

                <div>
                  <Text style={{ display: 'block', marginBottom: 4 }}>--advertise-routes</Text>
                  <Input placeholder="10.0.0.0/24,192.168.1.0/24" value={deployParams.advertiseRoutes} onChange={(e) => setDeployParams({ ...deployParams, advertiseRoutes: e.target.value })} />
                  <Text type="secondary" style={{ fontSize: 12 }}>{t.devices.paramAdvertiseRoutes}</Text>
                </div>
                <div>
                  <Text style={{ display: 'block', marginBottom: 4 }}>--advertise-tags</Text>
                  <Input placeholder="tag:server,tag:prod" value={deployParams.advertiseTags} onChange={(e) => setDeployParams({ ...deployParams, advertiseTags: e.target.value })} />
                  <Text type="secondary" style={{ fontSize: 12 }}>{t.devices.paramAdvertiseTags}</Text>
                </div>
                <div>
                  <Text style={{ display: 'block', marginBottom: 4 }}>--exit-node</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={deployParams.exitNode || '__none__'}
                    onChange={(v) => setDeployParams({ ...deployParams, exitNode: v === '__none__' ? '' : v })}
                    options={[
                      { value: '__none__', label: t.devices.paramExitNodeNone },
                      ...exitNodeDevices.map(d => ({
                        value: d.ip_addresses?.[0] || d.given_name || d.name,
                        label: `${d.given_name || d.name} ${d.ip_addresses?.[0] ? `(${d.ip_addresses[0]})` : ''}`,
                      })),
                    ]}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>{t.devices.paramExitNode}</Text>
                </div>

                <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>{t.devices.advancedOptions}</Text>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <DeployParamSwitch label="--exit-node-allow-lan-access" description={t.devices.paramExitNodeAllowLan} checked={deployParams.exitNodeAllowLan} onChange={(v) => setDeployParams({ ...deployParams, exitNodeAllowLan: v })} />
                    <DeployParamSwitch label="--force-reauth" description={t.devices.paramForceReauth} checked={deployParams.forceReauth} onChange={(v) => setDeployParams({ ...deployParams, forceReauth: v })} />
                    <DeployParamSwitch label="--reset" description={t.devices.paramReset} checked={deployParams.reset} onChange={(v) => setDeployParams({ ...deployParams, reset: v })} />
                    <DeployParamSwitch label="--snat-subnet-routes" description={t.devices.paramSnat} checked={deployParams.snatSubnetRoutes} onChange={(v) => setDeployParams({ ...deployParams, snatSubnetRoutes: v })} linuxOnly />
                    <DeployParamSwitch label="--stateful-filtering" description={t.devices.paramStatefulFiltering} checked={deployParams.statefulFiltering} onChange={(v) => setDeployParams({ ...deployParams, statefulFiltering: v })} linuxOnly />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Text style={{ display: 'block', marginBottom: 4 }}>--operator <Tag style={{ fontSize: 10 }}>Linux</Tag></Text>
                    <Input placeholder={t.devices.paramOperatorPlaceholder} value={deployParams.operator} onChange={(e) => setDeployParams({ ...deployParams, operator: e.target.value })} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Text style={{ display: 'block', marginBottom: 4 }}>--netfilter-mode <Tag style={{ fontSize: 10 }}>Linux</Tag></Text>
                    <Select
                      style={{ width: '100%' }}
                      value={deployParams.netfilterMode || 'on'}
                      onChange={(v) => setDeployParams({ ...deployParams, netfilterMode: v })}
                      options={[
                        { value: 'on', label: `on (${t.devices.paramNetfilterOn})` },
                        { value: 'nodivert', label: `nodivert (${t.devices.paramNetfilterNodivert})` },
                        { value: 'off', label: `off (${t.devices.paramNetfilterOff})` },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Generated Command */}
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong><CodeOutlined style={{ marginRight: 8 }} />{t.devices.generatedCommand}</Text>
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(buildTailscaleCommand); message.success(t.devices.commandCopied); }}>
                {t.devices.copyCommand}
              </Button>
            </div>
            <pre style={{ background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: 12, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflow: 'auto', userSelect: 'all' }}>
              {buildTailscaleCommand}
            </pre>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
