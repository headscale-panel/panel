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

import type { NetworkIdentity } from '@/api/entities';
import type { NormalizedDevice } from '@/lib/normalizers';
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
  TagOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { useRequest } from 'ahooks';
import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Modal,
  Segmented,
  Space,
  Spin,
  Switch,
  Tag,
  theme,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { authApi, deviceApi } from '@/api';
import DashboardLayout from '@/components/DashboardLayout';
import AddDeviceModal from '@/components/devices/AddDeviceModal';
import PageHeaderStatCards from '@/components/PageHeaderStatCards';
import EditDeviceTagsModal from '@/components/shared/EditDeviceTagsModal';
import RenameDeviceModal from '@/components/shared/RenameDeviceModal';
import { useTranslation } from '@/i18n/index';
import { DeviceIdentityFilter, MAX_VISIBLE_DEVICE_TAGS, TAG_PREFIX } from '@/lib/enums';
import { normalizeDeviceListResponse } from '@/lib/normalizers';
import { hasPermission, PermissionCode } from '@/lib/permissions';
import { useAuthStore } from '@/lib/store';

const { Text, Title } = Typography;

type IdentityFilter = DeviceIdentityFilter;

function parseTagSearchTokens(rawQuery: string) {
  const tokens = rawQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const tagTokens: string[] = [];
  const textTokens: string[] = [];
  for (const token of tokens) {
    if (token.startsWith(TAG_PREFIX) && token.length > TAG_PREFIX.length) {
      tagTokens.push(token.slice(TAG_PREFIX.length));
    } else {
      textTokens.push(token);
    }
  }

  return { tagTokens, textTokens };
}

function getIdentityKind(device: NormalizedDevice): Exclude<IdentityFilter, DeviceIdentityFilter.All> {
  if (device.owner_tagged)
    return DeviceIdentityFilter.Tagged;
  const hasOwner = Boolean(device.user?.name?.trim() || device.owner_name?.trim());
  const hasTags = (device.tags || []).length > 0;
  if (hasOwner)
    return DeviceIdentityFilter.Owner;
  if (hasTags)
    return DeviceIdentityFilter.Tagged;
  return DeviceIdentityFilter.Unassigned;
}

export default function Devices() {
  const t = useTranslation();
  const { token } = theme.useToken();
  const [location, setLocation] = useLocation();
  const { user } = useAuthStore();
  const [initialLoading, setInitialLoading] = useState(true);

  const canListDevices = hasPermission(user, PermissionCode.NetworkDeviceList)
    || hasPermission(user, PermissionCode.NetworkDeviceListSelf);
  const canCreatePreAuthKey = hasPermission(user, PermissionCode.NetworkKeyCreate)
    || hasPermission(user, PermissionCode.NetworkKeyCreateSelf);
  const canRegisterNode = hasPermission(user, PermissionCode.NetworkDeviceCreate)
    || hasPermission(user, PermissionCode.NetworkDeviceCreateSelf);
  const canRenameDevice = hasPermission(user, PermissionCode.NetworkDeviceUpdate)
    || hasPermission(user, PermissionCode.NetworkDeviceUpdateSelf);
  const canManageTags = hasPermission(user, PermissionCode.NetworkDeviceTags);
  const canDeleteDevice = hasPermission(user, PermissionCode.NetworkDeviceDelete)
    || hasPermission(user, PermissionCode.NetworkDeviceDeleteSelf);

  // Devices are created against a tailnet identity, not a username: the
  // self-service path uses whichever identity this account owns.
  const { data: ownIdentities } = useRequest<NetworkIdentity[], []>(
    async () => (canCreatePreAuthKey || canRegisterNode
      ? authApi.meNetworkIdentities().catch((): NetworkIdentity[] => [])
      : []),
  );
  const ownerIdentity = ownIdentities?.find((identity) => identity.is_primary) ?? ownIdentities?.[0];
  const ownerId = ownerIdentity?.hs_user_id ?? 0;
  const ownerName = ownerIdentity?.display_name || ownerIdentity?.name || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [identityFilter, setIdentityFilter] = useState<IdentityFilter>(DeviceIdentityFilter.All);
  const [hasTagOnly, setHasTagOnly] = useState(false);

  const [addDeviceDialogOpen, setAddDeviceDialogOpen] = useState(false);

  const [renameDeviceDialogOpen, setRenameDeviceDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<NormalizedDevice | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagDevice, setTagDevice] = useState<NormalizedDevice | null>(null);

  const { data: listData, loading, refresh } = useRequest(
    async () => {
      if (!canListDevices) {
        return { list: [] };
      }
      const devicesRes = await deviceApi.list();
      const { list } = normalizeDeviceListResponse(devicesRes);
      return { list };
    },
    {
      refreshDeps: [canListDevices],
      onSuccess: () => {
        setInitialLoading(false);
      },
      onError: (error: any) => {
        setInitialLoading(false);
        message.error(t.devices.loadFailed + (error.message ? `: ${error.message}` : ''));
      },
    },
  );

  const devices: NormalizedDevice[] = listData?.list || [];

  useEffect(() => {
    const queryString = location.includes('?') ? location.slice(location.indexOf('?') + 1) : '';
    const params = new URLSearchParams(queryString);
    const tag = (params.get('tag') || '').trim();
    const identity = (params.get('identity') || '').trim();

    if (tag) {
      setSearchQuery(`${TAG_PREFIX}${tag}`);
      setHasTagOnly(true);
    }

    if (
      identity === DeviceIdentityFilter.Owner
      || identity === DeviceIdentityFilter.Tagged
      || identity === DeviceIdentityFilter.Unassigned
      || identity === DeviceIdentityFilter.All
    ) {
      setIdentityFilter(identity);
    }
  }, [location]);

  const filteredDevices = useMemo(() => {
    const { tagTokens, textTokens } = parseTagSearchTokens(searchQuery);

    return devices.filter((device) => {
      const identity = getIdentityKind(device);
      if (identityFilter !== DeviceIdentityFilter.All && identity !== identityFilter) {
        return false;
      }

      const deviceTags = device.tags || [];
      if (hasTagOnly && deviceTags.length === 0) {
        return false;
      }

      if (tagTokens.length > 0) {
        const normalizedTags = deviceTags.map((tag) => tag.toLowerCase());
        const hasAllTagTokens = tagTokens.every((tagToken) => normalizedTags.some((tag) => tag.includes(tagToken)));
        if (!hasAllTagTokens) {
          return false;
        }
      }

      if (textTokens.length === 0) {
        return true;
      }

      const searchable = [
        device.name,
        device.given_name,
        ...(device.ip_addresses || []),
        device.user?.name || '',
        ...(device.tags || []),
      ].join(' ').toLowerCase();

      return textTokens.every((token) => searchable.includes(token));
    });
  }, [devices, hasTagOnly, identityFilter, searchQuery]);

  const onlineCount = devices.filter((device) => device.online).length;

  const taggedOnlyCount = devices.filter((device) => getIdentityKind(device) === DeviceIdentityFilter.Tagged).length;

  const openAddDeviceDialog = () => {
    if (ownerId === 0) {
      // Without a bound tailnet identity there is nobody to register the device
      // for, and inventing a name would create a headscale user nobody owns.
      message.error(t.devices.selectUserFirst);
      return;
    }
    setAddDeviceDialogOpen(true);
  };

  const openRenameDeviceDialog = (device: NormalizedDevice) => {
    setSelectedDevice(device);
    setRenameDeviceDialogOpen(true);
  };

  const openTagDialog = (device: NormalizedDevice) => {
    setTagDevice(device);
    setTagDialogOpen(true);
  };

  const handleDeleteDevice = (device: NormalizedDevice) => {
    Modal.confirm({
      title: t.devices.confirmDelete.replace('{name}', device.given_name || device.name),
      okText: t.common.actions.delete,
      okButtonProps: { danger: true },
      cancelText: t.common.actions.cancel,
      onOk: async () => {
        try {
          await deviceApi.delete({ id: device.id });
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

  const navigateToACLByTag = (tag: string) => {
    setLocation(`/acl?tag=${encodeURIComponent(tag)}`);
  };

  if (initialLoading && loading) {
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
            { label: t.devices.taggedOnly, value: taggedOnlyCount, icon: <LaptopOutlined className="stat-icon-accent" />, watermark: 'TAG' },
          ]}
        />

        <Alert
          showIcon
          type="info"
          message={t.devices.identityModeNotice}
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
            <Segmented
              value={identityFilter}
              onChange={(value) => setIdentityFilter(value as IdentityFilter)}
              options={[
                { value: DeviceIdentityFilter.All, label: t.devices.identityAll },
                { value: DeviceIdentityFilter.Owner, label: t.devices.identityOwnerBased },
                { value: DeviceIdentityFilter.Tagged, label: t.devices.identityTaggedOnly },
                { value: DeviceIdentityFilter.Unassigned, label: t.devices.identityUnassigned },
              ]}
            />
            <div className="flex items-center gap-2 px-2">
              <Text type="secondary">{t.devices.hasTagOnly}</Text>
              <Switch checked={hasTagOnly} onChange={setHasTagOnly} />
            </div>
            {!canListDevices && (
              <Tag color="warning">{t.common.errors.forbidden}</Tag>
            )}
          </div>

          {!canListDevices
            ? (
                <Text type="secondary">{t.common.errors.forbidden}</Text>
              )
            : filteredDevices.length === 0
              ? (
                  <div style={{ border: `1px dashed ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '32px 16px', textAlign: 'center' }}>
                    <Text type="secondary">{t.devices.noData}</Text>
                  </div>
                )
              : (
                  <Space direction="vertical" className="w-full" size={12}>
                    {filteredDevices.map((device) => (
                      <div
                        key={device.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
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
                            {getIdentityKind(device) === DeviceIdentityFilter.Owner && (
                              <Tag color="blue" className="m-0">{t.devices.identityOwnerLabel.replace('{owner}', device.user?.name || device.owner_name || '-')}</Tag>
                            )}
                            {getIdentityKind(device) === DeviceIdentityFilter.Tagged && (
                              <Tag color="gold" className="m-0">{t.devices.identityTaggedOnly}</Tag>
                            )}
                            {getIdentityKind(device) === DeviceIdentityFilter.Unassigned && (
                              <Tag className="m-0">{t.devices.identityUnassigned}</Tag>
                            )}
                            {device.ephemeral && (
                              <Tag color="purple" className="m-0">{t.devices.ephemeralBadge}</Tag>
                            )}
                            {device.online
                              ? (
                                  <Tag color="success" className="m-0">
                                    <WifiOutlined />
                                    {' '}
                                    {t.common.status.online}
                                  </Tag>
                                )
                              : (
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
                                {ip}
                                {' '}
                                <CopyOutlined className="text-10px" />
                              </Tag>
                            ))}
                            {(device.tags || []).slice(0, MAX_VISIBLE_DEVICE_TAGS).map((tag) => (
                              <Tooltip key={tag} title={t.devices.openAclTagHint.replace('{tag}', tag)}>
                                <Tag
                                  color="gold"
                                  className="cursor-pointer m-0"
                                  onClick={() => navigateToACLByTag(tag)}
                                >
                                  {tag}
                                </Tag>
                              </Tooltip>
                            ))}
                            {(device.tags || []).length > MAX_VISIBLE_DEVICE_TAGS && (
                              <Tooltip title={(device.tags || []).slice(MAX_VISIBLE_DEVICE_TAGS).join(', ')}>
                                <Tag className="m-0">
                                  +
                                  {(device.tags || []).length - MAX_VISIBLE_DEVICE_TAGS}
                                </Tag>
                              </Tooltip>
                            )}
                            {device.last_seen && (
                              <Text type="secondary" className="text-12px">
                                <ClockCircleOutlined className="mr-1" />
                                {new Date(device.last_seen).toLocaleString()}
                              </Text>
                            )}
                          </div>
                        </div>
                        <Space size={6} style={{ marginLeft: 'auto' }}>
                          <Tooltip title={t.devices.editTags}>
                            <Button
                              type="text"
                              size="small"
                              icon={<TagOutlined />}
                              onClick={() => openTagDialog(device)}
                              disabled={!canManageTags}
                            />
                          </Tooltip>
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
          open={addDeviceDialogOpen && ownerId > 0}
          ownerId={ownerId}
          ownerName={ownerName || (user?.username ?? '')}
          canCreatePreAuthKey={canCreatePreAuthKey}
          canRegisterNode={canRegisterNode}
          onCancel={() => setAddDeviceDialogOpen(false)}
          onSuccess={() => {
            setAddDeviceDialogOpen(false); if (canListDevices)
              refresh();
          }}
        />

        <RenameDeviceModal
          open={renameDeviceDialogOpen}
          device={selectedDevice}
          onCancel={() => setRenameDeviceDialogOpen(false)}
          onSuccess={() => { setRenameDeviceDialogOpen(false); setSelectedDevice(null); refresh(); }}
        />

        <EditDeviceTagsModal
          open={tagDialogOpen}
          device={tagDevice}
          onCancel={() => { setTagDialogOpen(false); setTagDevice(null); }}
          onSuccess={() => { setTagDialogOpen(false); setTagDevice(null); refresh(); }}
        />
      </div>
    </DashboardLayout>
  );
}
