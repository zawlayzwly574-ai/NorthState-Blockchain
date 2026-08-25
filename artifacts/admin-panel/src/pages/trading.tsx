import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, BarChart3, ShieldAlert, Trophy, Clock } from 'lucide-react';
import {
  useAdminTrades,
  useAdminTradingStats,
  useSetTradeOutcome,
  type AdminTrade,
} from '@/lib/api';

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtTimeframe(secs: number) {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}D`;
}

function CountdownCell({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => setSecs(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [expiresAt]);
  if (secs <= 0) return <span className="font-mono text-xs text-muted-foreground">Expired</span>;
  const urgent = secs < 15;
  return (
    <span className={`font-mono text-xs font-bold tabular-nums ${urgent ? 'text-red-400 animate-pulse' : 'text-muted-foreground'}`}>
      {secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}
    </span>
  );
}

function StatusBadge({ trade }: { trade: AdminTrade }) {
  if (trade.status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />LIVE
      </span>
    );
  }
  if (trade.result === 'win') {
    return <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-400">WIN</span>;
  }
  return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">LOSS</span>;
}

export default function TradingControl() {
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const overridePending = useRef<Set<number>>(new Set());

  const { data: trades = [], isLoading, refetch } = useAdminTrades();
  const { data: stats } = useAdminTradingStats();
  const overrideMut = useSetTradeOutcome();

  const activeTrades = trades.filter(t => t.status === 'active');
  const displayTrades = tab === 'active' ? activeTrades : trades;

  const handleOverride = async (id: number, outcome: 'win' | 'loss') => {
    if (overridePending.current.has(id)) return;
    overridePending.current.add(id);
    try {
      await overrideMut.mutateAsync({ id, outcome });
      await refetch();
    } finally {
      overridePending.current.delete(id);
    }
  };

  const statCards = [
    { label: 'Total Trades', value: stats?.totalTrades ?? 0, icon: BarChart3, color: '' },
    { label: 'Active Now', value: stats?.activeTrades ?? 0, icon: Clock, color: 'text-primary', border: 'border-primary/25' },
    { label: 'Total Wins', value: stats?.wins ?? 0, icon: Trophy, color: 'text-green-400' },
    { label: 'Total Losses', value: stats?.losses ?? 0, icon: ShieldAlert, color: 'text-red-400' },
    { label: 'Volume', value: stats ? `$${Number(stats.totalVolume).toFixed(0)}` : '—', icon: TrendingUp, color: 'text-muted-foreground' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Trading Control</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Monitor all active user trades and manually override outcomes in real time.
        Overrides settle immediately and update the user's balance.
      </p>

      {/* ── Stats ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(s => (
          <div key={s.label} className={`rounded-xl border bg-card p-4 ${s.border ?? 'border-border'}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <s.icon className={`h-4 w-4 ${s.color || 'text-muted-foreground'}`} />
            </div>
            <p className={`mt-2 font-mono text-2xl font-extrabold ${s.color}`}>
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {[
            { id: 'active', label: `Live Trades (${activeTrades.length})` },
            { id: 'all', label: `All History (${trades.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'active' | 'all')}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeTrades.length > 0 && tab === 'active' && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Live — refreshes every 5s
          </span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Asset</th>
                <th className="px-4 py-3 text-right">Stake</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Entry</th>
                <th className="px-4 py-3 text-center">TF</th>
                <th className="px-4 py-3 text-center">Expires / Age</th>
                <th className="px-4 py-3 text-center">Admin Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-xs text-muted-foreground">
                    Loading trades…
                  </td>
                </tr>
              ) : displayTrades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-xs text-muted-foreground">
                    {tab === 'active' ? 'No active trades right now' : 'No trades recorded yet'}
                  </td>
                </tr>
              ) : (
                displayTrades.map((trade: AdminTrade) => (
                  <tr key={trade.id} className={`transition hover:bg-white/3 ${trade.status === 'active' ? 'bg-primary/3' : ''}`}>
                    {/* User */}
                    <td className="px-4 py-3">
                      <p className="font-semibold leading-none">{trade.displayName || 'Unknown'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{trade.email}</p>
                    </td>

                    {/* Asset + direction */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {trade.direction === 'long'
                          ? <TrendingUp size={14} className="shrink-0 text-green-400" />
                          : <TrendingDown size={14} className="shrink-0 text-red-400" />}
                        <span className="font-mono font-bold">{trade.asset}</span>
                        <span className={`text-[10px] font-extrabold ${trade.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.direction.toUpperCase()}
                        </span>
                      </div>
                    </td>

                    {/* Stake */}
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      ${Number(trade.amount).toFixed(2)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <StatusBadge trade={trade} />
                    </td>

                    {/* Entry price */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      ${Number(trade.entryPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>

                    {/* Timeframe */}
                    <td className="px-4 py-3 text-center font-mono text-xs">
                      {fmtTimeframe(trade.timeframeSecs)}
                    </td>

                    {/* Countdown / age */}
                    <td className="px-4 py-3 text-center">
                      {trade.status === 'active'
                        ? <CountdownCell expiresAt={trade.expiresAt} />
                        : <span className="text-xs text-muted-foreground">{formatRelative(trade.settledAt ?? trade.createdAt)}</span>}
                    </td>

                    {/* Override buttons */}
                    <td className="px-4 py-3">
                      {trade.status === 'active' ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOverride(trade.id, 'win')}
                            disabled={overrideMut.isPending}
                            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-extrabold transition active:scale-95 ${
                              trade.adminOverride === 'win'
                                ? 'bg-green-500/35 text-green-300 ring-1 ring-green-500/60'
                                : 'bg-green-500/10 text-green-400 hover:bg-green-500/25 hover:text-green-300'
                            }`}
                            data-testid={`btn-win-${trade.id}`}
                          >
                            <Trophy size={11} />WIN
                          </button>
                          <button
                            onClick={() => handleOverride(trade.id, 'loss')}
                            disabled={overrideMut.isPending}
                            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-extrabold transition active:scale-95 ${
                              trade.adminOverride === 'loss'
                                ? 'bg-red-500/35 text-red-300 ring-1 ring-red-500/60'
                                : 'bg-red-500/10 text-red-400 hover:bg-red-500/25 hover:text-red-300'
                            }`}
                            data-testid={`btn-loss-${trade.id}`}
                          >
                            <ShieldAlert size={11} />LOSS
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          {trade.adminOverride ? (
                            <span className={`text-[10px] font-bold ${trade.adminOverride === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                              Forced {trade.adminOverride.toUpperCase()}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50">Auto</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
