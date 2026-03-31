import { describe, expect, it } from 'vitest';
import { getDashboardLayoutState } from './layout';

describe('dashboard layout state', () => {
  it('uses overlay navigation on mobile screens', () => {
    expect(
      getDashboardLayoutState({
        isMobile: true,
        isSidebarCollapsed: false,
        isMobileSidebarOpen: true,
      })
    ).toEqual({
      contentOffsetClassName: 'ml-0',
      showMobileOverlay: true,
    });
  });

  it('uses desktop content offsets when not on mobile', () => {
    expect(
      getDashboardLayoutState({
        isMobile: false,
        isSidebarCollapsed: true,
        isMobileSidebarOpen: false,
      })
    ).toEqual({
      contentOffsetClassName: 'lg:ml-16',
      showMobileOverlay: false,
    });
  });
});
