import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import {
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DesktopOutlined,
  EditOutlined,
  LaptopOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import DashboardLayout from '@/components/DashboardLayout';
import { devicesAPI, usersAPI } from '@/lib/api';
import { normalizeDeviceListResponse, type NormalizedDevice } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';
import { useAuthStore } from '@/lib/store';
import { hasPermission } from '@/lib/permissions';

const { Text, Title } = Typography;

export default function Devices() {
  const t = useTranslation();
  const { token } = theme.useToken();
  const { user } = useAuthStore();

  const owner = (user?.headscale_name || user?.username || '').trim();
  const canListDevices = hasPermission(user, 'headscale:machine:list');
  const canCreatePreAuthKey = hasPermission(user, 'headscale:preauthkey:create');
  const canRegisterNode = hasPermission(user, 'headscale:machine:create');
  const canRenameDevice = hasPermission(user, 'headscale:machine:update');
  const canDeleteDevice = hasPermission(user, 'headscale:machine:delete');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [devices, setDevices] = useState<NormalizedDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [addDeviceDialogOpen, setAddDeviceDialogOpen] = useState(false);
  const [addDeviceTab, setAddDeviceTab] = useState(canCreatePreAuthKey ? 'preauth' : 'machine');
  const [addDeviceReusable, setAddDeviceReusable] = useState(false);
  const [addDeviceEphemeral, setAddDeviceEphemeral] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [machineKey, setMachineKey] = useState('');
  const [registeringNode, setRegisteringNode] = useState(false);

  const [renameDeviceDialogOpen, setRenameDeviceDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<NormalizedDevice | null>(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [deviceNameError, setDeviceNameError] = useState('');

  const loadDevices = async (showToast = false) => {
    if (!owner || !canListDevices) {
      setDevices([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showToast) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const devicesRes = await devicesAPI.list({ page: 1, pageSize: 1000, userId: owner });
      const { list } = normalizeDeviceListResponse(devicesRes);
      setDevices(list);
      if (showToast) {
        message.success(t.dashboard.dataRefreshed);
      }
    } catch (error: any) {
      message.error(t.devices.loadFailed + (error.message ? `: ${error.message}` : ''));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDevices();
  }, [owner, canListDevices]);

  const filteredDevices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return devices;
    }

    return devices.filter((device) => (
      device.name.toLowerCase().includes(query) ||
      device.given_name.toLowerCase().includes(query) ||
      device.ip_addresses.some((ip) => ip.toLowerCase().includes(query))
    ));
  }, [devices, searchQuery]);

  const onlineCount = filteredDevices.filter((device) => device.online).length;

  const openAddDeviceDialog = () => {
    if (!owner) {
      message.error(t.devices.selectUserFirst);
      return;
    }
    setAddDeviceDialogOpen(true);
    setAddDeviceTab(canCreatePreAuthKey ? 'preauth' : 'machine');
    setAddDeviceReusable(false);
    setAddDeviceEphemeral(false);
    setGeneratedKey('');
    setMachineKey('');
  };

  const handleGenerateDeviceKey = async () => {
    if (!owner) {
      message.error(t.devices.selectUserFirst);
      return;
    }

    try {
      const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res: any = await usersAPI.createPreAuthKey(owner, addDeviceReusable, addDeviceEphemeral, expiration);
      const key = res?.preAuthKey?.key || res?.key || res?.preauthkey?.key || '';
      if (!key) {
        message.error(t.devices.keyGenerateFailed);
        return;
      }
      setGeneratedKey(key);
      message.success(t.devices.keyGenerated);
    } catch (error: any) {
      message.error(t.devices.keyGenerateFailed + (error.message ? `: ${error.message}` : ''));
    }
  };

  const handleRegisterDevice = async () => {
    if (!owner || !machineKey.trim()) {
      message.error(t.devices.machineKeyRequired);
      return;
    }

    setRegisteringNode(true);
    try {
      await devicesAPI.registerNode(owner, machineKey.trim());
      message.success(t.devices.registerNodeSuccess);
      setAddDeviceDialogOpen(false);
      setMachineKey('');
      if (canListDevices) {
        void loadDevices();
      }
    } catch (error: any) {
      message.error(t.devices.registerNodeFailed + (error.message ? `: ${error.message}` : ''));
    } finally {
      setRegisteringNode(false);
    }
  };

  const openRenameDeviceDialog = (device: NormalizedDevice) => {
    setSelectedDevice(device);
    setNewDeviceName((device.given_name || device.name).toLowerCase());
    setDeviceNameError('');
    setRenameDeviceDialogOpen(true);
  };

  const handleRenameDevice = async () => {
    if (!selectedDevice || !newDeviceName.trim()) {
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(newDeviceName.trim())) {
      setDeviceNameError(t.devices.nameLowercaseError);
      return;
    }

    try {
      await devicesAPI.rename(selectedDevice.id, newDeviceName.trim());
      message.success(t.devices.renameSuccess);
      setRenameDeviceDialogOpen(false);
      setSelectedDevice(null);
      void loadDevices();
    } catch (error: any) {
      message.error(t.devices.renameFailed + (error.message || t.common.errors.unknownError));
    }
  };

  const handleDeleteDevice = (device: NormalizedDevice) => {
    Modal.confirm({
      title: t.devices.confirmDelete.replace('{name}', device.given_name || device.name),
      okText: t.common.actions.delete,
      okButtonProps: { danger: true },
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await devicesAPI.delete(device.id);
          message.success(t.devices.deleteSuccess);
          void loadDevices();
        } catch (error: any) {
          message.error(t.devices.deleteFailed + (error.message ? `: ${error.message}` : ''));
        }
      },
    });
  };

  const handleCopy = async (value: string, successMessage: string) => {
    await navigator.clipboard.writeText(value);
    message.success(successMessage);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{t.sidebar.devices}</Title>
            <Text type="secondary">{t.devices.addDeviceDesc}</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined spin={refreshing} />} onClick={() => void loadDevices(true)} loading={refreshing}>
              {t.common.actions.refresh}
            </Button>
            {(canCreatePreAuthKey || canRegisterNode) && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAddDeviceDialog}>
                {t.devices.addDevice}
              </Button>
            )}
          </Space>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          <Card>
            <Text type="secondary" style={{ fontSize: 13 }}>{t.dashboard.totalDevicesLabel}</Text>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{devices.length}</div>
          </Card>
          <Card>
            <Text type="secondary" style={{ fontSize: 13 }}>{t.dashboard.onlineDevices}</Text>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{onlineCount}</div>
          </Card>
          <Card>
            <Text type="secondary" style={{ fontSize: 13 }}>{t.devices.tableOwner}</Text>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{owner || t.setupWelcome.noDataPlaceholder}</div>
          </Card>
        </div>

        <Card>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Input
              placeholder={t.devices.searchPlaceholder}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              allowClear
              style={{ maxWidth: 360 }}
            />
            {!canListDevices && (
              <Tag color="warning">{t.common.errors.forbidden}</Tag>
            )}
          </div>

          {!canListDevices ? (
            <Text type="secondary">{t.common.errors.forbidden}</Text>
          ) : filteredDevices.length === 0 ? (
            <div style={{ border: `1px dashed ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '32px 16px', textAlign: 'center' }}>
              <Text type="secondary">{t.devices.noData}</Text>
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {filteredDevices.map((device) => (
                <div
                  key={device.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderRadius: token.borderRadius,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgContainer,
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: token.colorBgLayout, flexShrink: 0 }}>
                    <DesktopOutlined style={{ color: token.colorTextSecondary }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text strong>{device.given_name || device.name}</Text>
                      {device.online ? (
                        <Tag color="success" style={{ margin: 0 }}><WifiOutlined /> {t.common.status.online}</Tag>
                      ) : (
                        <Tag style={{ margin: 0 }}>{t.common.status.offline}</Tag>
                      )}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {device.ip_addresses.map((ip) => (
                        <Tag
                          key={ip}
                          style={{ cursor: 'pointer', fontFamily: 'monospace', margin: 0 }}
                          onClick={() => void handleCopy(ip, t.devices.ipCopied)}
                        >
                          {ip} <CopyOutlined style={{ fontSize: 10 }} />
                        </Tag>
                      ))}
                      {device.last_seen && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          <ClockCircleOutlined style={{ marginRight: 4 }} />
                          {new Date(device.last_seen).toLocaleString()}
                        </Text>
                      )}
                    </div>
                  </div>
                  <Space size={4}>
                    <Tooltip title={t.devices.renameDialogTitle}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openRenameDeviceDialog(device)}
                        disabled={!canRenameDevice}
                      />
                    </Tooltip>
                    <Tooltip title={t.common.actions.delete}>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteDevice(device)}
                        disabled={!canDeleteDevice}
                      />
                    </Tooltip>
                  </Space>
                </div>
              ))}
            </Space>
          )}
        </Card>

        <Modal
          open={addDeviceDialogOpen}
          title={t.devices.addDeviceTitle}
          onCancel={() => setAddDeviceDialogOpen(false)}
          footer={null}
          width={680}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{t.devices.addDeviceDesc}</Text>
          <div style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 13 }}>{t.devices.tableOwner}</Text>
            <div style={{ marginTop: 4 }}>
              <Tag color="blue">{owner}</Tag>
            </div>
          </div>

          <Tabs
            activeKey={addDeviceTab}
            onChange={setAddDeviceTab}
            items={[
              {
                key: 'preauth',
                label: t.devices.tabPreAuth,
                disabled: !canCreatePreAuthKey,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                      <Tag.CheckableTag checked={addDeviceReusable} onChange={setAddDeviceReusable}>
                        {t.devices.reusableKey}
                      </Tag.CheckableTag>
                      <Tag.CheckableTag checked={addDeviceEphemeral} onChange={setAddDeviceEphemeral}>
                        {t.devices.ephemeralKey}
                      </Tag.CheckableTag>
                    </div>

                    <Button type="primary" onClick={handleGenerateDeviceKey}>
                      {t.devices.generateKey}
                    </Button>

                    {generatedKey && (
                      <Card size="small">
                        <Text strong>{t.devices.preAuthKey}</Text>
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Text code style={{ wordBreak: 'break-all' }}>{generatedKey}</Text>
                          <Button size="small" icon={<CopyOutlined />} onClick={() => void handleCopy(generatedKey, t.devices.keyCopied)}>
                            {t.devices.copyCommand}
                          </Button>
                        </div>
                        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{t.devices.keyExpireHint}</Text>
                      </Card>
                    )}
                  </Space>
                ),
              },
              {
                key: 'machine',
                label: t.devices.tabMachineKey,
                disabled: !canRegisterNode,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <div>
                      <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t.devices.machineKeyLabel}</Text>
                      <Input
                        value={machineKey}
                        onChange={(event) => setMachineKey(event.target.value)}
                        placeholder={t.devices.machineKeyPlaceholder}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>{t.devices.machineKeyHint}</Text>
                    </div>
                    <Button type="primary" onClick={handleRegisterDevice} loading={registeringNode}>
                      {t.devices.registerNode}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Modal>

        <Modal
          open={renameDeviceDialogOpen}
          title={t.devices.renameDialogTitle}
          onCancel={() => setRenameDeviceDialogOpen(false)}
          onOk={handleRenameDevice}
          okText={t.common.actions.save}
          cancelText={t.common.actions.cancel}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t.devices.renameDialogDesc.replace('{name}', selectedDevice?.given_name || selectedDevice?.name || '')}
          </Text>
          <Input value={newDeviceName} onChange={(event) => setNewDeviceName(event.target.value)} />
          {deviceNameError && (
            <Text type="danger" style={{ display: 'block', marginTop: 8 }}>
              {deviceNameError}
            </Text>
          )}
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            <LaptopOutlined style={{ marginRight: 4 }} />
            {t.devices.nameLowercaseHint}
          </Text>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
