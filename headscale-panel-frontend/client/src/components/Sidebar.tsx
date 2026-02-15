import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/i18n/index';
import {
  Activity,
  BarChart3,
  Globe,
  Home,
  Lock,
  LogOut,
  Route,
  Server,
  Settings,
  Users,
  Database,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';

interface SidebarProps {
  collapsed?: boolean;
}

const menuItems = [
  { icon: Home, key: 'dashboard' as const, path: '/' },
  { icon: Server, key: 'devices' as const, path: '/devices' },
  { icon: Users, key: 'users' as const, path: '/users', adminOnly: true },
  { icon: Route, key: 'routes' as const, path: '/routes' },
  { icon: Database, key: 'resources' as const, path: '/resources', adminOnly: true },
  { icon: Lock, key: 'acl' as const, path: '/acl', adminOnly: true },
  { icon: Globe, key: 'dns' as const, path: '/dns', adminOnly: true },
  { icon: BarChart3, key: 'metrics' as const, path: '/metrics', adminOnly: true },
  { icon: Settings, key: 'settings' as const, path: '/settings' },
];

export default function Sidebar({ collapsed = false }: SidebarProps) {
  const t = useTranslation();
  const [location, setLocation] = useLocation();
  const { user, clearAuth } = useAuthStore();

  const isAdmin = user?.role === 'admin';
  const visibleMenuItems = menuItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const displayName = user?.display_name || user?.username || t.sidebar.defaultUser;
  const email = user?.email || '';
  const avatarLetter = (user?.username || 'U')[0].toUpperCase();

  const handleLogout = () => {
    clearAuth();
    setLocation('/login');
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-card border-r border-border transition-all duration-300 z-50',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-border px-4">
        {collapsed ? (
          <Activity className="w-8 h-8 text-primary" />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-foreground">Headscale Panel</span>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <nav className="p-2 space-y-1">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;

          return (
            <Link key={item.path} href={item.path}>
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200',
                  'hover:bg-accent hover:text-accent-foreground',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium">{t.sidebar[item.key]}</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-border">
        {collapsed ? (
          <div className="p-2 space-y-2 flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">{avatarLetter}</span>
            </div>
            <button
              onClick={handleLogout}
              title={t.sidebar.logout}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-primary">{avatarLetter}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {displayName}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {email}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title={t.sidebar.logout}
                className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors flex-shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
