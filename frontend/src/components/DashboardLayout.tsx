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

import { Drawer, Layout } from 'antd';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/useMobile';
import { useUIStore } from '@/lib/store';
import Header from './Header';
import PageTransition from './PageTransition';
import Sidebar from './Sidebar';

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
      {isMobile
        ? (
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
          )
        : (
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
