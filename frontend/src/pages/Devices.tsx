import { useMemo, useState } from 'react';
import { useRequest } from 'ahooks';
import {
  Button,
  Card,
  Input,
  Modal,
  Space,
  Spin,
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
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import { devicesAPI } from '@/lib/api';
import { normalizeDeviceListResponse, type NormalizedDevice } from '@/lib/normalizers';
import AddDeviceModal from '@/components/devices/AddDeviceModal';
import RenameDeviceModal from '@/components/shared/RenameDeviceModal';
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

  const [searchQuery, setSearchQuery] = useState('');

  const [addDeviceDialogOpen, setAddDeviceDialogOpen] = useState(false);

  const [renameDeviceDialogOpen, setRenameDeviceDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<NormalizedDevice | null>(null);

  const { data: listData, loading, refresh } = useRequest(
    async () => {
      if (!canListDevices) {
        return { list: [] };
      }
      const devicesRes = await devicesAPI.list({ all: true });
      const { list } = normalizeDeviceListResponse(devicesRes);
      return { list };
    },
    {
      refreshDeps: [canListDevices],
      onError: (error: any) => {
        message.error(t.devices.loadFailed + (error.message ? `: ${error.message}` : ''));
      },
    },
  );

  const devices: NormalizedDevice[] = listData?.list || [];

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
  };

  const openRenameDeviceDialog = (device: NormalizedDevice) => {
    setSelectedDevice(device);
    setRenameDeviceDialogOpen(true);
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
          refresh();
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
        <div className="centered-loading">
          <Spin indicator={<LoadingOutlined className="text-32px" />} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <Title level={4} className="m-0">{t.sidebar.devices}</Title>
            <Text type="secondary">{t.devices.addDeviceDesc}</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={refresh} loading={loading}>
              {t.common.actions.refresh}
            </Button>
            {(canCreatePreAuthKey || canRegisterNode) && (
              <Button data-tour-id="devices-add" type="primary" icon={<PlusOutlined />} onClick={openAddDeviceDialog}>
                {t.devices.addDevice}
              </Button>
            )}
          </Space>
        </div>

        <PageHeaderStatCards
          minCardWidth={220}
          gap={16}
          items={[
            { label: t.dashboard.totalDevicesLabel, value: devices.length, icon: <DesktopOutlined className="stat-icon-primary" />, watermark: 'ALL' },
            { label: t.dashboard.onlineDevices, value: onlineCount, icon: <WifiOutlined className="stat-icon-success" />, watermark: 'ON' },
            { label: t.devices.tableOwner, value: owner || t.setupWelcome.noDataPlaceholder, icon: <LaptopOutlined className="stat-icon-accent" />, watermark: 'OWN' },
          ]}
        />

        <Card data-tour-id="devices-list">
          <div className="flex gap-3 flex-wrap mb-4">
            <Input
              data-tour-id="devices-search"
              placeholder={t.devices.searchPlaceholder}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              allowClear
              className="max-w-90"
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
            <Space direction="vertical" className="w-full" size={12}>
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Text strong>{device.given_name || device.name}</Text>
                      {device.online ? (
                        <Tag color="success" className="m-0"><WifiOutlined /> {t.common.status.online}</Tag>
                      ) : (
                        <Tag className="m-0">{t.common.status.offline}</Tag>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {device.ip_addresses.map((ip) => (
                        <Tag
                          key={ip}
                          className="cursor-pointer font-mono m-0"
                          onClick={() => void handleCopy(ip, t.devices.ipCopied)}
                        >
                          {ip} <CopyOutlined className="text-10px" />
                        </Tag>
                      ))}
                      {device.last_seen && (
                        <Text type="secondary" className="text-12px">
                          <ClockCircleOutlined className="mr-1" />
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

        <AddDeviceModal
          open={addDeviceDialogOpen}
          owner={owner}
          canCreatePreAuthKey={canCreatePreAuthKey}
          canRegisterNode={canRegisterNode}
          onCancel={() => setAddDeviceDialogOpen(false)}
          onSuccess={() => { setAddDeviceDialogOpen(false); if (canListDevices) refresh(); }}
        />

        <RenameDeviceModal
          open={renameDeviceDialogOpen}
          device={selectedDevice}
          onCancel={() => setRenameDeviceDialogOpen(false)}
          onSuccess={() => { setRenameDeviceDialogOpen(false); setSelectedDevice(null); refresh(); }}
        />
      </div>
    </DashboardLayout>
  );
}
