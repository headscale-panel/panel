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

import { HomeOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';
import { useLocation } from 'wouter';
import { useTranslation } from '@/i18n';

export default function NotFound() {
  const [, setLocation] = useLocation();
  const t = useTranslation();

  return (
    <div className="auth-page">
      <Result
        status="404"
        title="404"
        subTitle={t.notFound.subTitle}
        extra={(
          <Button type="primary" icon={<HomeOutlined />} onClick={() => setLocation('/')}>
            {t.notFound.goHome}
          </Button>
        )}
      />
    </div>
  );
}
