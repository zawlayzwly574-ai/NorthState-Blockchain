import { ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import { getAdminKey } from '@/lib/api';
import { Layout } from '@/components/layout';

import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import Transactions from '@/pages/transactions';
import Users from '@/pages/users';
import Kyc from '@/pages/kyc';
import Support from '@/pages/support';
import TradingControl from '@/pages/trading';
import MiningInvestments from '@/pages/mining-investments';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const key = getAdminKey();

  useEffect(() => {
    if (!key) {
      setLocation('/login');
    }
  }, [key, setLocation]);

  if (!key) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/login" component={Login} />
        
        <Route path="/">
          <ProtectedRoute component={Dashboard} />
        </Route>
        
        <Route path="/dashboard">
          <ProtectedRoute component={Dashboard} />
        </Route>
        
        <Route path="/transactions">
          <ProtectedRoute component={Transactions} />
        </Route>
        
        <Route path="/users">
          <ProtectedRoute component={Users} />
        </Route>
        
        <Route path="/kyc">
          <ProtectedRoute component={Kyc} />
        </Route>

        <Route path="/support">
          <ProtectedRoute component={Support} />
        </Route>

        <Route path="/trading">
          <ProtectedRoute component={TradingControl} />
        </Route>
        <Route path="/mining-investments">
          <ProtectedRoute component={MiningInvestments} />
        </Route>
        
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
