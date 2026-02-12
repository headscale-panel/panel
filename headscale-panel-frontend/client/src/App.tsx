import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./i18n/I18nProvider";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Devices from "./pages/Devices";
import Users from "./pages/Users";
import OIDCSettings from "./pages/OIDCSettings";
import Routes from "./pages/Routes";
import Resources from "./pages/Resources";
import ACL from "./pages/ACL";
import Metrics from "./pages/Metrics";
import Settings from "./pages/Settings";
import ServerControl from "./pages/ServerControl";
import Register from "./pages/Register";
import DNS from "./pages/DNS";
import Setup from "./pages/Setup";
import SetupWelcome from "./pages/SetupWelcome";
import api from "./lib/api";
import { useState, useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** All frontend routes live under /panel */
const BASE = '/panel';

/**
 * Guard: if the system has not been initialized yet, redirect every page
 * (except /setup itself) to /setup.
 */
function SetupGuard({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [initialized, setInitialized] = useState(true); // assume true to avoid flash
  const [location, setLocation] = useLocation();

  useEffect(() => {
    api
      .get('/setup/status')
      .then((data: unknown) => {
        const d = data as Record<string, unknown>;
        const init = Boolean(d?.initialized);
        setInitialized(init);
        if (!init && !location.startsWith('/setup')) {
          setLocation('/setup');
        }
      })
      .catch(() => {
        // On error assume initialized so users aren't blocked
        setInitialized(true);
      })
      .finally(() => setChecking(false));
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!checking && !initialized && !location.startsWith('/setup')) {
      setLocation('/setup');
    }
  }, [checking, initialized, location, setLocation]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // If not initialized and not on /setup, render nothing (redirect pending)
  if (!initialized && !location.startsWith('/setup')) {
    return null;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/setup" component={SetupWelcome} />
      <Route path="/setup/wizard" component={Setup} />

      {/* Protected routes */}
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/devices">
        <ProtectedRoute>
          <Devices />
        </ProtectedRoute>
      </Route>
      <Route path="/users">
        <ProtectedRoute requireAdmin>
          <Users />
        </ProtectedRoute>
      </Route>
      <Route path="/oidc">
        <ProtectedRoute>
          <OIDCSettings />
        </ProtectedRoute>
      </Route>
      <Route path="/routes">
        <ProtectedRoute>
          <Routes />
        </ProtectedRoute>
      </Route>
      <Route path="/resources">
        <ProtectedRoute requireAdmin>
          <Resources />
        </ProtectedRoute>
      </Route>
      <Route path="/acl">
        <ProtectedRoute requireAdmin>
          <ACL />
        </ProtectedRoute>
      </Route>
      <Route path="/metrics">
        <ProtectedRoute requireAdmin>
          <Metrics />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/server-control">
        <ProtectedRoute requireAdmin>
          <ServerControl />
        </ProtectedRoute>
      </Route>
      <Route path="/dns">
        <ProtectedRoute requireAdmin>
          <DNS />
        </ProtectedRoute>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider defaultMode="system">
          <TooltipProvider>
            <Toaster />
            <WouterRouter base={BASE}>
              <SetupGuard>
                <AppRoutes />
              </SetupGuard>
            </WouterRouter>
          </TooltipProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

export default App;
