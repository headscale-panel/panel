export interface DashboardLayoutStateInput {
  isMobile: boolean;
  isSidebarCollapsed: boolean;
  isMobileSidebarOpen: boolean;
}

export interface DashboardLayoutState {
  contentOffsetClassName: string;
  showMobileOverlay: boolean;
}

export function getDashboardLayoutState({
  isMobile,
  isSidebarCollapsed,
  isMobileSidebarOpen,
}: DashboardLayoutStateInput): DashboardLayoutState {
  if (isMobile) {
    return {
      contentOffsetClassName: 'ml-0',
      showMobileOverlay: isMobileSidebarOpen,
    };
  }

  return {
    contentOffsetClassName: isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60',
    showMobileOverlay: false,
  };
}
