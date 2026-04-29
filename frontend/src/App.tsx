import type { ReactNode } from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/NotFound';
import { setupApi, statusApi } from './api';
import ErrorBoundary from './components/ErrorBoundary';
import GuideTour from './components/GuideTour';
import ProtectedRoute from './components/ProtectedRoute';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './i18n/I18nProvider';
import { useI18n } from './i18n/index';
import { ThemeMode } from './lib/enums';
import { DASHBOARD_PERMISSIONS, METRICS_PERMISSIONS, SELF_DEVICE_PERMISSIONS } from './lib/permissions';
import { useAuthStore, useSystemStatusStore } from './lib/store';
import ACL from './pages/ACL';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import DNS from './pages/DNS';
import Login from './pages/Login';
import Metrics from './pages/Metrics';
import PanelAccounts from './pages/PanelAccounts';
import Profile from './pages/Profile';
import Resources from './pages/Resources';
import Routes from './pages/Routes';
import Settings from './pages/Settings';
import SetupWelcome from './pages/SetupWelcome';
import Users from './pages/Users';

const BASE = '/panel';

function SetupGuard({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [location, setLocation] = useLocation();

  const checkStatus = () => {
    return setupApi
      .getStatus()
      .then((data) => {
        return Boolean(data?.initialized);
      })
      .catch(() => true); // assume initialized on error
  };

  // Initial check on mount
  useEffect(() => {
    checkStatus().then((init) => {
      setInitialized(init);
      if (!init && !location.startsWith('/setup'))
        setLocation('/setup');
      if (init && location.startsWith('/setup'))
        setLocation('/login');
      setChecking(false);
    });
  }, []);

  // When navigating away from /setup, re-check status to pick up completed initialization
  useEffect(() => {
    if (checking || initialized === null)
      return;

    if (!initialized && !location.startsWith('/setup')) {
      // User navigated away from setup but we thought it wasn't initialized - re-check
      checkStatus().then((init) => {
        setInitialized(init);
        if (!init) {
          setLocation('/setup');
        }
      });
    }
    if (initialized && location.startsWith('/setup')) {
      setLocation('/login');
    }
  }, [location]);

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
      </div>
    );
  }

  if (!initialized && !location.startsWith('/setup'))
    return null;

  return <>{children}</>;
}

/** Fetches the global system status once after the user is authenticated. */
function SystemStatusLoader() {
  const { isAuthenticated } = useAuthStore();
  const { setStatus, setLoading, lastFetchedAt } = useSystemStatusStore();

  useEffect(() => {
    if (!isAuthenticated || lastFetchedAt !== null)
      return;

    setLoading(true);
    statusApi
      .getSystemStatus()
      .then((data) => setStatus(data))
      .catch(() => { /* non-fatal – components handle missing status gracefully */ })
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return null;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/setup" component={SetupWelcome} />

      <Route path="/">
        <ProtectedRoute requiredPermissions={[...DASHBOARD_PERMISSIONS]}><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/devices">
        <ProtectedRoute requiredPermissions={[...SELF_DEVICE_PERMISSIONS]}><Devices /></ProtectedRoute>
      </Route>
      <Route path="/users">
        <ProtectedRoute requireAdmin><Users /></ProtectedRoute>
      </Route>
      <Route path="/routes">
        <ProtectedRoute requiredPermissions={['headscale:route:list']}><Routes /></ProtectedRoute>
      </Route>
      <Route path="/resources">
        <ProtectedRoute requireAdmin><Resources /></ProtectedRoute>
      </Route>
      <Route path="/acl">
        <ProtectedRoute requireAdmin><ACL /></ProtectedRoute>
      </Route>
      <Route path="/metrics">
        <ProtectedRoute requiredPermissions={[...METRICS_PERMISSIONS]}><Metrics /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute requireAdmin><Settings /></ProtectedRoute>
      </Route>
      <Route path="/dns">
        <ProtectedRoute requireAdmin><DNS /></ProtectedRoute>
      </Route>
      <Route path="/panel-accounts">
        <ProtectedRoute requireAdmin><PanelAccounts /></ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute><Profile /></ProtectedRoute>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ThemedApp({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <ThemeProvider defaultMode={ThemeMode.System} locale={locale}>
      {children}
    </ThemeProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemedApp>
          <WouterRouter base={BASE}>
            <SetupGuard>
              <SystemStatusLoader />
              <AppRoutes />
              <GuideTour />
            </SetupGuard>
          </WouterRouter>
        </ThemedApp>
      </I18nProvider>
    </ErrorBoundary>
  );
}

export default App;
