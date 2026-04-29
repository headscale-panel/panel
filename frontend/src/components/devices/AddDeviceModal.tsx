import { CopyOutlined } from '@ant-design/icons';
import { Button, Card, Input, message, Modal, Space, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import { deviceApi, headscaleUserApi } from '@/api';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface AddDeviceModalProps {
  open: boolean;
  owner: string;
  canCreatePreAuthKey: boolean;
  canRegisterNode: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function AddDeviceModal({
  open,
  owner,
  canCreatePreAuthKey,
  canRegisterNode,
  onCancel,
  onSuccess,
}: AddDeviceModalProps) {
  const t = useTranslation();

  const [activeTab, setActiveTab] = useState(canCreatePreAuthKey ? 'preauth' : 'machine');
  const [reusable, setReusable] = useState(false);
  const [ephemeral, setEphemeral] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [machineKey, setMachineKey] = useState('');
  const [registering, setRegistering] = useState(false);

  const handleAfterOpenChange = (nextOpen: boolean) => {
    if (!nextOpen)
      return;

    setActiveTab(canCreatePreAuthKey ? 'preauth' : 'machine');
    setReusable(false);
    setEphemeral(false);
    setGeneratedKey('');
    setMachineKey('');
  };

  const handleGenerateKey = async () => {
    try {
      const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res: any = await headscaleUserApi.createPreAuthKey({ user: owner, reusable, ephemeral, expiration });
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
    if (!machineKey.trim()) {
      message.error(t.devices.machineKeyRequired);
      return;
    }
    setRegistering(true);
    try {
      await deviceApi.registerNode({ user: owner, key: machineKey.trim() });
      message.success(t.devices.registerNodeSuccess);
      onCancel();
      onSuccess();
    } catch (error: any) {
      message.error(t.devices.registerNodeFailed + (error.message ? `: ${error.message}` : ''));
    } finally {
      setRegistering(false);
    }
  };

  const handleCopy = async (value: string, successMsg: string) => {
    await navigator.clipboard.writeText(value);
    message.success(successMsg);
  };

  return (
    <Modal
      open={open}
      title={t.devices.addDeviceTitle}
      onCancel={onCancel}
      afterOpenChange={handleAfterOpenChange}
      footer={null}
      width={680}
    >
      <Text type="secondary" className="block mb-4">{t.devices.addDeviceDesc}</Text>
      <div className="mb-3">
        <Text className="text-13px">{t.devices.tableOwner}</Text>
        <div className="mt-1">
          <Tag color="blue">{owner}</Tag>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'preauth',
            label: t.devices.tabPreAuth,
            disabled: !canCreatePreAuthKey,
            children: (
              <Space direction="vertical" className="w-full" size={16}>
                <div className="flex justify-between gap-4 flex-wrap">
                  <Tag.CheckableTag checked={reusable} onChange={setReusable}>
                    {t.devices.reusableKey}
                  </Tag.CheckableTag>
                  <Tag.CheckableTag checked={ephemeral} onChange={setEphemeral}>
                    {t.devices.ephemeralKey}
                  </Tag.CheckableTag>
                </div>

                <Button type="primary" onClick={handleGenerateKey}>
                  {t.devices.generateKey}
                </Button>

                {generatedKey && (
                  <Card size="small">
                    <Text strong>{t.devices.preAuthKey}</Text>
                    <div className="mt-2 flex gap-2 items-center flex-wrap">
                      <Text code className="break-all">{generatedKey}</Text>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => void handleCopy(generatedKey, t.devices.keyCopied)}
                      >
                        {t.devices.copyCommand}
                      </Button>
                    </div>
                    <Text type="secondary" className="block mt-2">{t.devices.keyExpireHint}</Text>
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
              <Space direction="vertical" className="w-full" size={16}>
                <div>
                  <Text className="form-label">{t.devices.machineKeyLabel}</Text>
                  <Input
                    value={machineKey}
                    onChange={(e) => setMachineKey(e.target.value)}
                    placeholder={t.devices.machineKeyPlaceholder}
                  />
                  <Text type="secondary" className="text-12px">{t.devices.machineKeyHint}</Text>
                </div>
                <Button type="primary" onClick={handleRegisterDevice} loading={registering}>
                  {t.devices.registerNode}
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
}
