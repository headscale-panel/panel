import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/i18n/index';
import { clearStoredAuthState } from '@/lib/auth';
import { Layout, Menu, Avatar, Button, Typography, theme } from 'antd';
import {
  HomeOutlined,
  TeamOutlined,
  NodeIndexOutlined,
  DatabaseOutlined,
  LockOutlined,
  GlobalOutlined,
  BarChartOutlined,
  SettingOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useLocation } from 'wouter';
import type { MenuProps } from 'antd';

const { Sider } = Layout;
const { Text } = Typography;

interface SidebarProps {
  collapsed?: boolean;
  isMobile?: boolean;
  onNavigate?: () => void;
}

const menuIconMap: Record<string, React.ReactNode> = {
  dashboard: <HomeOutlined />,
  users: <TeamOutlined />,
  routes: <NodeIndexOutlined />,
  resources: <DatabaseOutlined />,
  acl: <LockOutlined />,
  dns: <GlobalOutlined />,
  metrics: <BarChartOutlined />,
  settings: <SettingOutlined />,
};

const menuPaths: Record<string, string> = {
  dashboard: '/',
  users: '/users',
  routes: '/routes',
  resources: '/resources',
  acl: '/acl',
  dns: '/dns',
  metrics: '/metrics',
  settings: '/settings',
};

const adminOnlyKeys = new Set(['users', 'resources', 'acl', 'dns', 'metrics']);

export default function Sidebar({
  collapsed = false,
  isMobile = false,
  onNavigate,
}: SidebarProps) {
  const t = useTranslation();
  const [location, setLocation] = useLocation();
  const { user } = useAuthStore();
  const { token: themeToken } = theme.useToken();

  const isAdmin = user?.role === 'admin';
  const displayName = user?.display_name || user?.username || t.sidebar.defaultUser;
  const avatarLetter = (user?.username || 'U')[0].toUpperCase();

  const handleLogout = () => {
    clearStoredAuthState();
    setLocation('/login');
    onNavigate?.();
  };

  // Build menu items
  const allKeys = ['dashboard', 'users', 'routes', 'resources', 'acl', 'dns', 'metrics', 'settings'];
  const menuItems: MenuProps['items'] = allKeys
    .filter((key) => !adminOnlyKeys.has(key) || isAdmin)
    .map((key) => ({
      key,
      icon: menuIconMap[key],
      label: t.sidebar[key as keyof typeof t.sidebar] as string,
    }));

  // Determine selected key from location
  const selectedKey = allKeys.find((key) => {
    const path = menuPaths[key];
    if (path === '/') return location === '/';
    return location === path;
  }) || 'dashboard';

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const path = menuPaths[key];
    if (path) {
      setLocation(path);
      onNavigate?.();
    }
  };

  return (
    <Sider
      collapsed={collapsed}
      width={240}
      collapsedWidth={isMobile ? 0 : 64}
      trigger={null}
      style={{
        height: '100vh',
        position: isMobile ? 'relative' : 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 50,
        background: themeToken.colorBgContainer,
        borderRight: `1px solid ${themeToken.colorBorderSecondary}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
        flexShrink: 0,
      }}>
        {collapsed ? (
          <HomeOutlined style={{ fontSize: 24, color: themeToken.colorPrimary }} />
        ) : (
          <Text strong style={{ fontSize: 18 }}>Headscale Panel</Text>
        )}
      </div>

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ borderRight: 0, flex: 1, overflow: 'auto', background: 'transparent' }}
      />

      <div style={{
        borderTop: `1px solid ${themeToken.colorBorderSecondary}`,
        padding: collapsed ? '12px 8px' : '12px 16px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <Avatar size={collapsed ? 32 : 36} style={{ backgroundColor: themeToken.colorPrimary, fontSize: 13, flexShrink: 0 }}>
          {avatarLetter}
        </Avatar>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong ellipsis style={{ display: 'block', fontSize: 13 }}>{displayName}</Text>
              {user?.email && (
                <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 11 }}>{user.email}</Text>
              )}
            </div>
            <Button
              type="text"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              title={t.sidebar.logout}
              size="small"
            />
          </>
        )}
      </div>
      </div>
    </Sider>
  );
}
