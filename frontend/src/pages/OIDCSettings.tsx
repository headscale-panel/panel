import {
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Button, Card, Input, Select, Space, Switch, Table, Tabs, Typography, message, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { useState } from 'react';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function OIDCSettings() {
  const t = useTranslation();
  const { token } = theme.useToken();
  const [useBuiltIn, setUseBuiltIn] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    message.success(t.oidcSettingsPage.copied);
    setTimeout(() => setCopied(false), 2000);
  };

  const clientColumns: ColumnsType<any> = [
    { title: t.oidcSettingsPage.clients.clientName, dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Client ID', dataIndex: 'clientId', key: 'clientId', render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Redirect URIs', dataIndex: 'redirectUri', key: 'redirectUri', render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
    { title: t.oidcSettingsPage.clients.createdAt, dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => <Text type="secondary">{v}</Text> },
    {
      title: t.oidcSettingsPage.clients.actions, key: 'actions', align: 'right',
      render: () => (
        <Space>
          <Button type="text" size="small">{t.common.actions.edit}</Button>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Space>
      ),
    },
  ];

  const clientData = [
    { key: '1', name: 'Headscale', clientId: 'headscale-client', redirectUri: 'http://localhost/auth/callback', createdAt: '2024-01-01' },
  ];

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{t.oidcSettingsPage.title}</Title>
          <Text type="secondary">{t.oidcSettingsPage.description}</Text>
        </div>

        <Tabs
          defaultActiveKey="provider"
          items={[
            {
              key: 'provider',
              label: t.oidcSettingsPage.tabs.provider,
              children: (
                <Space direction="vertical" size={24} style={{ width: '100%' }}>
                  {/* Provider Type Selection */}
                  <Card>
                    <Title level={5} style={{ marginBottom: 16 }}>{t.oidcSettingsPage.providerType.title}</Title>
                    <Space size={8}>
                      <Switch checked={useBuiltIn} onChange={setUseBuiltIn} />
                      <Text>{useBuiltIn ? t.oidcSettingsPage.providerType.builtIn : t.oidcSettingsPage.providerType.thirdParty}</Text>
                    </Space>
                  </Card>

                  {/* Built-in OIDC Server */}
                  {useBuiltIn && (
                    <Card>
                      <Title level={5} style={{ marginBottom: 4 }}>{t.oidcSettingsPage.builtIn.title}</Title>
                      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>{t.oidcSettingsPage.builtIn.description}</Text>

                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                          <Text style={{ display: 'block', marginBottom: 4 }}>Issuer URL</Text>
                          <Space.Compact style={{ width: '100%' }}>
                            <Input value="http://localhost/oidc" readOnly style={{ fontFamily: 'monospace' }} />
                            <Button icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={() => handleCopy('http://localhost/oidc')} />
                          </Space.Compact>
                        </div>

                        <div>
                          <Text style={{ display: 'block', marginBottom: 4 }}>Discovery URL</Text>
                          <Space.Compact style={{ width: '100%' }}>
                            <Input value="http://localhost/oidc/.well-known/openid-configuration" readOnly style={{ fontFamily: 'monospace', fontSize: 12 }} />
                            <Button icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={() => handleCopy('http://localhost/oidc/.well-known/openid-configuration')} />
                          </Space.Compact>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          <div>
                            <Text style={{ display: 'block', marginBottom: 4 }}>{t.oidcSettingsPage.builtIn.tokenExpiry}</Text>
                            <Input type="number" defaultValue="24" min={1} max={720} />
                          </div>
                          <div>
                            <Text style={{ display: 'block', marginBottom: 4 }}>{t.oidcSettingsPage.builtIn.refreshTokenExpiry}</Text>
                            <Input type="number" defaultValue="30" min={1} max={365} />
                          </div>
                        </div>

                        <Space size={8}>
                          <Switch defaultChecked />
                          <Text>{t.oidcSettingsPage.builtIn.allowRegistration}</Text>
                        </Space>

                        <Button type="primary" block>{t.oidcSettingsPage.builtIn.saveConfig}</Button>
                      </Space>
                    </Card>
                  )}

                  {/* Third-party OIDC Provider */}
                  {!useBuiltIn && (
                    <Card>
                      <Title level={5} style={{ marginBottom: 4 }}>{t.oidcSettingsPage.thirdParty.title}</Title>
                      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>{t.oidcSettingsPage.thirdParty.description}</Text>

                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                          <Text style={{ display: 'block', marginBottom: 4 }}>{t.oidcSettingsPage.thirdParty.providerName}</Text>
                          <Input placeholder={t.oidcSettingsPage.thirdParty.providerNamePlaceholder} />
                        </div>
                        <div>
                          <Text style={{ display: 'block', marginBottom: 4 }}>Issuer URL</Text>
                          <Input placeholder="https://your-domain.auth0.com" style={{ fontFamily: 'monospace' }} />
                        </div>
                        <div>
                          <Text style={{ display: 'block', marginBottom: 4 }}>Client ID</Text>
                          <Input placeholder="your-client-id" />
                        </div>
                        <div>
                          <Text style={{ display: 'block', marginBottom: 4 }}>Client Secret</Text>
                          <Input.Password placeholder="your-client-secret" />
                        </div>
                        <div>
                          <Text style={{ display: 'block', marginBottom: 4 }}>Redirect URI</Text>
                          <Input value="http://localhost/auth/callback" readOnly style={{ fontFamily: 'monospace' }} />
                        </div>
                        <div>
                          <Text style={{ display: 'block', marginBottom: 4 }}>{t.oidcSettingsPage.thirdParty.scopes}</Text>
                          <Input defaultValue="openid, profile, email" placeholder="openid, profile, email" />
                        </div>
                        <Space style={{ width: '100%' }}>
                          <Button type="primary" style={{ flex: 1 }}>{t.oidcSettingsPage.thirdParty.testConnection}</Button>
                          <Button style={{ flex: 1 }}>{t.oidcSettingsPage.thirdParty.saveConfig}</Button>
                        </Space>
                      </Space>
                    </Card>
                  )}
                </Space>
              ),
            },
            {
              key: 'clients',
              label: t.oidcSettingsPage.tabs.clients,
              children: (
                <Space direction="vertical" size={24} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Title level={5} style={{ margin: 0 }}>{t.oidcSettingsPage.clients.title}</Title>
                      <Text type="secondary">{t.oidcSettingsPage.clients.description}</Text>
                    </div>
                    <Button type="primary" icon={<PlusOutlined />}>{t.oidcSettingsPage.clients.addClient}</Button>
                  </div>

                  <Card styles={{ body: { padding: 0 } }}>
                    <Table columns={clientColumns} dataSource={clientData} pagination={false} />
                  </Card>

                  {/* Add Client Form */}
                  <Card>
                    <Title level={5} style={{ marginBottom: 24 }}>{t.oidcSettingsPage.clients.createTitle}</Title>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      <div>
                        <Text style={{ display: 'block', marginBottom: 4 }}>{t.oidcSettingsPage.clients.clientNameLabel}</Text>
                        <Input placeholder={t.oidcSettingsPage.clients.clientNamePlaceholder} />
                      </div>
                      <div>
                        <Text style={{ display: 'block', marginBottom: 4 }}>{t.oidcSettingsPage.clients.clientIdLabel}</Text>
                        <Input placeholder="my-app-client" style={{ fontFamily: 'monospace' }} />
                      </div>
                      <div>
                        <Text style={{ display: 'block', marginBottom: 4 }}>{t.oidcSettingsPage.clients.redirectUrisLabel}</Text>
                        <TextArea
                          placeholder={"http://localhost:3000/callback\nhttps://myapp.com/callback"}
                          rows={4}
                          style={{ fontFamily: 'monospace' }}
                        />
                      </div>
                      <div>
                        <Text style={{ display: 'block', marginBottom: 4 }}>Grant Types</Text>
                        <Select
                          style={{ width: '100%' }}
                          defaultValue="authorization_code"
                          options={[
                            { value: 'authorization_code', label: 'Authorization Code' },
                            { value: 'implicit', label: 'Implicit' },
                            { value: 'client_credentials', label: 'Client Credentials' },
                          ]}
                        />
                      </div>
                      <Space size={8}>
                        <Switch defaultChecked />
                        <Text>{t.oidcSettingsPage.clients.requirePkce}</Text>
                      </Space>
                      <Button type="primary" block>{t.oidcSettingsPage.clients.createClient}</Button>
                    </Space>
                  </Card>
                </Space>
              ),
            },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
