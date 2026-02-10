import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Router as WouterRouter } from "wouter";
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

/** All frontend routes live under /panel */
const BASE = '/panel';

function AppRoutes() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/setup" component={Setup} />

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
        <ProtectedRoute>
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
        <ProtectedRoute>
          <Resources />
        </ProtectedRoute>
      </Route>
      <Route path="/acl">
        <ProtectedRoute>
          <ACL />
        </ProtectedRoute>
      </Route>
      <Route path="/metrics">
        <ProtectedRoute>
          <Metrics />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/server-control">
        <ProtectedRoute>
          <ServerControl />
        </ProtectedRoute>
      </Route>
      <Route path="/dns">
        <ProtectedRoute>
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
              <AppRoutes />
            </WouterRouter>
          </TooltipProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

export default App;
