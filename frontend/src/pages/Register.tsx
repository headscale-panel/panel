import { Card, Input, Button, Typography, Progress, Space, message, theme } from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, CheckCircleOutlined, LoadingOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { authAPI } from '@/lib/api';
import { useRequest } from 'ahooks';

const { Title, Text } = Typography;

export default function Register() {
  const [, setLocation] = useLocation();
  const { token: themeToken } = theme.useToken();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
  });

  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });

  const strengthCount = Object.values(passwordStrength).filter(Boolean).length;
  const strengthPercent = (strengthCount / 5) * 100;
  const strengthLabel =
    strengthCount <= 1 ? 'Weak' : strengthCount <= 2 ? 'Fair' : strengthCount <= 3 ? 'Good' : strengthCount <= 4 ? 'Strong' : 'Excellent';
  const strengthStatus: 'exception' | 'normal' | 'active' | 'success' =
    strengthCount <= 2 ? 'exception' : strengthCount <= 4 ? 'active' : 'success';

  const handlePasswordChange = (password: string) => {
    setFormData({ ...formData, password });
    setPasswordStrength({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    });
  };

  const { runAsync: submitRegister, loading } = useRequest(
    async (payload: { username: string; password: string; email: string }) =>
      authAPI.register(payload.username, payload.password, payload.email),
    {
      manual: true,
      onSuccess: () => {
        message.success('Registration successful! Redirecting to login...');
        setTimeout(() => setLocation('/login'), 1500);
      },
      onError: (error: any) => {
        message.error('Registration failed: ' + (error?.message || 'Unknown error'));
      },
    },
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      message.error('Passwords do not match');
      return;
    }
    if (!Object.values(passwordStrength).every(Boolean)) {
      message.error('Password does not meet all requirements');
      return;
    }
    await submitRegister({
      username: formData.username,
      password: formData.password,
      email: formData.email,
    });
  };

  const requirements = [
    { key: 'length', label: '8+ characters' },
    { key: 'uppercase', label: 'Uppercase' },
    { key: 'lowercase', label: 'Lowercase' },
    { key: 'number', label: 'Number' },
    { key: 'special', label: 'Special char' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Card>
          {/* Logo and Title */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12, background: themeToken.colorPrimary,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <SafetyCertificateOutlined style={{ fontSize: 32, color: '#fff' }} />
            </div>
            <Title level={4} style={{ margin: 0 }}>Headscale Panel</Title>
            <Text type="secondary">Create your account</Text>
          </div>

          <form onSubmit={handleSubmit}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {/* Username */}
              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Username</Text>
                <Input prefix={<UserOutlined />} value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="Enter username" required disabled={loading} />
              </div>

              {/* Email */}
              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Email</Text>
                <Input prefix={<MailOutlined />} type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="you@example.com" required disabled={loading} />
              </div>

              {/* Password */}
              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Password</Text>
                <Input.Password prefix={<LockOutlined />} value={formData.password} onChange={(e) => handlePasswordChange(e.target.value)} placeholder="Create a password" required disabled={loading} />
                {formData.password && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Progress percent={strengthPercent} showInfo={false} status={strengthStatus} size="small" style={{ flex: 1 }} />
                      <Text type="secondary" style={{ fontSize: 11, minWidth: 52, textAlign: 'right' }}>{strengthLabel}</Text>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', marginTop: 4 }}>
                      {requirements.map((item) => {
                        const met = passwordStrength[item.key as keyof typeof passwordStrength];
                        return (
                          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircleOutlined style={{ fontSize: 12, color: met ? '#52c41a' : themeToken.colorTextQuaternary }} />
                            <Text style={{ fontSize: 11, color: met ? '#52c41a' : themeToken.colorTextQuaternary }}>{item.label}</Text>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <Text style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Confirm Password</Text>
                <Input.Password prefix={<LockOutlined />} value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} placeholder="Confirm your password" required disabled={loading} />
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <Text type="danger" style={{ fontSize: 11 }}>Passwords do not match</Text>
                )}
              </div>

              {/* Submit */}
              <Button type="primary" htmlType="submit" block loading={loading} icon={loading ? <LoadingOutlined /> : undefined}>
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </Space>
          </form>

          {/* Login Link */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Text type="secondary">Already have an account?</Text>{' '}
            <Link href="/login"><Text style={{ color: themeToken.colorPrimary, cursor: 'pointer', fontWeight: 500 }}>Sign in</Text></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
