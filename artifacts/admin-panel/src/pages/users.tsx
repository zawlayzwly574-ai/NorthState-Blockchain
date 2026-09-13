import { useState } from 'react';
import {
  useAdminUsers,
  useAdminUserDetail,
  useUpdateAdminUserStatus,
  useDeleteAdminUser,
  useAdjustAdminUserBalance,
} from '@/lib/api';
import {
  Search, ShieldAlert, ShieldCheck, Shield, Loader2,
  X, ArrowUpRight, ArrowDownLeft, Coins, FileCheck, TrendingUp, User,
  Ban, Snowflake, Trash2, Unlock, Wallet,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function money(v = 0) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function typeIcon(type: string) {
  if (type === 'deposit') return <ArrowDownLeft className="w-4 h-4 text-emerald-400" />;
  if (type === 'withdrawal' || type === 'send') return <ArrowUpRight className="w-4 h-4 text-rose-400" />;
  return <Coins className="w-4 h-4 text-muted-foreground" />;
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-400',
    pending: 'bg-amber-500/15 text-amber-400',
    failed: 'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${cls[status] ?? 'bg-muted/20 text-muted-foreground'}`}>
      {status}
    </span>
  );
}

function AccountStatusBadge({ status }: { status: UserStatus }) {
  const cls: Record<UserStatus, string> = {
    active: 'bg-emerald-500/15 text-emerald-400',
    suspended: 'bg-rose-500/15 text-rose-400',
    frozen: 'bg-sky-500/15 text-sky-400',
    deleted: 'bg-muted/20 text-muted-foreground',
    unknown: 'bg-amber-500/15 text-amber-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${cls[status]}`}>
      {status}
    </span>
  );
}

type UserStatus = 'active' | 'suspended' | 'frozen' | 'deleted' | 'unknown';

function UserDetailDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, isLoading, isError } = useAdminUserDetail(userId);
  const [detailTab, setDetailTab] = useState<'holdings' | 'transactions' | 'kyc'>('holdings');

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto bg-card border-border text-foreground p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          {isLoading ? (
            <DialogTitle className="text-muted-foreground font-mono">Loading…</DialogTitle>
          ) : isError || !data ? (
            <DialogTitle className="text-destructive">Failed to load user</DialogTitle>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/15 grid place-items-center text-primary font-bold text-lg">
                {data.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-bold">{data.displayName}</DialogTitle>
                <p className="text-xs font-mono text-muted-foreground truncate">{data.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {data.verificationStatus === 'verified' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                ) : data.verificationStatus === 'pending' ? (
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                ) : (
                  <Shield className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {data.verificationStatus}
                </span>
              </div>
            </div>
          )}
        </DialogHeader>

        {!isLoading && !isError && data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 px-6 py-4 border-b border-border">
              <div className="rounded-xl bg-primary/8 border border-primary/15 p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Portfolio Value</p>
                <p className="mt-1 font-mono text-lg font-medium text-primary">{money(data.totalHoldings)}</p>
              </div>
              <div className="rounded-xl bg-muted/20 border border-border p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Member Since</p>
                <p className="mt-1 font-mono text-sm font-medium">{new Date(data.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-border">
              {(['holdings', 'transactions', 'kyc'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`flex-1 px-4 py-3 text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                    detailTab === tab
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Holdings tab */}
              {detailTab === 'holdings' && (
                <div className="space-y-2">
                  {data.holdings.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No holdings yet.</p>
                  ) : (
                    data.holdings.map((h) => (
                      <div key={h.symbol} className="flex items-center gap-3 rounded-xl bg-muted/10 border border-border px-4 py-3">
                        <span
                          className="w-9 h-9 shrink-0 grid place-items-center rounded-full text-xs font-extrabold text-[#071326]"
                          style={{ backgroundColor: h.color }}
                        >
                          {h.symbol.slice(0, 1)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm">{h.symbol}</p>
                          <p className="text-xs text-muted-foreground">{h.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-medium">{money(h.value)}</p>
                          <p className={`text-[10px] font-bold ${h.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {h.change24h >= 0 ? '+' : ''}{h.change24h.toFixed(2)}%
                          </p>
                        </div>
                        <div className="hidden sm:block text-right text-xs text-muted-foreground font-mono w-16">
                          {h.allocation.toFixed(1)}%
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Transactions tab */}
              {detailTab === 'transactions' && (
                <div className="space-y-2">
                  {data.transactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No transactions yet.</p>
                  ) : (
                    data.transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-3 rounded-xl bg-muted/10 border border-border px-4 py-3">
                        <div className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-muted/20">
                          {typeIcon(tx.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm capitalize">{tx.type} · {tx.asset}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {new Date(tx.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm">{tx.amount} {tx.asset}</p>
                          <StatusBadge status={tx.status} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* KYC tab */}
              {detailTab === 'kyc' && (
                <div>
                  {!data.kyc ? (
                    <div className="text-center py-6">
                      <FileCheck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                      <p className="text-sm text-muted-foreground">No KYC submission found.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">KYC Status</p>
                        <StatusBadge status={data.kyc.status} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          ['Full Name', data.kyc.fullName],
                          ['Email', data.kyc.email],
                          ['Country', data.kyc.country],
                          ['City / State', data.kyc.city],
                          ['Occupation', data.kyc.occupation],
                          ['Document Type', data.kyc.documentType?.replace(/_/g, ' ')],
                          ['Submitted', new Date(data.kyc.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl bg-muted/10 border border-border p-3">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
                            <p className="mt-1 text-sm font-medium truncate">{value || '—'}</p>
                          </div>
                        ))}
                      </div>
                      {/* SSN (sensitive) */}
                      <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-3">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400">SSN (Sensitive)</p>
                        <p className="mt-1 text-sm font-mono font-medium blur-sm select-none hover:blur-none transition-all cursor-pointer" title="Click to reveal">
                          {data.kyc.ssn || '—'}
                        </p>
                      </div>
                      {/* Document image */}
                      {data.kyc.documentImageBase64 && data.kyc.documentImageBase64.startsWith('data:image') && (
                        <div>
                          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">ID Document</p>
                          <a href={data.kyc.documentImageBase64} target="_blank" rel="noopener noreferrer">
                            <img
                              src={data.kyc.documentImageBase64}
                              alt="KYC document"
                              className="max-h-56 w-full object-contain rounded-xl border border-border bg-muted/20 cursor-zoom-in"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">Click to open full size ↗</p>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Users() {
  const { data: users, isLoading } = useAdminUsers();
  const updateStatus = useUpdateAdminUserStatus();
  const deleteUser = useDeleteAdminUser();
  const adjustBalance = useAdjustAdminUserBalance();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [balanceUser, setBalanceUser] = useState<{ clerkUserId: string; displayName: string } | null>(null);
  const [balanceDirection, setBalanceDirection] = useState<'credit' | 'debit'>('credit');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const filtered = users?.filter(u =>
    u.displayName.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleStatusChange = (
    event: React.MouseEvent,
    userId: string,
    status: 'active' | 'suspended' | 'frozen',
  ) => {
    event.stopPropagation();
    setActionError(null);
    updateStatus.mutate({ userId, status }, {
      onError: (error) => setActionError(error instanceof Error ? error.message : 'Unable to update account status.'),
    });
  };

  const handleDelete = (event: React.MouseEvent, userId: string, displayName: string) => {
    event.stopPropagation();
    if (!window.confirm(`Permanently delete ${displayName}'s account? Existing wallet and transaction records will be preserved.`)) return;
    setActionError(null);
    deleteUser.mutate(userId, {
      onError: (error) => setActionError(error instanceof Error ? error.message : 'Unable to delete user account.'),
    });
  };

  const resetBalanceDialog = () => {
    setBalanceUser(null);
    setBalanceAmount('');
    setBalanceReason('');
    setBalanceDirection('credit');
    setBalanceError(null);
  };

  const closeBalanceDialog = () => {
    if (adjustBalance.isPending) return;
    resetBalanceDialog();
  };

  const handleBalanceSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!balanceUser || !balanceAmount || !balanceReason.trim()) return;
    const action = balanceDirection === 'credit' ? 'add to' : 'deduct from';
    if (!window.confirm(`Confirm ${action} ${balanceAmount} USDT ${balanceDirection === 'credit' ? 'for' : 'from'} ${balanceUser.displayName}'s wallet balance?`)) return;
    setBalanceError(null);
    adjustBalance.mutate({
      userId: balanceUser.clerkUserId,
      direction: balanceDirection,
      amount: balanceAmount,
      reason: balanceReason.trim(),
    }, {
      onSuccess: resetBalanceDialog,
      onError: (error) => setBalanceError(error instanceof Error ? error.message : 'Unable to adjust user balance.'),
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight">User Directory</h1>
          <p className="text-muted-foreground text-sm mt-1">Click any user to inspect their account.</p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary font-sans"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {actionError && (
          <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-300" role="alert">
            {actionError}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/20 uppercase font-mono">
              <tr>
                <th className="px-5 py-4 font-medium">User</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Portfolio</th>
                <th className="px-5 py-4 font-medium">Joined</th>
                <th className="px-5 py-4 font-medium min-w-[280px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading directory...
                  </td>
                </tr>
              ) : !filtered || filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                filtered.map(user => (
                  <tr
                    key={user.id}
                    className="hover:bg-muted/8 transition-colors cursor-pointer group"
                    onClick={() => setSelectedUserId(user.clerkUserId)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{user.displayName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{user.email}</div>
                          <div className="mt-1 text-[10px] text-muted-foreground/70 font-mono">ID · {user.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-2">
                        {user.verificationStatus === 'verified' ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        ) : user.verificationStatus === 'pending' ? (
                          <ShieldAlert className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Shield className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="text-xs font-mono uppercase tracking-wider">
                          {user.verificationStatus}
                        </span>
                        <AccountStatusBadge status={user.accountStatus} />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-mono text-foreground">
                        ${user.totalHoldings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={user.accountStatus === 'deleted' || updateStatus.isPending || deleteUser.isPending || adjustBalance.isPending}
                          onClick={(event) => handleStatusChange(
                            event,
                            user.clerkUserId,
                            user.accountStatus === 'suspended' ? 'active' : 'suspended',
                          )}
                          className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/25 px-2.5 py-1.5 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          title={user.accountStatus === 'suspended' ? 'Restore access' : 'Block / suspend user'}
                        >
                          {user.accountStatus === 'suspended' ? <Unlock className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          {user.accountStatus === 'suspended' ? 'Unblock' : 'Suspend'}
                        </button>
                        <button
                          type="button"
                          disabled={user.accountStatus === 'deleted' || updateStatus.isPending || deleteUser.isPending || adjustBalance.isPending}
                          onClick={(event) => handleStatusChange(
                            event,
                            user.clerkUserId,
                            user.accountStatus === 'frozen' ? 'active' : 'frozen',
                          )}
                          className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/25 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          title={user.accountStatus === 'frozen' ? 'Unfreeze account' : 'Freeze transactions and portfolio'}
                        >
                          <Snowflake className="h-3.5 w-3.5" />
                          {user.accountStatus === 'frozen' ? 'Unfreeze' : 'Freeze'}
                        </button>
                        <button
                          type="button"
                          disabled={user.accountStatus === 'deleted' || updateStatus.isPending || deleteUser.isPending || adjustBalance.isPending}
                          onClick={(event) => handleDelete(event, user.clerkUserId, user.displayName)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Permanently delete user account"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                        <button
                          type="button"
                          disabled={user.accountStatus === 'deleted' || updateStatus.isPending || deleteUser.isPending || adjustBalance.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            setBalanceError(null);
                            setBalanceUser({ clerkUserId: user.clerkUserId, displayName: user.displayName });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Add or deduct USDT wallet balance"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          Adjust Balance
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!balanceUser} onOpenChange={(open) => { if (!open) closeBalanceDialog(); }}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              <Wallet className="h-5 w-5 text-primary" />
              Adjust USDT Balance
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBalanceSubmit} className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Adjusting the wallet balance for <span className="font-semibold text-foreground">{balanceUser?.displayName}</span>.
              This does not change authentication, sessions, or other account operations.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['credit', 'debit'] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => setBalanceDirection(direction)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold capitalize transition ${
                    balanceDirection === direction
                      ? direction === 'credit'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                      : 'border-border text-muted-foreground hover:bg-muted/20'
                  }`}
                >
                  {direction === 'credit' ? 'Add balance' : 'Deduct balance'}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium">
              Amount (USDT)
              <input
                type="number"
                min="0.00000001"
                max="1000000000"
                step="0.00000001"
                required
                value={balanceAmount}
                onChange={(event) => setBalanceAmount(event.target.value)}
                placeholder="0.00"
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block text-sm font-medium">
              Adjustment reason
              <textarea
                required
                minLength={3}
                maxLength={200}
                value={balanceReason}
                onChange={(event) => setBalanceReason(event.target.value)}
                placeholder="Enter the reason for this balance adjustment"
                className="mt-2 min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Deductions cannot exceed the user’s available USDT after active trade reservations.
            </p>
            {balanceError && (
              <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300" role="alert">
                {balanceError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeBalanceDialog} disabled={adjustBalance.isPending} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted/20 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={adjustBalance.isPending || !balanceAmount || balanceReason.trim().length < 3} className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${balanceDirection === 'credit' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
                {adjustBalance.isPending ? 'Applying…' : balanceDirection === 'credit' ? 'Add USDT' : 'Deduct USDT'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {selectedUserId && (
        <UserDetailDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
}
