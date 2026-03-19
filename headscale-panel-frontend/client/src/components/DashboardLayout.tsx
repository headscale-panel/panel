import { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import PageTransition from './PageTransition';
import { useIsMobile } from '@/hooks/useMobile';
import { useUIStore } from '@/lib/store';
import { getDashboardLayoutState } from '@/lib/layout';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const isMobile = useIsMobile();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const layoutState = getDashboardLayoutState({
    isMobile,
    isSidebarCollapsed: sidebarCollapsed,
    isMobileSidebarOpen: mobileSidebarOpen,
  });

  const handleMenuClick = () => {
    if (isMobile) {
      setMobileSidebarOpen((open) => !open);
      return;
    }

    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="min-h-screen bg-background">
      {layoutState.showMobileOverlay && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        collapsed={sidebarCollapsed}
        isMobile={isMobile}
        open={mobileSidebarOpen}
        onNavigate={() => setMobileSidebarOpen(false)}
      />

      <div
        className={cn('transition-all duration-300', layoutState.contentOffsetClassName)}
      >
        <Header onMenuClick={handleMenuClick} />

        <main className="p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
