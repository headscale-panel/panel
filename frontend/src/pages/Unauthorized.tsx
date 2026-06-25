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

import { LogoutOutlined, SmileOutlined } from '@ant-design/icons';
import { Button, Result, Space, Typography } from 'antd';
import { useTranslation } from '@/i18n';
import { clearStoredAuthState, PANEL_LOGIN_PATH } from '@/lib/auth';

const { Text } = Typography;

export default function Unauthorized() {
  const t = useTranslation();

  const handleLogout = () => {
    clearStoredAuthState();
    window.location.assign(PANEL_LOGIN_PATH);
  };

  return (
    <div className="auth-page p-4">
      <Result
        icon={<SmileOutlined />}
        title={t.unauthorized.title}
        subTitle={(
          <Space direction="vertical" size={4}>
            <Text>{t.unauthorized.subtitle}</Text>
            <Text type="secondary">{t.unauthorized.description}</Text>
          </Space>
        )}
        extra={(
          <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout}>
            {t.unauthorized.logout}
          </Button>
        )}
      />
    </div>
  );
}
