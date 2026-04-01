import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Collapse,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
  theme,
} from 'antd';
import {
  CodeOutlined,
  CopyOutlined,
  DesktopOutlined,
  KeyOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { devicesAPI, usersAPI } from '@/lib/api';
import type { NormalizedSystemUser } from '@/lib/normalizers';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface AddDeviceModalProps {
  open: boolean;
  hsUsers: NormalizedSystemUser[];
  onCancel: () => void;
  onSuccess: () => void;
}

const DEFAULT_DEPLOY_PARAMS = {
  hostname: '',
  acceptDns: true,
  acceptRoutes: false,
  advertiseExitNode: false,
  ssh: false,
  shieldsUp: false,
  advertiseConnector: false,
  advertiseRoutes: '',
  advertiseTags: '',
  exitNode: '',
  exitNodeAllowLan: false,
  forceReauth: false,
  reset: false,
  snatSubnetRoutes: true,
  statefulFiltering: false,
  operator: '',
  netfilterMode: 'on',
};

// Parse protobuf Timestamp ({seconds, nanos} or ISO string) to Date
function parseTimestamp(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d.getTime()) ? null : d; }
  if (ts.seconds != null) return new Date(Number(ts.seconds) * 1000 + (ts.nanos || 0) / 1e6);
  return null;
}

export default function AddDeviceModal({ open, hsUsers, onCancel, onSuccess }: AddDeviceModalProps) {
  const t = useTranslation();
  const { token } = theme.useToken();

  const [activeTab, setActiveTab] = useState('machinekey');
  const [reusable, setReusable] = useState(false);
  const [ephemeral, setEphemeral] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [machineKey, setMachineKey] = useState('');
  const [registeringNode, setRegisteringNode] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [preAuthKeysList, setPreAuthKeysList] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [deployParams, setDeployParams] = useState(DEFAULT_DEPLOY_PARAMS);

  useEffect(() => {
    if (open) {
      setActiveTab('machinekey');
      setReusable(false);
      setEphemeral(false);
      setGeneratedKey('');
      setMachineKey('');
      setRegisteringNode(false);
      setSelectedUser('');
      setPreAuthKeysList([]);
      setDeployParams(DEFAULT_DEPLOY_PARAMS);
    }
  }, [open]);

  const loadPreAuthKeys = useCallback(async (user: string) => {
    if (!user) { setPreAuthKeysList([]); return; }
    setLoadingKeys(true);
    try {
      const res: any = await usersAPI.getPreAuthKeys(user);
      const keys = Array.isArray(res) ? res : (res?.preAuthKeys || res?.preAuthKey || res?.preauthkeys || res?.pre_auth_keys || []);
      setPreAuthKeysList(Array.isArray(keys) ? keys : []);
    } catch {
      setPreAuthKeysList([]);
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  const handleUserChange = (val: string) => {
    setSelectedUser(val);
    setGeneratedKey('');
    loadPreAuthKeys(val);
  };

  const handleGenerateKey = async () => {
    if (!selectedUser) {
      message.error(t.devices.selectUserFirst);
      return;
    }
    try {
      const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res: any = await usersAPI.createPreAuthKey(selectedUser, reusable, ephemeral, expiration);
      const key = res?.preAuthKey?.key || res?.key || res?.preauthkey?.key || '';
      if (!key) {
        message.error(t.devices.keyGenerateFailed);
        return;
      }
      setGeneratedKey(key);
      message.success(t.devices.keyGenerated);
      loadPreAuthKeys(selectedUser);
    } catch (error: any) {
      message.error(t.devices.keyGenerateFailed + (error.message ? `: ${error.message}` : ''));
    }
  };

  const handleExpireKey = async (key: string) => {
    if (!selectedUser) return;
    try {
      await usersAPI.expirePreAuthKey(selectedUser, key);
      message.success(t.devices.expireKeySuccess);
      if (generatedKey === key) setGeneratedKey('');
      loadPreAuthKeys(selectedUser);
    } catch {
      message.error(t.devices.expireKeyFailed);
    }
  };

  const handleRegisterDevice = async () => {
    if (!selectedUser || !machineKey.trim()) {
      message.error(t.devices.machineKeyRequired);
      return;
    }
    setRegisteringNode(true);
    try {
      await devicesAPI.registerNode(selectedUser, machineKey.trim());
      message.success(t.devices.registerNodeSuccess);
      onCancel();
      onSuccess();
    } catch (error: any) {
      message.error(t.devices.registerNodeFailed + (error.message ? `: ${error.message}` : ''));
    } finally {
      setRegisteringNode(false);
    }
  };

  const serverBaseURL = useMemo(() => window.location.origin, []);

  const buildTailscaleCommand = useMemo(() => {
    const parts = ['tailscale up'];
    parts.push(`--login-server=${serverBaseURL}`);
    if (generatedKey) parts.push(`--authkey=${generatedKey}`);
    if (deployParams.hostname) parts.push(`--hostname=${deployParams.hostname}`);
    if (deployParams.acceptDns) parts.push('--accept-dns=true');
    if (deployParams.acceptRoutes) parts.push('--accept-routes');
    if (deployParams.advertiseExitNode) parts.push('--advertise-exit-node');
    if (deployParams.ssh) parts.push('--ssh');
    if (deployParams.shieldsUp) parts.push('--shields-up');
    if (deployParams.advertiseConnector) parts.push('--advertise-connector');
    if (deployParams.advertiseRoutes) parts.push(`--advertise-routes=${deployParams.advertiseRoutes}`);
    if (deployParams.advertiseTags) parts.push(`--advertise-tags=${deployParams.advertiseTags}`);
    if (deployParams.exitNode) parts.push(`--exit-node=${deployParams.exitNode}`);
    if (deployParams.exitNodeAllowLan) parts.push('--exit-node-allow-lan-access');
    if (deployParams.forceReauth) parts.push('--force-reauth');
    if (deployParams.reset) parts.push('--reset');
    if (!deployParams.snatSubnetRoutes) parts.push('--snat-subnet-routes=false');
    if (deployParams.statefulFiltering) parts.push('--stateful-filtering');
    if (deployParams.operator) parts.push(`--operator=${deployParams.operator}`);
    if (deployParams.netfilterMode && deployParams.netfilterMode !== 'on') parts.push(`--netfilter-mode=${deployParams.netfilterMode}`);
    return parts.join(' \\\n  ');
  }, [serverBaseURL, generatedKey, deployParams]);

  return (
    <Modal
      open={open}
      title={t.devices.addDeviceTitle}
      onCancel={onCancel}
      footer={<Button onClick={onCancel}>{t.common.actions.close}</Button>}
      width={780}
    >
      <Text type="secondary" className="block mb-3">{t.devices.addDeviceDesc}</Text>

      {/* User Selector */}
      <div className="mb-4">
        <Text className="form-label">{t.devices.selectUser}</Text>
        <Select
          className="w-full"
          value={selectedUser || undefined}
          onChange={handleUserChange}
          placeholder={t.devices.selectUserFirst}
          showSearch
          optionFilterProp="label"
          options={hsUsers.map((u) => ({
            value: u.headscale_name || u.username,
            label: `${u.display_name || u.username} (${u.headscale_name || u.username})`,
          }))}
        />
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'machinekey',
            label: <span><DesktopOutlined className="mr-2" />{t.devices.tabMachineKey}</span>,
            children: (
              <Space direction="vertical" className="w-full" size={16}>
                <div>
                  <Text className="form-label">{t.devices.machineKeyLabel}</Text>
                  <Input
                    className="font-mono text-12px"
                    placeholder={t.devices.machineKeyPlaceholder}
                    value={machineKey}
                    onChange={(e) => setMachineKey(e.target.value)}
                  />
                  <Text type="secondary" className="text-12px mt-1 block">{t.devices.machineKeyHint}</Text>
                </div>
                <Button
                  block
                  type="primary"
                  onClick={handleRegisterDevice}
                  disabled={!machineKey.trim() || !selectedUser}
                  loading={registeringNode}
                  icon={<DesktopOutlined />}
                >
                  {t.devices.registerNode}
                </Button>
              </Space>
            ),
          },
          {
            key: 'preauth',
            label: <span><KeyOutlined className="mr-2" />{t.devices.tabPreAuth}</span>,
            children: (
              <Space direction="vertical" className="w-full" size={16}>
                {/* Generate new key section */}
                <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: 16 }}>
                  <Text strong className="text-13px block mb-3">{t.devices.generateKey}</Text>
                  <div className="flex gap-3 mb-3">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '8px 12px' }}>
                      <Text className="text-12px">{t.devices.reusableKey}</Text>
                      <Switch size="small" checked={reusable} onChange={setReusable} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '8px 12px' }}>
                      <Text className="text-12px">{t.devices.ephemeralKey}</Text>
                      <Switch size="small" checked={ephemeral} onChange={setEphemeral} />
                    </div>
                  </div>
                  <Button block icon={<KeyOutlined />} onClick={handleGenerateKey} disabled={!selectedUser}>
                    {t.devices.generateKey}
                  </Button>
                  {generatedKey && (
                    <div style={{ marginTop: 12, background: token.colorBgLayout, borderRadius: token.borderRadius, padding: '8px 12px' }}>
                      <div className="flex justify-between items-center">
                        <Input readOnly value={generatedKey} size="small" className="font-mono text-11px flex-1 mr-2" />
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => { navigator.clipboard.writeText(generatedKey); message.success(t.devices.keyCopied); }}
                        />
                      </div>
                      <Text type="secondary" className="text-11px mt-1 block">{t.devices.keyExpireHint}</Text>
                    </div>
                  )}
                </div>

                {/* Existing keys list */}
                <div>
                  <Text strong className="text-13px block mb-2">{t.devices.existingKeys}</Text>
                  {loadingKeys ? (
                    <div className="text-center p-6"><Spin size="small" /></div>
                  ) : !selectedUser ? (
                    <Text type="secondary" className="text-12px">{t.devices.selectUserFirst}</Text>
                  ) : preAuthKeysList.length === 0 ? (
                    <Text type="secondary" className="text-12px">{t.devices.noExistingKeys}</Text>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {preAuthKeysList.map((k: any) => {
                        const expDate = parseTimestamp(k.expiration);
                        const isExpired = expDate && expDate < new Date();
                        const isUsedUp = k.used && !k.reusable;
                        return (
                          <div
                            key={k.id || k.key}
                            style={{
                              border: `1px solid ${token.colorBorderSecondary}`,
                              borderRadius: token.borderRadius,
                              padding: '10px 12px',
                              opacity: isExpired || isUsedUp ? 0.55 : 1,
                            }}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <Text copyable={{ text: k.key }} className="font-mono text-11px break-all">
                                {k.key?.length > 30 ? k.key.slice(0, 30) + '...' : k.key}
                              </Text>
                              {!isExpired && (
                                <Popconfirm
                                  title={t.devices.expireKeyConfirm}
                                  onConfirm={() => handleExpireKey(k.key)}
                                  okText={t.common.actions.confirm}
                                  cancelText={t.common.actions.cancel}
                                >
                                  <Button type="text" size="small" danger icon={<StopOutlined />} />
                                </Popconfirm>
                              )}
                            </div>
                            <Space size={4} wrap>
                              {k.reusable && <Tag color="blue" className="text-10px m-0">{t.devices.preAuthKeyReusable}</Tag>}
                              {k.ephemeral && <Tag color="orange" className="text-10px m-0">{t.devices.preAuthKeyEphemeral}</Tag>}
                              {k.used && <Tag color={k.reusable ? 'default' : 'red'} className="text-10px m-0">{t.devices.preAuthKeyUsed}</Tag>}
                              {isExpired && <Tag color="default" className="text-10px m-0">{t.devices.preAuthKeyExpired}</Tag>}
                              {k.acl_tags?.length > 0 && k.acl_tags.map((tag: string) => (
                                <Tag key={tag} className="text-10px m-0">{tag}</Tag>
                              ))}
                            </Space>
                            <div className="mt-1">
                              {parseTimestamp(k.created_at) && <Text type="secondary" className="text-10px mr-3">{t.devices.keyCreatedAt}: {parseTimestamp(k.created_at)!.toLocaleString()}</Text>}
                              {expDate && <Text type="secondary" className="text-10px">{t.devices.keyExpiration}: {expDate.toLocaleString()}</Text>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Space>
            ),
          },
          {
            key: 'deploy',
            label: <span><CodeOutlined className="mr-2" />{t.devices.tabDeploy}</span>,
            children: (
              <Space direction="vertical" className="w-full" size={12}>
                {/* Pre-Auth Key selector */}
                <div>
                  <Text className="form-label">{t.devices.usePreAuthKeyInCommand}</Text>
                  <div className="flex gap-2">
                    <Select
                      className="flex-1 min-w-0"
                      value={generatedKey || undefined}
                      onChange={(val) => setGeneratedKey(val || '')}
                      placeholder={t.devices.selectPreAuthKey}
                      allowClear
                      loading={loadingKeys}
                      disabled={!selectedUser}
                      notFoundContent={loadingKeys ? t.devices.loadingKeys : t.devices.noPreAuthKeys}
                      options={[
                        ...preAuthKeysList
                          .filter((k: any) => {
                            const exp = parseTimestamp(k.expiration);
                            const expired = exp && exp < new Date();
                            const used = k.used && !k.reusable;
                            return !expired && !used;
                          })
                          .map((k: any) => ({
                            value: k.key,
                            label: `${k.key?.length > 16 ? k.key.slice(0, 16) + '...' : k.key} ${k.reusable ? '[R]' : ''}${k.ephemeral ? '[E]' : ''}`,
                          })),
                        ...preAuthKeysList
                          .filter((k: any) => {
                            const exp = parseTimestamp(k.expiration);
                            const expired = exp && exp < new Date();
                            const used = k.used && !k.reusable;
                            return expired || used;
                          })
                          .map((k: any) => ({
                            value: k.key,
                            disabled: true,
                            label: `${k.key?.length > 16 ? k.key.slice(0, 16) + '...' : k.key} ${(() => { const exp = parseTimestamp(k.expiration); return exp && exp < new Date() ? `(${t.devices.preAuthKeyExpired})` : ''; })()}${k.used && !k.reusable ? `(${t.devices.preAuthKeyUsed})` : ''}`,
                          })),
                      ]}
                    />
                    <Button icon={<PlusOutlined />} onClick={handleGenerateKey} disabled={!selectedUser} className="flex-shrink-0">
                      {t.devices.generateNewKey}
                    </Button>
                  </div>
                </div>

                {/* Hostname */}
                <div>
                  <Text className="form-label">{t.devices.paramHostname}</Text>
                  <Input
                    value={deployParams.hostname}
                    onChange={(e) => setDeployParams(p => ({ ...p, hostname: e.target.value }))}
                    placeholder={t.devices.paramHostnamePlaceholder}
                    className="text-12px"
                  />
                  <Text type="secondary" className="text-12px mt-0.5 block">{t.devices.paramHostnameDesc}</Text>
                </div>

                {/* Boolean switches - basic */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['acceptDns', t.devices.paramAcceptDns],
                    ['acceptRoutes', t.devices.paramAcceptRoutes],
                    ['advertiseExitNode', t.devices.paramAdvertiseExitNode],
                    ['ssh', t.devices.paramSsh],
                    ['shieldsUp', t.devices.paramShieldsUp],
                    ['advertiseConnector', t.devices.paramAdvertiseConnector],
                  ] as [keyof typeof deployParams, string][]).map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '8px 12px' }}>
                      <Text className="text-12px">{label}</Text>
                      <Switch size="small" checked={!!deployParams[key]} onChange={(v) => setDeployParams(p => ({ ...p, [key]: v }))} />
                    </div>
                  ))}
                </div>

                {/* Text inputs */}
                <div>
                  <Text className="form-label">{t.devices.paramAdvertiseRoutes}</Text>
                  <Input
                    value={deployParams.advertiseRoutes}
                    onChange={(e) => setDeployParams(p => ({ ...p, advertiseRoutes: e.target.value }))}
                    placeholder="192.168.1.0/24, 10.0.0.0/8"
                    className="text-12px"
                  />
                </div>
                <div>
                  <Text className="form-label">{t.devices.paramAdvertiseTags}</Text>
                  <Input
                    value={deployParams.advertiseTags}
                    onChange={(e) => setDeployParams(p => ({ ...p, advertiseTags: e.target.value }))}
                    placeholder="tag:server, tag:prod"
                    className="text-12px"
                  />
                </div>
                <div>
                  <Text className="form-label">{t.devices.paramExitNode}</Text>
                  <Input
                    value={deployParams.exitNode}
                    onChange={(e) => setDeployParams(p => ({ ...p, exitNode: e.target.value }))}
                    placeholder={t.devices.paramExitNodePlaceholder}
                    className="text-12px"
                  />
                </div>

                {/* Advanced Linux options */}
                <Collapse
                  ghost
                  size="small"
                  items={[{
                    key: 'advanced',
                    label: <Text type="secondary" className="text-12px">{t.devices.advancedOptions}</Text>,
                    children: (
                      <Space direction="vertical" className="w-full" size={8}>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ['exitNodeAllowLan', t.devices.paramExitNodeAllowLan],
                            ['forceReauth', t.devices.paramForceReauth],
                            ['reset', t.devices.paramReset],
                            ['snatSubnetRoutes', t.devices.paramSnat],
                            ['statefulFiltering', t.devices.paramStatefulFiltering],
                          ] as [keyof typeof deployParams, string][]).map(([key, label]) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '8px 12px' }}>
                              <Text className="text-12px">{label}</Text>
                              <Switch size="small" checked={!!deployParams[key]} onChange={(v) => setDeployParams(p => ({ ...p, [key]: v }))} />
                            </div>
                          ))}
                        </div>
                        <div>
                          <Text className="text-12px block mb-1">Operator</Text>
                          <Input
                            value={deployParams.operator}
                            onChange={(e) => setDeployParams(p => ({ ...p, operator: e.target.value }))}
                            placeholder={t.devices.paramOperatorPlaceholder}
                            size="small"
                            className="text-12px"
                          />
                        </div>
                        <div>
                          <Text className="text-12px block mb-1">Netfilter Mode</Text>
                          <Select
                            size="small"
                            className="w-full"
                            value={deployParams.netfilterMode}
                            onChange={(v) => setDeployParams(p => ({ ...p, netfilterMode: v }))}
                            options={[
                              { value: 'on', label: t.devices.paramNetfilterOn },
                              { value: 'nodivert', label: t.devices.paramNetfilterNodivert },
                              { value: 'off', label: t.devices.paramNetfilterOff },
                            ]}
                          />
                        </div>
                      </Space>
                    ),
                  }]}
                />

                {/* Generated Command */}
                <div className="mt-1">
                  <div className="flex justify-between items-center mb-2">
                    <Text strong className="text-13px">{t.devices.generatedCommand}</Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => { navigator.clipboard.writeText(buildTailscaleCommand); message.success(t.devices.commandCopied); }}
                    >
                      {t.devices.copyCommand}
                    </Button>
                  </div>
                  <pre style={{
                    background: token.colorBgLayout,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: token.borderRadius,
                    padding: 12,
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    margin: 0,
                    maxHeight: 200,
                    overflow: 'auto',
                  }}>
                    {buildTailscaleCommand}
                  </pre>
                </div>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
}
