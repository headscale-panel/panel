import { useState } from 'react';
import { Layout, Drawer } from 'antd';
import Header from './Header';
import Sidebar from './Sidebar';
import PageTransition from './PageTransition';
import { useIsMobile } from '@/hooks/useMobile';
import { useUIStore } from '@/lib/store';

const { Content } = Layout;

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 64;

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const isMobile = useIsMobile();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleMenuClick = () => {
    if (isMobile) {
      setMobileSidebarOpen((open) => !open);
      return;
    }
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <Layout className="min-h-screen">
      {isMobile ? (
        <Drawer
          placement="left"
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          width={SIDEBAR_WIDTH}
          styles={{ body: { padding: 0 } }}
          closable={false}
        >
          <Sidebar
            collapsed={false}
            isMobile
            onNavigate={() => setMobileSidebarOpen(false)}
          />
        </Drawer>
      ) : (
        <Sidebar collapsed={sidebarCollapsed} />
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH), transition: 'margin-left 0.2s' }}>
        <Header onMenuClick={handleMenuClick} />
        <Content className="p-6">
          <PageTransition>{children}</PageTransition>
        </Content>
      </Layout>
    </Layout>
  );
}
