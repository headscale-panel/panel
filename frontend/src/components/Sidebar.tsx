import type { MenuProps } from 'antd';
import type { AppSectionKey } from '@/lib/permissions';
import {
  BarChartOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  GlobalOutlined,
  HomeOutlined,
  IdcardOutlined,
  LockOutlined,
  LogoutOutlined,
  NodeIndexOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Layout, Menu, theme, Typography } from 'antd';
import { useLocation } from 'wouter';
import { useTranslation } from '@/i18n/index';
import { clearStoredAuthState } from '@/lib/auth';
import { canAccessSection } from '@/lib/permissions';
import { useAuthStore } from '@/lib/store';

const { Sider } = Layout;
const { Text } = Typography;

interface SidebarProps {
  collapsed?: boolean;
  isMobile?: boolean;
  onNavigate?: () => void;
}

const menuIconMap: Record<string, React.ReactNode> = {
  dashboard: <HomeOutlined />,
  devices: <DesktopOutlined />,
  users: <TeamOutlined />,
  routes: <NodeIndexOutlined />,
  resources: <DatabaseOutlined />,
  acl: <LockOutlined />,
  dns: <GlobalOutlined />,
  metrics: <BarChartOutlined />,
  panelAccounts: <IdcardOutlined />,
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
  panelAccounts: '/panel-accounts',
  settings: '/settings',
};

export default function Sidebar({
  collapsed = false,
  isMobile = false,
  onNavigate,
}: SidebarProps) {
  const t = useTranslation();
  const [location, setLocation] = useLocation();
  const { user } = useAuthStore();
  const { token: themeToken } = theme.useToken();

  const displayName = user?.display_name || user?.username || t.sidebar.defaultUser;
  const avatarLetter = (user?.username || 'U')[0].toUpperCase();

  const handleLogout = () => {
    clearStoredAuthState();
    setLocation('/login');
    onNavigate?.();
  };

  // Build menu items
  const allKeys: AppSectionKey[] = ['dashboard', 'devices', 'users', 'routes', 'resources', 'acl', 'dns', 'metrics', 'panelAccounts', 'settings'];
  const menuItems: MenuProps['items'] = allKeys
    .filter((key) => canAccessSection(user, key))
    .map((key) => ({
      key,
      icon: menuIconMap[key],
      label: t.sidebar[key as keyof typeof t.sidebar] as string,
    }));

  // Determine selected key from location
  const selectedKey = allKeys.find((key) => {
    const path = menuPaths[key];
    if (path === '/')
      return location === '/';
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
      <div className="flex flex-col h-full">
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          flexShrink: 0,
        }}
        >
          {collapsed
            ? (
                <HomeOutlined style={{ fontSize: 24, color: themeToken.colorPrimary }} />
              )
            : (
                <Text strong className="text-18px">Headscale Panel</Text>
              )}
        </div>

        <Menu
          data-tour-id="sidebar-menu"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
          className="border-r-0 flex-1 overflow-auto bg-transparent"
        />

        <div
          data-tour-id="sidebar-profile"
          style={{
            borderTop: `1px solid ${themeToken.colorBorderSecondary}`,
            padding: collapsed ? '12px 8px' : '12px 16px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Avatar
            size={collapsed ? 32 : 36}
            style={{ backgroundColor: themeToken.colorPrimary, fontSize: 13, flexShrink: 0, cursor: 'pointer' }}
            onClick={() => { setLocation('/profile'); onNavigate?.(); }}
          >
            {avatarLetter}
          </Avatar>
          {!collapsed && (
            <>
              <div
                className="flex-1 min-w-0 cursor-pointer flex flex-col items-start"
                onClick={() => { setLocation('/profile'); onNavigate?.(); }}
              >
                <Text strong ellipsis className="text-13px leading-tight w-full">{displayName}</Text>
                {user?.email && (
                  <Text type="secondary" ellipsis className="text-11px leading-tight w-full mt-2px">{user.email}</Text>
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
