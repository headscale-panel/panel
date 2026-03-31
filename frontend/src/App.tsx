import NotFound from "@/pages/NotFound";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./i18n/I18nProvider";
import { useI18n } from "./i18n/index";
import api from "./lib/api";
import { Suspense, lazy, useState, useEffect, type ReactNode } from "react";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { DASHBOARD_PERMISSIONS, METRICS_PERMISSIONS, SELF_DEVICE_PERMISSIONS } from "./lib/permissions";

const BASE = '/panel';
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Devices = lazy(() => import("./pages/Devices"));
const Login = lazy(() => import("./pages/Login"));
const Users = lazy(() => import("./pages/Users"));
const Routes = lazy(() => import("./pages/Routes"));
const Resources = lazy(() => import("./pages/Resources"));
const ACL = lazy(() => import("./pages/ACL"));
const Metrics = lazy(() => import("./pages/Metrics"));
const Settings = lazy(() => import("./pages/Settings"));
const DNS = lazy(() => import("./pages/DNS"));
const SetupWelcome = lazy(() => import("./pages/SetupWelcome"));
const NotFoundPage = lazy(() => import("@/pages/NotFound"));

function RouteFallback() {
  return (
    <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} />
    </div>
  );
}

function SetupGuard({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [location, setLocation] = useLocation();

  const checkStatus = () => {
    return api
      .get('/setup/status')
      .then((data: unknown) => {
        const d = data as Record<string, unknown>;
        return Boolean(d?.initialized);
      })
      .catch(() => true); // assume initialized on error
  };

  // Initial check on mount
  useEffect(() => {
    checkStatus().then((init) => {
      setInitialized(init);
      if (!init && !location.startsWith('/setup')) setLocation('/setup');
      if (init && location.startsWith('/setup')) setLocation('/login');
      setChecking(false);
    });
  }, []);

  // When navigating away from /setup, re-check status to pick up completed initialization
  useEffect(() => {
    if (checking || initialized === null) return;

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

  if (!initialized && !location.startsWith('/setup')) return null;

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
        <Route path="/404" component={NotFoundPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </Suspense>
  );
}

function ThemedApp({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <ThemeProvider defaultMode="system" locale={locale}>
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
              <AppRoutes />
            </SetupGuard>
          </WouterRouter>
        </ThemedApp>
      </I18nProvider>
    </ErrorBoundary>
  );
}

export default App;
