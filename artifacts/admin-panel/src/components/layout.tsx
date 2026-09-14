import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAdminStats, clearAdminKey } from '@/lib/api';
import { LayoutDashboard, ArrowRightLeft, Users, FileCheck, LogOut, TerminalSquare, MessageSquare, TrendingUp, Pickaxe, Menu, X } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { data: stats } = useAdminStats();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer whenever the route changes so navigating never leaves
  // it open over the next page.
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { 
      name: 'Transactions', 
      href: '/transactions', 
      icon: ArrowRightLeft,
      badge: (stats?.pendingDeposits || 0) + (stats?.pendingWithdrawals || 0)
    },
    { name: 'Users', href: '/users', icon: Users },
    { 
      name: 'KYC Verification', 
      href: '/kyc', 
      icon: FileCheck,
      badge: stats?.pendingKyc || 0
    },
    { name: 'Trading', href: '/trading', icon: TrendingUp },
    { name: 'Mining Investments', href: '/mining-investments', icon: Pickaxe, badge: stats?.pendingInvestments || 0 },
    { name: 'Support', href: '/support', icon: MessageSquare },
  ];

  const navLinks = (onNavigate?: () => void) => navigation.map((item) => {
    const isActive = location === item.href || (item.href === '/dashboard' && location === '/');
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={onNavigate}
        className={`
          flex min-h-11 items-center px-3 py-2.5 text-sm font-medium rounded-md group transition-colors relative
          ${isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
          }
        `}
        data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
      >
        <item.icon className={`mr-3 h-4 w-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
        {item.name}

        {!!item.badge && item.badge > 0 && (
          <span className={`
            ml-auto inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-mono font-medium
            ${isActive ? 'bg-primary text-primary-foreground' : 'bg-destructive/20 text-destructive'}
          `}>
            {item.badge}
          </span>
        )}
      </Link>
    );
  });

  return (
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground selection:bg-primary/30 font-sans overflow-x-hidden">
      {/* Desktop sidebar */}
      <div className="w-64 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <TerminalSquare className="w-6 h-6 text-primary mr-3 shrink-0" />
          <span className="font-mono font-bold tracking-tight truncate">NORTH STATE <span className="text-primary">BLOCKCHAIN ADMIN</span></span>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {navLinks()}
        </nav>

        <div className="p-4 border-t border-border">
          <button
            onClick={() => clearAdminKey()}
            className="flex min-h-11 items-center w-full px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            data-testid="btn-logout"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card transition-transform duration-300 md:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
      >
        <div className="h-16 flex items-center px-4 border-b border-border">
          <TerminalSquare className="w-6 h-6 text-primary mr-3 shrink-0" />
          <span className="font-mono font-bold tracking-tight text-sm truncate">NORTH STATE <span className="text-primary">ADMIN</span></span>
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
            aria-label="Close navigation"
            data-testid="button-close-navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {navLinks(() => setMobileOpen(false))}
        </nav>

        <div className="p-4 border-t border-border">
          <button
            onClick={() => clearAdminKey()}
            className="flex min-h-11 items-center w-full px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 md:hidden flex items-center px-4 border-b border-border bg-card">
          <button
            onClick={() => setMobileOpen(true)}
            className="mr-3 grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
            aria-label="Open navigation"
            data-testid="button-open-navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-mono font-bold tracking-tight text-sm truncate">NORTH STATE <span className="text-primary">ADMIN</span></span>
          <button
            onClick={() => clearAdminKey()}
            className="ml-auto grid h-10 w-10 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
