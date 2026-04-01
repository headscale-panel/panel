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
    <div className="auth-page py-8 px-4">
      <div className="w-full max-w-105">
        <Card>
          {/* Logo and Title */}
          <div className="text-center mb-6">
            <div style={{
              width: 56, height: 56, borderRadius: 12, background: themeToken.colorPrimary,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <SafetyCertificateOutlined className="text-32px text-white" />
            </div>
            <Title level={4} className="m-0">Headscale Panel</Title>
            <Text type="secondary">Create your account</Text>
          </div>

          <form onSubmit={handleSubmit}>
            <Space direction="vertical" size="middle" className="w-full">
              {/* Username */}
              <div>
                <Text className="form-label">Username</Text>
                <Input prefix={<UserOutlined />} value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="Enter username" required disabled={loading} />
              </div>

              {/* Email */}
              <div>
                <Text className="form-label">Email</Text>
                <Input prefix={<MailOutlined />} type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="you@example.com" required disabled={loading} />
              </div>

              {/* Password */}
              <div>
                <Text className="form-label">Password</Text>
                <Input.Password prefix={<LockOutlined />} value={formData.password} onChange={(e) => handlePasswordChange(e.target.value)} placeholder="Create a password" required disabled={loading} />
                {formData.password && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <Progress percent={strengthPercent} showInfo={false} status={strengthStatus} size="small" className="flex-1" />
                      <Text type="secondary" className="text-11px min-w-52px text-right">{strengthLabel}</Text>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 mt-1">
                      {requirements.map((item) => {
                        const met = passwordStrength[item.key as keyof typeof passwordStrength];
                        return (
                          <div key={item.key} className="flex items-center gap-1">
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
                <Text className="form-label">Confirm Password</Text>
                <Input.Password prefix={<LockOutlined />} value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} placeholder="Confirm your password" required disabled={loading} />
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <Text type="danger" className="text-11px">Passwords do not match</Text>
                )}
              </div>

              {/* Submit */}
              <Button type="primary" htmlType="submit" block loading={loading} icon={loading ? <LoadingOutlined /> : undefined}>
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </Space>
          </form>

          {/* Login Link */}
          <div className="text-center mt-5">
            <Text type="secondary">Already have an account?</Text>{' '}
            <Link href="/login"><Text style={{ color: themeToken.colorPrimary, cursor: 'pointer', fontWeight: 500 }}>Sign in</Text></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
