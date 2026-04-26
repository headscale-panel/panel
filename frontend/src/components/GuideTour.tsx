import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Tour } from 'antd';
import type { TourProps } from 'antd';
import { useLocation } from 'wouter';
import { authApi } from '@/api';
import { useTranslation } from '@/i18n/index';
import { getDefaultRouteForUser, canAccessTourSection, type TourSectionKey } from '@/lib/permissions';
import { useAuthStore, useUIStore } from '@/lib/store';

const TOUR_AUTO_SESSION_PREFIX = 'guide-tour-auto-opened-';
const TOUR_TARGET_TIMEOUT_MS = 5000;
const TOUR_TARGET_POLL_MS = 100;
const SETTINGS_TOUR_TAB_EVENT = 'guide-tour:settings-tab';

type TourPageKey = TourSectionKey | 'navigation';

interface StepDef {
  id: string;
  pageKey: TourPageKey;
  path: string;
  targetId: string;
  title: string;
  description: string;
  placement?: TourProps['placement'];
  requires?: () => boolean;
  prepare?: () => void;
}

function getAutoSessionKey(userId: number) {
  return `${TOUR_AUTO_SESSION_PREFIX}${userId}`;
}

function findTourTarget(targetId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour-id="${targetId}"]`);
}

function waitForTourTarget(targetId: string, timeoutMs = TOUR_TARGET_TIMEOUT_MS): Promise<HTMLElement | null> {
  const immediate = findTourTarget(targetId);
  if (immediate) {
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const target = findTourTarget(targetId);
      if (target) {
        window.clearInterval(timer);
        resolve(target);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, TOUR_TARGET_POLL_MS);
  });
}

export default function GuideTour() {
  const t = useTranslation();
  const gt = t.guideTour;
  const [location, setLocation] = useLocation();
  const { user, updateUser } = useAuthStore();
  const { guideTourOpen, setGuideTourOpen } = useUIStore();

  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [resolvedStepId, setResolvedStepId] = useState<string | null>(null);
  const [skippedPageKeys, setSkippedPageKeys] = useState<string[]>([]);

  const resolveRunRef = useRef(0);

  const firstAccessiblePath = useMemo(() => getDefaultRouteForUser(user), [user]);
  const isProtectedRoute = location !== '/login' && !location.startsWith('/setup');

  const allStepDefs = useMemo<StepDef[]>(() => [
    {
      id: 'nav-menu',
      pageKey: 'navigation',
      path: firstAccessiblePath,
      targetId: 'sidebar-menu',
      title: gt.navMenuTitle,
      description: gt.navMenuDesc,
      placement: 'right',
    },
    {
      id: 'nav-profile',
      pageKey: 'navigation',
      path: firstAccessiblePath,
      targetId: 'sidebar-profile',
      title: gt.navProfileTitle,
      description: gt.navProfileDesc,
      placement: 'right',
    },
    {
      id: 'dashboard-refresh',
      pageKey: 'dashboard',
      path: '/',
      targetId: 'dashboard-refresh',
      title: gt.dashboardRefreshTitle,
      description: gt.dashboardRefreshDesc,
    },
    {
      id: 'dashboard-stats',
      pageKey: 'dashboard',
      path: '/',
      targetId: 'dashboard-stats',
      title: gt.dashboardStatsTitle,
      description: gt.dashboardStatsDesc,
    },
    {
      id: 'dashboard-topology',
      pageKey: 'dashboard',
      path: '/',
      targetId: 'dashboard-topology',
      title: gt.dashboardTopologyTitle,
      description: gt.dashboardTopologyDesc,
    },
    {
      id: 'devices-add',
      pageKey: 'devices',
      path: '/devices',
      targetId: 'devices-add',
      title: gt.devicesAddTitle,
      description: gt.devicesAddDesc,
    },
    {
      id: 'devices-search',
      pageKey: 'devices',
      path: '/devices',
      targetId: 'devices-search',
      title: gt.devicesSearchTitle,
      description: gt.devicesSearchDesc,
    },
    {
      id: 'devices-list',
      pageKey: 'devices',
      path: '/devices',
      targetId: 'devices-list',
      title: gt.devicesListTitle,
      description: gt.devicesListDesc,
    },
    {
      id: 'users-actions',
      pageKey: 'users',
      path: '/users',
      targetId: 'users-actions',
      title: gt.usersActionsTitle,
      description: gt.usersActionsDesc,
    },
    {
      id: 'users-create',
      pageKey: 'users',
      path: '/users',
      targetId: 'users-create',
      title: gt.usersCreateTitle,
      description: gt.usersCreateDesc,
    },
    {
      id: 'users-tree',
      pageKey: 'users',
      path: '/users',
      targetId: 'users-tree',
      title: gt.usersTreeTitle,
      description: gt.usersTreeDesc,
    },
    {
      id: 'routes-filters',
      pageKey: 'routes',
      path: '/routes',
      targetId: 'routes-filters',
      title: gt.routesFiltersTitle,
      description: gt.routesFiltersDesc,
    },
    {
      id: 'routes-table',
      pageKey: 'routes',
      path: '/routes',
      targetId: 'routes-table',
      title: gt.routesTableTitle,
      description: gt.routesTableDesc,
    },
    {
      id: 'resources-create',
      pageKey: 'resources',
      path: '/resources',
      targetId: 'resources-create',
      title: gt.resourcesCreateTitle,
      description: gt.resourcesCreateDesc,
    },
    {
      id: 'resources-search',
      pageKey: 'resources',
      path: '/resources',
      targetId: 'resources-search',
      title: gt.resourcesSearchTitle,
      description: gt.resourcesSearchDesc,
    },
    {
      id: 'acl-sync',
      pageKey: 'acl',
      path: '/acl',
      targetId: 'acl-sync',
      title: gt.aclSyncTitle,
      description: gt.aclSyncDesc,
    },
    {
      id: 'acl-json',
      pageKey: 'acl',
      path: '/acl',
      targetId: 'acl-json',
      title: gt.aclJsonTitle,
      description: gt.aclJsonDesc,
    },
    {
      id: 'acl-add-rule',
      pageKey: 'acl',
      path: '/acl',
      targetId: 'acl-add-rule',
      title: gt.aclAddRuleTitle,
      description: gt.aclAddRuleDesc,
    },
    {
      id: 'dns-apply',
      pageKey: 'dns',
      path: '/dns',
      targetId: 'dns-apply',
      title: gt.dnsApplyTitle,
      description: gt.dnsApplyDesc,
    },
    {
      id: 'dns-add-record',
      pageKey: 'dns',
      path: '/dns',
      targetId: 'dns-add-record',
      title: gt.dnsAddRecordTitle,
      description: gt.dnsAddRecordDesc,
    },
    {
      id: 'dns-filters',
      pageKey: 'dns',
      path: '/dns',
      targetId: 'dns-filters',
      title: gt.dnsFiltersTitle,
      description: gt.dnsFiltersDesc,
    },
    {
      id: 'metrics-range',
      pageKey: 'metrics',
      path: '/metrics',
      targetId: 'metrics-range',
      title: gt.metricsRangeTitle,
      description: gt.metricsRangeDesc,
    },
    {
      id: 'metrics-charts',
      pageKey: 'metrics',
      path: '/metrics',
      targetId: 'metrics-charts',
      title: gt.metricsChartsTitle,
      description: gt.metricsChartsDesc,
    },
    {
      id: 'panel-accounts-create',
      pageKey: 'panelAccounts',
      path: '/panel-accounts',
      targetId: 'panel-accounts-create',
      title: gt.panelAccountsCreateTitle,
      description: gt.panelAccountsCreateDesc,
    },
    {
      id: 'panel-accounts-filters',
      pageKey: 'panelAccounts',
      path: '/panel-accounts',
      targetId: 'panel-accounts-filters',
      title: gt.panelAccountsFiltersTitle,
      description: gt.panelAccountsFiltersDesc,
    },
    {
      id: 'panel-accounts-table',
      pageKey: 'panelAccounts',
      path: '/panel-accounts',
      targetId: 'panel-accounts-table',
      title: gt.panelAccountsTableTitle,
      description: gt.panelAccountsTableDesc,
    },
    {
      id: 'settings-tabs',
      pageKey: 'settings',
      path: '/settings',
      targetId: 'settings-tabs',
      title: gt.settingsTabsTitle,
      description: gt.settingsTabsDesc,
    },
    {
      id: 'settings-headscale-save',
      pageKey: 'settings',
      path: '/settings',
      targetId: 'settings-grpc-save',
      title: gt.settingsHeadscaleSaveTitle,
      description: gt.settingsHeadscaleSaveDesc,
      prepare: () => window.dispatchEvent(new CustomEvent(SETTINGS_TOUR_TAB_EVENT, { detail: 'grpc' })),
    },
    {
      id: 'settings-oidc-save',
      pageKey: 'settings',
      path: '/settings',
      targetId: 'settings-oidc-save',
      title: gt.settingsOidcSaveTitle,
      description: gt.settingsOidcSaveDesc,
      prepare: () => window.dispatchEvent(new CustomEvent(SETTINGS_TOUR_TAB_EVENT, { detail: 'oidc' })),
    },
    {
      id: 'profile-totp',
      pageKey: 'profile',
      path: '/profile',
      targetId: 'profile-totp',
      title: gt.profileTotpTitle,
      description: gt.profileTotpDesc,
    },
    {
      id: 'profile-guide',
      pageKey: 'profile',
      path: '/profile',
      targetId: 'profile-guide',
      title: gt.profileGuideTitle,
      description: gt.profileGuideDesc,
    },
  ], [firstAccessiblePath, gt]);

  const accessibleStepDefs = useMemo(
    () => allStepDefs.filter((step) => step.pageKey === 'navigation' || canAccessTourSection(user, step.pageKey)),
    [allStepDefs, user],
  );

  const runStepDefs = useMemo(
    () => accessibleStepDefs.filter((step) => !skippedPageKeys.includes(step.pageKey)),
    [accessibleStepDefs, skippedPageKeys],
  );

  const currentIndex = useMemo(
    () => runStepDefs.findIndex((step) => step.id === currentStepId),
    [runStepDefs, currentStepId],
  );

  const resolvedIndex = useMemo(
    () => runStepDefs.findIndex((step) => step.id === resolvedStepId),
    [runStepDefs, resolvedStepId],
  );

  const steps = useMemo<NonNullable<TourProps['steps']>>(
    () => runStepDefs.map((step) => ({
      title: step.title,
      description: step.description,
      placement: (step.placement ?? 'bottom') as TourProps['placement'],
      target: () => findTourTarget(step.targetId)!,
    })),
    [runStepDefs],
  );

  const closeTour = useCallback(() => {
    resolveRunRef.current += 1;
    setOpen(false);
    setReady(false);
    setCurrentStepId(null);
    setResolvedStepId(null);
    setSkippedPageKeys([]);
  }, []);

  const startTour = useCallback(() => {
    if (accessibleStepDefs.length === 0) {
      return;
    }
    resolveRunRef.current += 1;
    setSkippedPageKeys([]);
    setResolvedStepId(null);
    setReady(false);
    setCurrentStepId(accessibleStepDefs[0].id);
    setOpen(true);
  }, [accessibleStepDefs]);

  const moveToStepById = useCallback((stepId: string | null) => {
    if (!stepId) {
      closeTour();
      return;
    }
    setResolvedStepId(null);
    setReady(false);
    setCurrentStepId(stepId);
  }, [closeTour]);

  const moveToNextFromId = useCallback((stepId: string) => {
    const index = runStepDefs.findIndex((step) => step.id === stepId);
    if (index === -1 || index >= runStepDefs.length - 1) {
      closeTour();
      return;
    }
    moveToStepById(runStepDefs[index + 1].id);
  }, [closeTour, moveToStepById, runStepDefs]);

  const handleChange = useCallback((nextIndex: number) => {
    const nextStep = runStepDefs[nextIndex];
    if (!nextStep) {
      closeTour();
      return;
    }
    moveToStepById(nextStep.id);
  }, [closeTour, moveToStepById, runStepDefs]);

  const handleSkipCurrentPage = useCallback(() => {
    if (currentIndex < 0) {
      closeTour();
      return;
    }

    const currentStep = runStepDefs[currentIndex];
    const nextStep = runStepDefs.slice(currentIndex + 1).find((step) => step.pageKey !== currentStep.pageKey);

    setSkippedPageKeys((prev) => (
      prev.includes(currentStep.pageKey) ? prev : [...prev, currentStep.pageKey]
    ));

    if (nextStep) {
      moveToStepById(nextStep.id);
      return;
    }

    closeTour();
  }, [closeTour, currentIndex, moveToStepById, runStepDefs]);

  useEffect(() => {
    if (!open || !currentStepId || !isProtectedRoute) {
      return;
    }

    const step = runStepDefs.find((item) => item.id === currentStepId);
    if (!step) {
      closeTour();
      return;
    }

    let cancelled = false;
    const runId = resolveRunRef.current + 1;
    resolveRunRef.current = runId;

    setReady(false);
    setResolvedStepId(null);

    const resolveStep = async () => {
      if (step.prepare) {
        step.prepare();
      }

      if (location !== step.path) {
        setLocation(step.path);
      }

      const target = await waitForTourTarget(step.targetId);
      if (cancelled || resolveRunRef.current != runId) {
        return;
      }

      if (!target) {
        moveToNextFromId(step.id);
        return;
      }

      setResolvedStepId(step.id);
      setReady(true);
    };

    void resolveStep();

    return () => {
      cancelled = true;
    };
  }, [closeTour, currentStepId, isProtectedRoute, location, moveToNextFromId, runStepDefs, setLocation]);

  useEffect(() => {
    if (!guideTourOpen) {
      return;
    }
    startTour();
    setGuideTourOpen(false);
  }, [guideTourOpen, setGuideTourOpen, startTour]);

  useEffect(() => {
    if (!user?.id || !isProtectedRoute || open) {
      return;
    }
    if (accessibleStepDefs.length === 0) {
      return;
    }
    if (user.guide_tour_seen_at) {
      return;
    }
    if (sessionStorage.getItem(getAutoSessionKey(user.id))) {
      return;
    }

    const sessionKey = getAutoSessionKey(user.id);
    sessionStorage.setItem(sessionKey, '1');

    authApi.markGuideTourSeen()
      .then(() => {
        updateUser({
          ...user,
          guide_tour_seen_at: new Date().toISOString(),
        });
      })
      .catch(() => {
        // Keep the current session from looping even if the mark request fails.
      })
      .finally(() => {
        startTour();
      });
  }, [accessibleStepDefs.length, isProtectedRoute, open, startTour, updateUser, user]);

  if (!user || !isProtectedRoute || steps.length === 0 || currentIndex === -1 || resolvedIndex === -1 && ready) {
    return null;
  }

  return (
    <Tour
      open={open && ready && resolvedIndex >= 0}
      current={resolvedIndex >= 0 ? resolvedIndex : 0}
      onChange={handleChange}
      onClose={closeTour}
      steps={steps}
      indicatorsRender={(cur, total) => (
        <span>{cur + 1} / {total}</span>
      )}
      actionsRender={(originNode, { current: cur, total }) => (
        <>
          <Button size="small" onClick={handleSkipCurrentPage}>
            {gt.skipPage}
          </Button>
          {cur < total - 1 && (
            <Button size="small" onClick={closeTour}>
              {gt.skipAll}
            </Button>
          )}
          {originNode}
        </>
      )}
    />
  );
}
