import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useAdminStats, clearAdminKey } from '@/lib/api';
import { LayoutDashboard, ArrowRightLeft, Users, FileCheck, LogOut, TerminalSquare, MessageSquare, TrendingUp, Pickaxe } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { data: stats } = useAdminStats();

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

  return (
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground selection:bg-primary/30 font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <TerminalSquare className="w-6 h-6 text-primary mr-3" />
          <span className="font-mono font-bold tracking-tight">NORTH STATE <span className="text-primary">BLOCKCHAIN ADMIN</span></span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href === '/dashboard' && location === '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center px-3 py-2 text-sm font-medium rounded-md group transition-colors relative
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
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <button
            onClick={() => clearAdminKey()}
            className="flex items-center w-full px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            data-testid="btn-logout"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 md:hidden flex items-center px-4 border-b border-border bg-card">
          <TerminalSquare className="w-6 h-6 text-primary mr-3" />
          <span className="font-mono font-bold tracking-tight">NORTH STATE <span className="text-primary">BLOCKCHAIN ADMIN</span></span>
          <button
            onClick={() => clearAdminKey()}
            className="ml-auto p-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
