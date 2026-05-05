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

import type { MenuProps } from 'antd';
import {
  DesktopOutlined,
  GlobalOutlined,
  MenuOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Layout, Space, theme } from 'antd';
import { useTheme } from '@/contexts/ThemeContext';
import { locales, useI18n } from '@/i18n/index';
import { ThemeMode } from '@/lib/enums';

const { Header: AntHeader } = Layout;

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const { token: themeToken } = theme.useToken();

  const cycleTheme = () => {
    const next = mode === ThemeMode.Light ? ThemeMode.Dark : mode === ThemeMode.Dark ? ThemeMode.System : ThemeMode.Light;
    setMode(next);
  };

  const ThemeIcon = mode === ThemeMode.Light ? SunOutlined : mode === ThemeMode.Dark ? MoonOutlined : DesktopOutlined;
  const themeLabel = mode === ThemeMode.Light ? t.header.themeLight : mode === ThemeMode.Dark ? t.header.themeDark : t.header.themeSystem;

  const langMenuItems: MenuProps['items'] = Object.entries(locales).map(([code, meta]) => ({
    key: code,
    label: meta.label,
    style: locale === code ? { fontWeight: 600, color: themeToken.colorPrimary } : undefined,
  }));

  return (
    <AntHeader style={{
      height: 64,
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: themeToken.colorBgContainer,
      borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}
    >
      <Space size="middle" className="flex-1">
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={onMenuClick}
        />
        {/* <Input
          placeholder={t.header.searchPlaceholder}
          prefix={<SearchOutlined />}
          className="max-w-100"
          variant="filled"
        /> */}
      </Space>

      <Space size={4}>
        <Dropdown
          menu={{
            items: langMenuItems,
            onClick: ({ key }) => setLocale(key),
          }}
          placement="bottomRight"
        >
          <Button type="text" icon={<GlobalOutlined />} />
        </Dropdown>

        <Button
          type="text"
          icon={<ThemeIcon />}
          onClick={cycleTheme}
          title={themeLabel}
        />

        {/* <Badge dot offset={[-4, 4]}>
          <Button type="text" icon={<BellOutlined />} />
        </Badge> */}
      </Space>
    </AntHeader>
  );
}
