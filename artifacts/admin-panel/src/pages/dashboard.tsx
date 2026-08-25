import { useAdminStats, useAdminTransactions, useAdminKyc } from '@/lib/api';
import { formatAsset, formatRelativeTime } from '@/lib/utils';
import { Link } from 'wouter';
import { Activity, ArrowRightLeft, Users, FileCheck, ArrowUpRight, ArrowDownLeft, Send } from 'lucide-react';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: transactions, isLoading: txLoading } = useAdminTransactions();
  const { data: kyc, isLoading: kycLoading } = useAdminKyc();

  const pendingTx = transactions?.filter(t => t.status === 'pending') || [];
  const pendingKycList = kyc?.filter(k => k.status === 'pending') || [];

  if (statsLoading) {
    return <div className="animate-pulse space-y-8">
      <div className="h-8 w-64 bg-muted rounded"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-card rounded-xl"></div>)}
      </div>
    </div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-mono tracking-tight">Command Center</h1>
        <p className="text-muted-foreground mt-1">Platform overview and pending actions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Users" 
          value={stats?.totalUsers || 0} 
          icon={Users} 
        />
        <StatCard 
          title="Pending Deposits" 
          value={stats?.pendingDeposits || 0} 
          icon={ArrowDownLeft}
          alert={!!stats?.pendingDeposits}
        />
        <StatCard 
          title="Pending Withdrawals" 
          value={stats?.pendingWithdrawals || 0} 
          icon={ArrowUpRight} 
          alert={!!stats?.pendingWithdrawals}
        />
        <StatCard 
          title="Pending KYC" 
          value={stats?.pendingKyc || 0} 
          icon={FileCheck} 
          alert={!!stats?.pendingKyc}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Action: Transactions */}
        <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center bg-background/50">
            <h2 className="font-semibold flex items-center">
              <Activity className="w-4 h-4 mr-2 text-primary" />
              Recent Pending Transactions
            </h2>
            <Link href="/transactions" className="text-xs text-primary hover:underline font-mono">View All</Link>
          </div>
          <div className="p-0 overflow-x-auto">
            {txLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
            ) : pendingTx.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <ArrowRightLeft className="w-6 h-6 text-muted-foreground/50" />
                </div>
                No pending transactions
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/20 uppercase font-mono">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendingTx.slice(0, 5).map(tx => (
                    <tr key={tx.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{tx.displayName}</div>
                        <div className="text-xs text-muted-foreground">{tx.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium
                          ${tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-500' : 
                            tx.type === 'withdrawal' ? 'bg-amber-500/10 text-amber-500' : 
                            'bg-blue-500/10 text-blue-500'}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground font-medium">
                        {formatAsset(tx.amount, tx.asset)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Needs Action: KYC */}
        <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center bg-background/50">
            <h2 className="font-semibold flex items-center">
              <FileCheck className="w-4 h-4 mr-2 text-primary" />
              Recent KYC Submissions
            </h2>
            <Link href="/kyc" className="text-xs text-primary hover:underline font-mono">View All</Link>
          </div>
          <div className="p-0 overflow-x-auto">
            {kycLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
            ) : pendingKycList.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <FileCheck className="w-6 h-6 text-muted-foreground/50" />
                </div>
                No pending KYC submissions
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/20 uppercase font-mono">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Document</th>
                    <th className="px-4 py-3 font-medium text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendingKycList.slice(0, 5).map(k => (
                    <tr key={k.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{k.fullName}</div>
                        <div className="text-xs text-muted-foreground">{k.country}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {k.documentType}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs font-mono" title={new Date(k.submittedAt).toLocaleString()}>
                        {formatRelativeTime(k.submittedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, alert }: { title: string, value: number, icon: any, alert?: boolean }) {
  return (
    <div className={`bg-card border rounded-xl p-5 relative overflow-hidden transition-all ${alert ? 'border-primary shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'border-border'}`}>
      {alert && <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 blur-2xl rounded-full translate-x-1/2 -translate-y-1/2" />}
      <div className="flex justify-between items-start mb-4 relative z-10">
        <h3 className="text-sm font-medium text-muted-foreground font-mono">{title}</h3>
        <div className={`p-2 rounded-lg ${alert ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground'}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-3xl font-bold tracking-tight text-foreground relative z-10">{value.toLocaleString()}</div>
    </div>
  );
}
