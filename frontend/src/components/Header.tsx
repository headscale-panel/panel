import { useTheme } from '@/contexts/ThemeContext';
import { useI18n, locales } from '@/i18n/index';
import { Layout, Button, Input, Dropdown, Badge, Space, theme } from 'antd';
import {
  MenuOutlined,
  SearchOutlined,
  GlobalOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  BellOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Header: AntHeader } = Layout;

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const { token: themeToken } = theme.useToken();

  const cycleTheme = () => {
    const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    setMode(next);
  };

  const ThemeIcon = mode === 'light' ? SunOutlined : mode === 'dark' ? MoonOutlined : DesktopOutlined;
  const themeLabel = mode === 'light' ? t.header.themeLight : mode === 'dark' ? t.header.themeDark : t.header.themeSystem;

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
    }}>
      <Space size="middle" style={{ flex: 1 }}>
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={onMenuClick}
        />
        <Input
          placeholder={t.header.searchPlaceholder}
          prefix={<SearchOutlined />}
          style={{ maxWidth: 400 }}
          variant="filled"
        />
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

        <Badge dot offset={[-4, 4]}>
          <Button type="text" icon={<BellOutlined />} />
        </Badge>
      </Space>
    </AntHeader>
  );
}
