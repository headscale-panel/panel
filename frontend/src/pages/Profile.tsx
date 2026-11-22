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

import {
  CheckCircleOutlined,
  CopyOutlined,
  LockOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Descriptions,
  Divider,
  Input,
  message,
  Modal,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useState } from 'react';
import { useLocation } from 'wouter';
import { authApi } from '@/api';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslation } from '@/i18n/index';
import { useAuthStore, useUIStore } from '@/lib/store';

const { Title, Text, Paragraph } = Typography;

const MIN_PASSWORD_LENGTH = 12;

export default function Profile() {
  const t = useTranslation();
  const pr = t.profile;
  const { user, clearAuth } = useAuthStore();
  const { setGuideTourOpen } = useUIStore();
  const [, setLocation] = useLocation();

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // TOTP setup state
  const [totpModalOpen, setTotpModalOpen] = useState(false);
  const [totpStep, setTotpStep] = useState(0);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUrl, setTotpUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const handleStartSetup = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await authApi.generateTOTP();
      setTotpSecret(res.secret);
      setTotpUrl(res.url);
      setTotpStep(0);
      setVerifyCode('');
      setTotpModalOpen(true);
    } catch {
      message.error(pr.totp.generateFailed);
    } finally {
      setGenerating(false);
    }
  }, [pr]);

  const handleEnableTOTP = useCallback(async () => {
    if (!verifyCode.trim())
      return;
    setEnabling(true);
    try {
      await authApi.enableTOTP({ code: verifyCode.trim() });
      message.success(pr.totp.enableSuccess);
      setTotpModalOpen(false);
      // Reload the page to reflect new totp_enabled state
      window.location.reload();
    } catch {
      message.error(pr.totp.verifyFailed);
    } finally {
      setEnabling(false);
    }
  }, [verifyCode, pr]);

  const handleCopySecret = useCallback(() => {
    navigator.clipboard.writeText(totpSecret).then(() => {
      message.success(pr.totp.secretCopied);
    });
  }, [totpSecret, pr]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword) {
      message.warning(pr.password.currentRequired);
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      message.warning(pr.password.tooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      message.warning(pr.password.mismatch);
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      message.success(pr.password.success);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      clearAuth();
      setLocation('/login');
    } catch (error: unknown) {
      message.error((error as Error)?.message || pr.password.failed);
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword, pr, clearAuth, setLocation]);

  return (
    <DashboardLayout>
      <div className="max-w-640px">
        <Title level={4} className="!mb-4px">{pr.title}</Title>
        <Text type="secondary">{pr.description}</Text>

        {/* Account Info */}
        <Card className="mt-16px">
          <div className="flex items-center gap-8px mb-12px">
            <UserOutlined />
            <Text strong>{pr.accountInfo}</Text>
          </div>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={pr.username}>{user?.username || '-'}</Descriptions.Item>
            <Descriptions.Item label={pr.displayName}>{user?.display_name || '-'}</Descriptions.Item>
            <Descriptions.Item label={pr.email}>{user?.email || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Security */}
        <Card className="mt-16px">
          <div className="flex items-center gap-8px mb-12px">
            <LockOutlined />
            <Text strong>{pr.security}</Text>
          </div>
          <div className="flex items-center justify-between" data-tour-id="profile-totp">
            <div>
              <div className="flex items-center gap-8px">
                <SafetyCertificateOutlined />
                <Text>{pr.totp.label}</Text>
                {user?.totp_enabled
                  ? (
                      <Tag color="success" icon={<CheckCircleOutlined />}>{pr.totp.enabled}</Tag>
                    )
                  : (
                      <Tag>{pr.totp.disabled}</Tag>
                    )}
              </div>
              <Text type="secondary" className="text-12px block mt-4px ml-22px">
                {pr.totp.hint}
              </Text>
            </div>
            {!user?.totp_enabled && (
              <Button type="primary" loading={generating} onClick={handleStartSetup}>
                {pr.totp.setup}
              </Button>
            )}
          </div>

          <Divider className="my-16px" />

          <div className="flex flex-col gap-12px">
            <Text strong>{pr.password.title}</Text>
            <div>
              <Text className="block mb-4px text-13px">{pr.password.currentLabel}</Text>
              <Input.Password
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={pr.password.currentPlaceholder}
              />
            </div>
            <div>
              <Text className="block mb-4px text-13px">{pr.password.newLabel}</Text>
              <Input.Password
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={pr.password.newPlaceholder}
              />
            </div>
            <div>
              <Text className="block mb-4px text-13px">{pr.password.confirmLabel}</Text>
              <Input.Password
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={pr.password.confirmPlaceholder}
              />
            </div>
            <div>
              <Button type="primary" loading={changingPassword} onClick={() => void handleChangePassword()}>
                {pr.password.submit}
              </Button>
            </div>
          </div>
        </Card>

        {/* Guide Tour */}
        <Card className="mt-16px" data-tour-id="profile-guide">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-8px">
                <QuestionCircleOutlined />
                <Text strong>{pr.guideTour.restartTitle}</Text>
              </div>
              <Text type="secondary" className="text-12px block mt-4px ml-22px">
                {pr.guideTour.restartDesc}
              </Text>
            </div>
            <Button onClick={() => setGuideTourOpen(true)}>
              {pr.guideTour.restartBtn}
            </Button>
          </div>
        </Card>
      </div>

      {/* TOTP Setup Modal */}
      <Modal
        open={totpModalOpen}
        title={pr.totp.setupTitle}
        onCancel={() => setTotpModalOpen(false)}
        footer={null}
        width={480}
        destroyOnHidden
      >
        <Steps
          current={totpStep}
          size="small"
          className="mb-24px"
          items={[
            { title: pr.totp.stepScan },
            { title: pr.totp.stepVerify },
          ]}
        />

        {totpStep === 0 && (
          <div className="flex flex-col items-center gap-16px">
            <Text>{pr.totp.scanDesc}</Text>
            <div className="p-16px bg-white rounded-8px">
              <QRCodeSVG value={totpUrl} size={200} />
            </div>
            <div className="w-full">
              <Text type="secondary" className="text-12px block mb-4px">{pr.totp.manualEntry}</Text>
              <div className="flex items-center gap-8px">
                <Paragraph
                  className="!mb-0 flex-1 font-mono text-13px bg-gray-50 dark:bg-gray-800 px-12px py-8px rounded"
                  copyable={false}
                >
                  {totpSecret}
                </Paragraph>
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopySecret}>
                  {pr.totp.copy}
                </Button>
              </div>
            </div>
            <Button type="primary" onClick={() => setTotpStep(1)} className="mt-8px">
              {pr.totp.next}
            </Button>
          </div>
        )}

        {totpStep === 1 && (
          <div className="flex flex-col items-center gap-16px">
            <Text>{pr.totp.verifyDesc}</Text>
            <Input
              size="large"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              onPressEnter={handleEnableTOTP}
              className="text-center font-mono text-24px tracking-8px max-w-200px"
            />
            <Space className="mt-8px">
              <Button onClick={() => setTotpStep(0)}>{pr.totp.back}</Button>
              <Button
                type="primary"
                loading={enabling}
                disabled={verifyCode.length !== 6}
                onClick={handleEnableTOTP}
              >
                {pr.totp.enable}
              </Button>
            </Space>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
