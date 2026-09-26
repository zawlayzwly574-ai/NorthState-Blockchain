import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, RefreshCw, X } from 'lucide-react';
import {
  useCloseFuturesPosition,
  getGetFuturesPositionsQueryKey,
  getGetTradingAccountQueryKey,
  getGetPortfolioQueryKey,
} from '@workspace/api-client-react';
import type { FuturesPosition } from '@workspace/api-client-react';

export function futuresErrorMessage(error: unknown, fallback: string) {
  const response = error as { data?: { error?: string; message?: string }; message?: string } | null;
  return response?.data?.error || response?.data?.message || response?.message || fallback;
}

function price(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
}

function money(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FuturesPositions({
  positions,
  isLoading,
  error,
  onRetry,
}: {
  positions: FuturesPosition[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const qc = useQueryClient();
  const closePosition = useCloseFuturesPosition();
  const [closingId, setClosingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'error' | 'success' } | null>(null);
  const active = positions?.filter(position => position.status === 'active') ?? [];

  const handleClose = async (position: FuturesPosition) => {
    if (closingId !== null || position.markPrice === null || position.unrealizedPnl === null) return;
    setClosingId(position.id);
    setNotice(null);
    try {
      const result = await closePosition.mutateAsync({ positionId: position.id });
      setConfirmId(null);
      setNotice({
        kind: 'success',
        text: `${result.asset} ${result.direction} position closed${result.realizedPnl === null ? '.' : ` · Realized PnL ${result.realizedPnl >= 0 ? '+' : '-'}${money(Math.abs(result.realizedPnl))}.`}`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetFuturesPositionsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetTradingAccountQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetPortfolioQueryKey() }),
      ]);
    } catch (cause) {
      setNotice({ kind: 'error', text: futuresErrorMessage(cause, 'Could not close this position. Please try again.') });
      setConfirmId(null);
    } finally {
      setClosingId(null);
    }
  };

  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-primary/25 bg-card" aria-labelledby="futures-positions-title" data-testid="section-futures-positions">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.17em] text-primary">Futures · USDT Perpetual</p>
          <h3 id="futures-positions-title" className="mt-1 text-base font-extrabold tracking-tight">My Positions <span className="ml-1 font-mono text-xs text-muted-foreground">{!isLoading && !error ? `(${active.length})` : ''}</span></h3>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><RefreshCw size={11} /> Updates every 3s</span>
      </div>

      {notice && (
        <div className={`mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs font-semibold sm:mx-5 ${notice.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-green-500/30 bg-green-500/10 text-green-300'}`} role={notice.kind === 'error' ? 'alert' : 'status'} data-testid="status-futures-close">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" data-testid="button-dismiss-futures-close"><X size={14} /></button>
        </div>
      )}

      {isLoading && !positions ? (
        <div className="space-y-3 p-4 sm:p-5" aria-label="Loading futures positions" data-testid="status-futures-positions-loading">
          {[0, 1].map(item => <div key={item} className="h-36 animate-pulse rounded-xl bg-secondary/60" />)}
        </div>
      ) : error ? (
        <div className="px-5 py-9 text-center" role="alert" data-testid="status-futures-positions-error">
          <AlertCircle size={22} className="mx-auto text-amber-400" />
          <p className="mt-3 text-sm font-bold">Positions could not be refreshed</p>
          <p className="mt-1 text-xs text-muted-foreground">{futuresErrorMessage(error, 'Please check your connection and retry.')}</p>
          <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-primary/40 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/10" data-testid="button-retry-futures-positions">Retry positions</button>
        </div>
      ) : active.length === 0 ? (
        <div className="px-5 py-10 text-center" data-testid="status-futures-positions-empty">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><ArrowUpRight size={19} /></div>
          <p className="mt-3 text-sm font-bold">No open futures positions</p>
          <p className="mt-1 text-xs text-muted-foreground">Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.</p>
        </div>
      ) : (
        <div className="space-y-2.5 p-3 sm:p-4">
          {active.map(position => {
            const quoted = position.markPrice !== null && position.unrealizedPnl !== null;
            return (
              <article key={position.id} className="rounded-xl border border-border/70 bg-secondary/20 p-3.5 sm:p-4" data-testid={`card-futures-position-${position.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-[10px] font-extrabold uppercase ${position.direction === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>{position.direction}</span>
                    <span className="text-sm font-extrabold">{position.asset}/USDT</span>
                    <span className="rounded-md bg-primary/10 px-1.5 py-1 font-mono text-[10px] font-bold text-primary">{position.leverage}x</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">#{position.id} · {new Date(position.openedAt).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-3 sm:grid-cols-4">
                  <div><p className="text-[10px] text-muted-foreground">Entry price</p><p className="mt-1 font-mono text-xs font-bold" data-testid={`text-futures-entry-${position.id}`}>{price(position.entryPrice)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Live mark</p><p className="mt-1 font-mono text-xs font-bold" data-testid={`text-futures-mark-${position.id}`}>{position.markPrice === null ? 'Unavailable' : price(position.markPrice)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Margin</p><p className="mt-1 font-mono text-xs font-bold" data-testid={`text-futures-margin-${position.id}`}>{money(position.margin)} USDT</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Unrealized PnL</p><p className={`mt-1 font-mono text-xs font-bold ${position.unrealizedPnl === null ? 'text-muted-foreground' : position.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid={`text-futures-pnl-${position.id}`}>{position.unrealizedPnl === null ? 'Unavailable' : `${position.unrealizedPnl >= 0 ? '+' : '-'}${money(Math.abs(position.unrealizedPnl))}`}</p></div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <p className="text-[10px] text-muted-foreground" data-testid={`status-futures-quote-${position.id}`}>
                    {quoted ? `Quote updated ${position.quoteUpdatedAt ? new Date(position.quoteUpdatedAt).toLocaleString() : 'recently'}` : 'No live quote available. Closing is disabled until the market can be priced.'}
                  </p>
                  {confirmId === position.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-300">Close at the next available market quote?</span>
                      <button type="button" disabled={closingId !== null || !quoted} onClick={() => handleClose(position)} className="rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-confirm-close-futures-${position.id}`}>{closingId === position.id ? 'Closing…' : 'Confirm close'}</button>
                      <button type="button" disabled={closingId !== null} onClick={() => setConfirmId(null)} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold disabled:opacity-50" data-testid={`button-cancel-close-futures-${position.id}`}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" disabled={!quoted || closingId !== null} onClick={() => setConfirmId(position.id)} title={!quoted ? 'No live quote available. Closing is disabled.' : undefined} className="rounded-lg border border-primary/40 px-3 py-2 text-[11px] font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground" data-testid={`button-close-futures-${position.id}`}>Close Position</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}