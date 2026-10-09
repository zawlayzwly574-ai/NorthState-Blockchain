// ─── Trading & Futures Module ─────────────────────────────────────────────────
// Trades settle against the same USDT wallet balance shown on Overview.

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, ChevronUp, ChevronDown, Clock, Trophy, AlertCircle, Zap, X } from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, YAxis, ReferenceLine, Tooltip,
} from 'recharts';
import {
  useGetTradingAccount,
  useGetPortfolio,
  useGetTrades,
  usePlaceTrade,
  useGetMarketSummary,
  getGetMarketSummaryQueryKey,
  getGetTradingAccountQueryKey,
  getGetTradesQueryKey,
  getGetPortfolioQueryKey,
} from '@workspace/api-client-react';
import type { Trade } from '@workspace/api-client-react';
import {
  useGetFuturesPositions,
  useGetFuturesQuote,
  useGetTradingChart,
  useOpenFuturesPosition,
  getGetFuturesPositionsQueryKey,
  getGetFuturesQuoteQueryKey,
  getGetTradingChartQueryKey,
} from '@workspace/api-client-react';
import type { FuturesPositionInputLeverage } from '@workspace/api-client-react';
import { FuturesPositions, futuresErrorMessage } from './FuturesPositions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

// ─── Config ───────────────────────────────────────────────────────────────────

const TIMEFRAMES = [
  { label: '60s', secs: 60 },
  { label: '90s', secs: 90 },
  { label: '2m',  secs: 120 },
  { label: '3m',  secs: 180 },
  { label: '5m',  secs: 300 },
  { label: '15m', secs: 900 },
  { label: '30m', secs: 1800 },
  { label: '1h',  secs: 3600 },
  { label: '24h', secs: 86400 },
  { label: '72h', secs: 259200 },
  { label: '10D', secs: 864000 },
  { label: '15D', secs: 1296000 },
  { label: '30D', secs: 2592000 },
];

// ─── Per-asset minimum trade amount (USDT) — mirrors the backend enforcement ──
const ASSET_MIN_TRADE: Record<string, number> = {
  GOLD: 30000,
  BTC: 5000,
  ETH: 1000,
  BNB: 1000,
  SOL: 1000,
};
const DEFAULT_MIN_TRADE = 10000;
function minTradeAmountFor(asset: string): number {
  return ASSET_MIN_TRADE[asset] ?? DEFAULT_MIN_TRADE;
}

// ─── Fixed payout rates per asset — mirrors the backend ────────────────────────
const ASSET_PAYOUT_RATE: Record<string, number> = {
  BTC: 0.30,
  ETH: 0.20, BNB: 0.20, SOL: 0.20, XRP: 0.20,
};
const DEFAULT_PAYOUT_RATE = 0.10;

// ─── GOLD investment tiers (amount range → fixed payout %) — mirrors backend ──
const GOLD_TIERS = [
  { label: '30K–99K', min: 30_000, max: 99_000, payout: 0.50 },
  { label: '100K–200K', min: 100_000, max: 200_000, payout: 0.60 },
  { label: '500K–1M', min: 500_000, max: 1_000_000, payout: 0.70 },
  { label: '2M–5M', min: 2_000_000, max: 5_000_000, payout: 0.80 },
  { label: '6M–10M', min: 6_000_000, max: 10_000_000, payout: 0.95 },
] as const;

function resolveGoldPayoutRate(amount: number): number {
  const exact = GOLD_TIERS.find(t => amount >= t.min && amount <= t.max);
  if (exact) return exact.payout;
  const applicable = [...GOLD_TIERS].reverse().find(t => amount >= t.min);
  return applicable?.payout ?? GOLD_TIERS[0].payout;
}

function payoutRateFor(asset: string, amount: number): number {
  if (asset === 'GOLD') return resolveGoldPayoutRate(amount);
  return ASSET_PAYOUT_RATE[asset] ?? DEFAULT_PAYOUT_RATE;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriceChart({
  quote,
  history,
  entryPrice,
}: {
  quote: { price: number | null; updatedAt: string | null } | undefined;
  history: { t: number; price: number }[] | undefined;
  entryPrice?: number;
}) {
  const [data, setData] = useState<{ t: number; price: number }[]>([]);

  useEffect(() => {
    if (!history?.length) return;
    setData(prev => {
      const points = new Map([...history, ...prev].map(point => [point.t, point]));
      return [...points.values()].sort((a, b) => a.t - b.t).slice(-80);
    });
  }, [history]);

  // Add only provider-timestamped ticks; chart lines never use generated prices.
  useEffect(() => {
    const time = Date.parse(quote?.updatedAt ?? '');
    if (!quote?.price || !Number.isFinite(time) || Date.now() - time > 15_000 || time > Date.now() + 2_000) return;
    setData(prev => {
      if (prev.length && prev[prev.length - 1].t >= time) return prev;
      if (!prev.length) return [{ t: time, price: quote.price! }];
      return [...prev.slice(-79), { t: time, price: quote.price! }];
    });
  }, [quote?.price, quote?.updatedAt]);

  const prices = data.map(d => d.price);
  const lo = prices.length ? Math.min(...prices) * 0.9992 : 0;
  const hi = prices.length ? Math.max(...prices) * 1.0008 : 1;
  const quoteTimestamp = Date.parse(quote?.updatedAt ?? '');
  const live = !!quote?.price && Number.isFinite(quoteTimestamp)
    && Date.now() - quoteTimestamp <= 15_000 && quoteTimestamp <= Date.now() + 2_000;
  const current = live ? quote!.price! : null;
  const lastChartPrice = data[data.length - 1]?.price ?? 0;
  const first = data[0]?.price ?? lastChartPrice;
  const isUp = lastChartPrice >= first;
  const stroke = isUp ? '#22c55e' : '#ef4444';

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-2 z-10 flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-extrabold tracking-tight" style={{ color: stroke }} data-testid="text-live-chart-price">
          {current === null ? 'Live quote unavailable' : `${current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`}
        </span>
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${live ? (isUp ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400') : 'bg-secondary text-muted-foreground'}`} data-testid="status-live-chart">
          {live ? `${isUp ? '▲' : '▼'} LIVE` : 'WAITING FOR LIVE TICK'}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 36, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[lo, hi]} hide />
          <Tooltip
            content={() => null}
            cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '3 2' }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={stroke}
            strokeWidth={1.8}
            fill="url(#tg)"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          {entryPrice && (
            <ReferenceLine
              y={entryPrice}
              stroke="hsl(var(--primary))"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: 'ENTRY',
                position: 'insideTopRight',
                fill: 'hsl(var(--primary))',
                fontSize: 9,
                fontWeight: 700,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const expiresAtMs = Date.parse(expiresAt);
    const tick = () => setSecs(
      Number.isFinite(expiresAtMs)
        ? Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
        : 0,
    );
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [expiresAt]);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const urgent = secs <= 10;
  return (
    <span className={`font-mono text-xs font-bold tabular-nums ${urgent ? 'text-red-400 animate-pulse' : 'text-muted-foreground'}`}>
      {secs >= 3600
        ? `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
        : secs >= 60
        ? `${m}m ${String(s).padStart(2, '0')}s`
        : `${secs}s`}
    </span>
  );
}

function TimeframeSheet({
  value,
  onChange,
  onClose,
}: {
  value: number;
  onChange: (secs: number) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-border bg-[hsl(222_10%_8%)] px-5 pb-10 pt-5">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <p className="mb-4 text-center text-sm font-bold tracking-tight">Select Timeframe</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.secs}
              type="button"
              onClick={() => { onChange(tf.secs); onClose(); }}
              className={`rounded-xl py-3 text-sm font-bold transition active:scale-95 ${
                value === tf.secs
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_16px_hsl(var(--primary)/.35)]'
                  : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl py-3 text-sm text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function formatTradeTimestamp(timestamp: string | null | undefined) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatTradePrice(price: number | null | undefined) {
  if (price === null || price === undefined || !Number.isFinite(price)) return '—';
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

function TradeDetailModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const result = trade.result ?? (trade.status === 'completed' ? 'pending' : trade.status);
  const direction = trade.direction === 'long' ? 'Buy Long' : 'Sell Short';
  const netProfitLoss = trade.payout ?? (
    result === 'win'
      ? trade.amount * trade.payoutRate
      : result === 'loss'
        ? -trade.amount
        : null
  );
  const resultLabel = result.charAt(0).toUpperCase() + result.slice(1);
  const resultTone = result === 'win'
    ? 'text-green-400'
    : result === 'loss'
      ? 'text-red-400'
      : 'text-muted-foreground';

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-4 top-1/2 z-50 max-h-[calc(100dvh-2rem)] -translate-y-1/2 overflow-y-auto rounded-3xl border border-border bg-[hsl(222_10%_8%)] p-5 shadow-2xl sm:left-1/2 sm:right-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-detail-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trade Details</p>
            <h2 id="trade-detail-title" className="mt-1 text-xl font-extrabold tracking-tight">
              {trade.asset}/USD
            </h2>
            <p className={`mt-1 text-sm font-bold ${trade.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
              {direction}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/70 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Close trade details"
            data-testid="button-close-trade-details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1 rounded-2xl bg-secondary/25 p-3">
          <div className="flex items-center justify-between gap-4 border-b border-border/50 px-1 py-3">
            <span className="text-xs text-muted-foreground">Entry Time (Started)</span>
            <time className="text-right text-xs font-bold" dateTime={trade.createdAt}>
              {formatTradeTimestamp(trade.createdAt)}
            </time>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border/50 px-1 py-3">
            <span className="text-xs text-muted-foreground">Expiry / Closed Time</span>
            <time className="text-right text-xs font-bold" dateTime={trade.settledAt ?? trade.expiresAt}>
              {formatTradeTimestamp(trade.settledAt ?? trade.expiresAt)}
            </time>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border/50 px-1 py-3">
            <span className="text-xs text-muted-foreground">Invested Amount</span>
            <span className="font-mono text-sm font-bold">${trade.amount.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border/50 px-1 py-3">
            <span className="text-xs text-muted-foreground">Payout Rate</span>
            <span className="font-mono text-sm font-bold">{(trade.payoutRate * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border/50 px-1 py-3">
            <span className="text-xs text-muted-foreground">Open Price</span>
            <span className="font-mono text-sm font-bold">${formatTradePrice(trade.entryPrice)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-border/50 px-1 py-3">
            <span className="text-xs text-muted-foreground">Close Price</span>
            <span className="font-mono text-sm font-bold">
              {trade.exitPrice === null || trade.exitPrice === undefined ? '—' : `$${formatTradePrice(trade.exitPrice)}`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-1 py-3">
            <span className="text-xs text-muted-foreground">Status</span>
            <span className={`rounded-full bg-secondary px-2.5 py-1 text-[10px] font-extrabold uppercase ${resultTone}`}>
              {resultLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/25 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Net Profit / Loss</span>
          <span className={`font-mono text-lg font-extrabold ${resultTone}`}>
            {netProfitLoss === null
              ? '—'
              : `${netProfitLoss >= 0 ? '+' : '-'}$${Math.abs(netProfitLoss).toFixed(2)}`}
          </span>
        </div>
      </div>
    </>
  );
}

interface ActiveSpotTradeSnapshot {
  id: number;
  asset: string;
  direction: 'long' | 'short';
  amount: number;
  timeframeSecs: number;
  entryPrice: number;
  expiresAt: string;
  payoutRate: number;
}

function ActiveTradeStatusModal({
  trade,
  currentPrice,
  settledTrade,
  onClose,
}: {
  trade: ActiveSpotTradeSnapshot;
  currentPrice: number | null;
  settledTrade?: Trade;
  onClose: () => void;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const expiresAtMs = Date.parse(trade.expiresAt);
  const remainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - now) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const durationMs = trade.timeframeSecs * 1000;
  const progress = durationMs > 0 ? Math.min(1, remainingMs / durationMs) : 0;
  const circumference = 2 * Math.PI * 50;
  const isSettled = settledTrade?.status === 'completed';
  const realizedProfitLoss = settledTrade?.status === 'completed'
    ? settledTrade.payout ?? (
      settledTrade.result === 'win'
        ? trade.amount * trade.payoutRate
        : settledTrade.result === 'loss'
          ? -trade.amount
          : null
    )
    : null;
  const directionLabel = trade.direction === 'long'
    ? 'Bullish · Buy / Long'
    : 'Bearish · Sell / Short';
  const statusLabel = settledTrade?.status === 'completed'
    ? settledTrade.result === 'win'
      ? 'Won'
      : settledTrade.result === 'loss'
        ? 'Lost'
        : 'Completed'
    : remainingSeconds > 0
      ? 'Active'
      : 'Awaiting settlement';
  const amount = trade.amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const potentialProfit = (trade.amount * trade.payoutRate).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const potentialLoss = trade.amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-md gap-0 overflow-hidden rounded-3xl border border-amber-400/15 bg-[#191919] p-0 text-foreground shadow-[0_24px_90px_rgba(0,0,0,.7)] [&>button]:right-4 [&>button]:top-4 [&>button]:rounded-full [&>button]:p-2 [&>button]:text-primary [&>button]:opacity-100 [&>button]:hover:bg-amber-400/10"
        data-testid="modal-active-trade-status"
      >
        <div className="px-5 pb-6 pt-6 sm:px-7">
          <div className="flex items-start justify-between gap-10">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-300/70">
                Spot trade status
              </p>
              <DialogTitle className="mt-1 text-xl font-extrabold tracking-tight text-foreground" data-testid="text-trade-pair">
                {trade.asset}/USDT
              </DialogTitle>
              <DialogDescription className="sr-only">
                Live status and countdown for your active spot trade.
              </DialogDescription>
            </div>
            <span className={`mt-1 shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
              isSettled
                ? settledTrade?.result === 'win'
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                  : 'border-rose-400/25 bg-rose-400/10 text-rose-300'
                : 'border-amber-400/25 bg-amber-400/10 text-amber-200'
            }`} data-testid="status-active-trade">
              {statusLabel}
            </span>
          </div>

          <div className="flex justify-center py-6">
            <div className="relative grid h-44 w-44 place-items-center" role="timer" aria-label={`${remainingSeconds} seconds remaining`}>
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#f5c542"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  className="transition-[stroke-dashoffset] duration-300 ease-linear"
                  data-testid="progress-trade-countdown"
                />
              </svg>
              <span className="font-mono text-2xl font-extrabold tabular-nums text-foreground" data-testid="text-trade-countdown">
                {remainingSeconds}s
              </span>
            </div>
          </div>

          <dl className="divide-y divide-white/[0.07] rounded-2xl border border-white/[0.05] bg-white/[0.025] px-4">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-muted-foreground">Direction</dt>
              <dd className={`text-right text-sm font-bold ${trade.direction === 'long' ? 'text-emerald-300' : 'text-rose-300'}`} data-testid="text-trade-direction">
                {directionLabel}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-muted-foreground">Purchase Amount</dt>
              <dd className="font-mono text-sm font-bold tabular-nums" data-testid="text-trade-amount">
                {amount} USDT
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-muted-foreground">Current Price</dt>
              <dd className="font-mono text-sm font-bold tabular-nums" data-testid="text-trade-current-price">
                {currentPrice === null ? 'Waiting for quote' : `$${formatTradePrice(currentPrice)}`}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-muted-foreground">Purchase Price</dt>
              <dd className="font-mono text-sm font-bold tabular-nums" data-testid="text-trade-purchase-price">
                ${formatTradePrice(trade.entryPrice)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="pt-0.5 text-sm text-muted-foreground">
                {isSettled ? 'Realized Profit / Loss' : 'Expected Profit / Loss'}
              </dt>
              {isSettled ? (
                <dd className={`text-right font-mono text-sm font-extrabold tabular-nums ${
                  (realizedProfitLoss ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`} data-testid="text-trade-profit-loss">
                  {realizedProfitLoss === null
                    ? '—'
                    : `${realizedProfitLoss >= 0 ? '+' : '-'}${Math.abs(realizedProfitLoss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
                </dd>
              ) : (
                <dd className="space-y-1 text-right font-mono text-xs font-bold tabular-nums" data-testid="text-trade-profit-loss">
                  <span className="block text-emerald-300">+{potentialProfit} USDT if correct</span>
                  <span className="block text-rose-300">−{potentialLoss} USDT if incorrect</span>
                </dd>
              )}
            </div>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Trading Page ────────────────────────────────────────────────────────

export function TradingPage() {
  const [asset, setAsset] = useState('BTC');
  const [amount, setAmount] = useState(String(minTradeAmountFor('BTC')));
  const [goldTierIndex, setGoldTierIndex] = useState(0);
  const [timeframeSecs, setTimeframeSecs] = useState(60);
  const [showPicker, setShowPicker] = useState(false);
  const [showFutures, setShowFutures] = useState(false);
  const [futuresContractType, setFuturesContractType] = useState<'Perpetual' | 'Quarterly'>('Perpetual');
  const [futuresSettlement, setFuturesSettlement] = useState<'USDT' | 'USDC'>('USDT');
  const [futuresDirection, setFuturesDirection] = useState<'long' | 'short'>('long');
  const [futuresMargin, setFuturesMargin] = useState('1000');
  const [futuresLeverage, setFuturesLeverage] = useState<FuturesPositionInputLeverage>(20);
  const [futuresNotice, setFuturesNotice] = useState<{ text: string; kind: 'error' | 'success' } | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<{ msg: string; type: 'win' | 'loss' } | null>(null);
  const [tradeError, setTradeError] = useState('');
  const [activeSpotTrade, setActiveSpotTrade] = useState<ActiveSpotTradeSnapshot | null>(null);
  const qc = useQueryClient();

  const { data: market = [] } = useGetMarketSummary({ query: { queryKey: getGetMarketSummaryQueryKey(), refetchInterval: 3_000, placeholderData: (prev) => prev } });
  const { data: account, isLoading: accountLoading, error: accountError, refetch: refetchAccount } = useGetTradingAccount({ query: { queryKey: getGetTradingAccountQueryKey(), refetchInterval: 5_000 } });
  const { data: portfolio } = useGetPortfolio({ query: { queryKey: getGetPortfolioQueryKey(), refetchInterval: 5_000 } });
  const { data: tradesData, error: tradesError, refetch: refetchTrades } = useGetTrades({
    query: { queryKey: getGetTradesQueryKey(), refetchInterval: 3_000 },
  });
  const trades = tradesData ?? [];
  const placeTradeHook = usePlaceTrade();
  const { data: futuresPositions, isLoading: futuresPositionsLoading, error: futuresPositionsError, refetch: refetchFuturesPositions } = useGetFuturesPositions({
    query: { queryKey: getGetFuturesPositionsQueryKey(), refetchInterval: 3_000 },
  });
  const openFuturesPosition = useOpenFuturesPosition();
  const { data: futuresQuote, error: futuresQuoteError, refetch: refetchFuturesQuote } = useGetFuturesQuote(asset, {
    query: { queryKey: getGetFuturesQuoteQueryKey(asset), refetchInterval: 1_000, staleTime: 0, placeholderData: (previous) => previous },
  });
  const { data: tradingHistory, error: tradingHistoryError, refetch: refetchTradingHistory } = useGetTradingChart(asset, {
    query: { queryKey: getGetTradingChartQueryKey(asset), refetchInterval: 1_000, staleTime: 0, placeholderData: (previous) => previous },
  });

  const quoteTime = Date.parse(futuresQuote?.updatedAt ?? '');
  const freshFuturesQuote = !!futuresQuote?.price && !!futuresQuote.updatedAt
    && Number.isFinite(quoteTime) && Date.now() - quoteTime <= 15_000
    && quoteTime <= Date.now() + 2_000;
  // Spot and Futures orders both use the same fresh, source-timestamped quote.
  const currentPrice = freshFuturesQuote ? futuresQuote!.price! : null;

  const activeTrades = trades.filter(t => t.status === 'active');
  const history = trades.filter(t => t.status === 'completed').slice(0, 12);
  const selectedTrade = selectedTradeId === null
    ? null
    : trades.find(trade => trade.id === selectedTradeId) ?? null;
  const assetActiveTrade = activeTrades.find(t => t.asset === asset);
  const entryPrice = assetActiveTrade ? Number(assetActiveTrade.entryPrice) : undefined;

  const isGold = asset === 'GOLD';
  const minTrade = minTradeAmountFor(asset);
  const tradeAmt = Math.max(1, Number(amount) || 0);
  const payoutRate = payoutRateFor(asset, tradeAmt);
  const potentialProfit = Math.floor(tradeAmt * payoutRate);
  const timeframeLabel = TIMEFRAMES.find(tf => tf.secs === timeframeSecs)?.label ?? '60s';
  const balance = Number(account?.balance ?? 0);
  const reservedBalance = activeTrades.reduce((total, trade) => total + Number(trade.amount), 0);
  const availableToTrade = Math.max(0, balance - reservedBalance);
  const futuresTotal = Number(account?.futuresBalance ?? 0);
  const futuresReserved = (futuresPositions ?? []).filter(position => position.status === 'active').reduce((total, position) => total + Number(position.margin), 0);
  const futuresAvailable = Math.max(0, futuresTotal - futuresReserved);
  const marginValue = Number(futuresMargin);
  const validFuturesMargin = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/.test(futuresMargin) && Number.isFinite(marginValue) && marginValue >= 1 && marginValue <= 10_000_000 && marginValue <= futuresAvailable;
  const supportedFuturesMode = futuresContractType === 'Perpetual' && futuresSettlement === 'USDT';
  const canOpenFutures = supportedFuturesMode && validFuturesMargin && freshFuturesQuote && !!account && !accountError && !!futuresPositions && !futuresPositionsError && !openFuturesPosition.isPending;
  const belowMinTrade = tradeAmt < minTrade;
  const balanceBelowMin = !!account && balance < minTrade;
  const insufficient = !!account && (tradeAmt > availableToTrade || belowMinTrade || balanceBelowMin);
  const winRate = account?.totalTrades
    ? Math.round(((account.wins ?? 0) / account.totalTrades) * 100)
    : null;

  // All market coins plus GOLD, so every coin on the market page is tradable here.
  const tradingAssets = ['GOLD', ...market.map(m => m.symbol).filter(s => s !== 'GOLD')];

  const triggerFlash = (msg: string, type: 'win' | 'loss') => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 2500);
  };

  const handleTrade = async (direction: 'long' | 'short') => {
    if (placing || !account || accountError || !tradesData || tradesError || !currentPrice || insufficient) return;
    setPlacing(true);
    setTradeError('');
    try {
      const placedTrade = await placeTradeHook.mutateAsync({
        data: { asset, direction, amount: tradeAmt, timeframeSecs },
      });
      setActiveSpotTrade({
        id: placedTrade.tradeId,
        asset,
        direction,
        amount: tradeAmt,
        timeframeSecs,
        entryPrice: placedTrade.entryPrice,
        expiresAt: placedTrade.expiresAt,
        payoutRate,
      });
      await refetchTrades();
      qc.invalidateQueries({ queryKey: getGetTradingAccountQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
    } catch (error) {
      const apiError = error as { data?: { error?: string }; message?: string };
      setTradeError(apiError.data?.error || apiError.message || 'The trade could not be placed. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  const handleOpenFutures = async () => {
    if (!canOpenFutures) return;
    setFuturesNotice(null);
    try {
      const position = await openFuturesPosition.mutateAsync({
        data: { asset, direction: futuresDirection, margin: futuresMargin, leverage: futuresLeverage, contractType: 'Perpetual', settlement: 'USDT' },
      });
      setFuturesNotice({ kind: 'success', text: `${position.asset} ${position.direction} position #${position.id} opened at $${position.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}.` });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetFuturesPositionsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetTradingAccountQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetPortfolioQueryKey() }),
      ]);
    } catch (cause) {
      setFuturesNotice({ kind: 'error', text: futuresErrorMessage(cause, 'Could not open this position. Please try again.') });
    }
  };

  useEffect(() => {
    if (!showFutures) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowFutures(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showFutures]);

  // Flash result when a trade completes
  const prevActive = useRef<number[]>([]);
  useEffect(() => {
    const nowActive = activeTrades.map(t => t.id);
    const justCompleted = prevActive.current.filter(id => !nowActive.includes(id));
    if (justCompleted.length > 0) {
      qc.invalidateQueries({ queryKey: getGetTradingAccountQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
      const settled = trades.filter(t => justCompleted.includes(t.id));
      const wins = settled.filter(t => t.result === 'win');
      if (wins.length > 0) {
        triggerFlash(`+$${Math.round(Number(wins[0].amount) * Number(wins[0].payoutRate))} — WIN!`, 'win');
      } else if (settled.length > 0) {
        triggerFlash(`-$${Number(settled[0].amount).toFixed(0)} — LOSS`, 'loss');
      }
    }
    prevActive.current = nowActive;
  }, [activeTrades.length, trades]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Win/Loss flash overlay */}
      {flash && (
        <div className={`fixed inset-x-0 top-20 z-50 mx-auto w-fit rounded-2xl px-6 py-3 text-center text-sm font-extrabold shadow-2xl animate-in slide-in-from-top-4 fade-in ${
          flash.type === 'win'
            ? 'bg-green-500 text-white'
            : 'bg-destructive text-white'
        }`}>
          {flash.msg}
        </div>
      )}

      {/* ── Header row ── */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trading Balance</p>
          <p className="mt-0.5 font-mono text-xl font-extrabold">
            {account ? `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Win Rate</p>
            <p className={`mt-0.5 font-mono font-bold ${winRate !== null && winRate >= 50 ? 'text-green-400' : 'text-muted-foreground'}`}>
              {winRate !== null ? `${winRate}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {(accountError || tradesError) && (
        <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>
            Trading account or trade history could not be refreshed. Orders are disabled until the stored state is available.
            {account && ' The last successfully loaded account balance remains visible.'}
          </span>
          <div className="flex gap-2">
            {accountError && <button type="button" className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-secondary" onClick={() => void refetchAccount()} data-testid="button-retry-trading-account">Retry account</button>}
            {tradesError && <button type="button" className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-secondary" onClick={() => void refetchTrades()} data-testid="button-retry-trades">Retry trades</button>}
          </div>
        </div>
      )}
      {accountLoading && !account && (
        <p role="status" className="mb-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
          Loading your stored trading account…
        </p>
      )}

      {/* ── Deposit required banner (zero balance) ── */}
      {account && !accountError && balance === 0 && (
        <div className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-bold text-amber-300">No trading balance</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Make a deposit and wait for admin approval. Your approved deposit amount will automatically fund your trading account.
            </p>
          </div>
        </div>
      )}

      {/* ── Asset selector ── */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {tradingAssets.map(a => {
          const mkt = market.find(m => m.symbol === a);
          const chg = mkt?.change24h ?? 0;
          return (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAsset(a);
                setAmount(String(minTradeAmountFor(a)));
              }}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
                asset === a
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_hsl(var(--primary)/.3)]'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="block">{a}</span>
              {a === 'GOLD' ? (
                <span className={`block font-mono text-[9px] font-normal ${asset === a ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  up to 95%
                </span>
              ) : mkt && (
                <span className={`block font-mono text-[9px] font-normal ${chg >= 0 ? 'text-green-400' : 'text-red-400'} ${asset === a ? 'text-primary-foreground/70' : ''}`}>
                  {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Live Chart ── */}
      <div className="mb-3 overflow-hidden rounded-2xl border border-border/60 bg-card">
        <PriceChart key={asset} quote={futuresQuote} history={tradingHistory} entryPrice={entryPrice} />
      </div>
      {!freshFuturesQuote && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-xs text-amber-200" role="status" data-testid="status-spot-live-quote">
          <span>
            {futuresQuoteError || tradingHistoryError
              ? `Live market data for ${asset} could not be refreshed.`
              : `Waiting for a fresh, source-timestamped live quote for ${asset}.`}
            {" "}Spot and Futures orders remain paused until a real quote arrives.
          </span>
          <button
            type="button"
            onClick={() => { void refetchFuturesQuote(); void refetchTradingHistory(); }}
            className="rounded-lg border border-amber-400/40 px-3 py-1.5 font-bold transition hover:bg-amber-400/10"
            data-testid="button-retry-live-quote"
          >
            Retry live price
          </button>
        </div>
      )}

      {/* ── Order Panel ── */}
      <div className="mb-3">
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-wider text-primary">{asset}/USDT</p>
              <p className="mt-1 text-xs text-muted-foreground">Spot · fixed-expiry position</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFuturesNotice(null);
                setShowFutures(true);
              }}
              className="group relative overflow-hidden rounded-xl border border-primary/45 bg-gradient-to-r from-primary/15 via-primary/10 to-amber-500/15 px-3.5 py-2 text-xs font-extrabold text-primary shadow-[0_0_20px_hsl(var(--primary)/.12)] transition hover:border-primary/70 hover:shadow-[0_0_26px_hsl(var(--primary)/.22)] active:scale-[.98]"
              data-testid="button-open-futures-modal"
            >
              <span className="relative z-10 flex items-center gap-1.5">
                <Zap size={13} />
                Futures Trade
                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] tracking-wider">PRO</span>
              </span>
            </button>
          </div>

        {/* GOLD investment tier picker */}
        {isGold && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Investment Tier</label>
            <select
              value={goldTierIndex}
              onChange={e => {
                const idx = Number(e.target.value);
                setGoldTierIndex(idx);
                setAmount(String(GOLD_TIERS[idx].min));
              }}
              className="h-10 w-full rounded-xl border border-input bg-secondary/40 px-3 font-mono text-sm font-bold outline-none transition focus:border-primary"
              data-testid="select-gold-tier"
            >
              {GOLD_TIERS.map((tier, idx) => (
                <option key={tier.label} value={idx}>
                  {tier.label} USDT — {Math.round(tier.payout * 100)}% payout
                </option>
              ))}
            </select>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {GOLD_TIERS.map((tier, idx) => (
                <button
                  key={tier.label}
                  type="button"
                  onClick={() => { setGoldTierIndex(idx); setAmount(String(tier.min)); }}
                  className={`rounded-lg border py-2 text-[11px] font-bold transition ${
                    goldTierIndex === idx
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground hover:text-foreground'
                  }`}
                  title={`${tier.label} USDT`}
                >
                  {Math.round(tier.payout * 100)}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-bold text-muted-foreground">Trade Amount (USDT)</label>
            <span className="text-[11px] text-muted-foreground">
              Available: <span className="font-mono font-bold">{account && !accountError ? `$${availableToTrade.toFixed(0)}` : '—'}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={minTrade}
              step="1"
              className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-secondary/40 px-3 font-mono text-sm font-bold outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
              placeholder={String(minTrade)}
              data-testid="input-trade-amount"
            />
            {!isGold && (
              <div className="grid shrink-0 grid-cols-2 gap-2">
                {[minTrade, minTrade * 2, minTrade * 5, minTrade * 10].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className={`h-10 rounded-xl border px-2.5 text-[11px] font-bold transition hover:text-foreground ${
                      Number(amount) === v
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-border/60 text-muted-foreground'
                    }`}
                  >
                    {v >= 1000 ? `${v / 1000}K` : v}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Minimum trade &amp; balance for {asset}: <span className="font-mono font-bold text-foreground">${minTrade.toLocaleString()}</span>
          </p>
          {belowMinTrade && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-destructive">
              <AlertCircle size={12} />Enter at least ${minTrade.toLocaleString()} to trade {asset}
            </p>
          )}
          {!belowMinTrade && balanceBelowMin && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-destructive">
              <AlertCircle size={12} />Your balance must be at least ${minTrade.toLocaleString()} to trade {asset}
            </p>
          )}
          {!belowMinTrade && !balanceBelowMin && insufficient && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-destructive">
              <AlertCircle size={12} />Insufficient balance
            </p>
          )}
        </div>

        {/* Timeframe */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-bold text-muted-foreground">Expiry Timeframe</label>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-secondary/40 px-3 text-sm font-bold transition hover:border-primary/50"
            data-testid="button-timeframe-picker"
          >
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" />
              <span>{timeframeLabel}</span>
            </div>
            <ChevronUp size={15} className="text-muted-foreground" />
          </button>
        </div>

        {/* Payout summary */}
        <div className="mb-4 flex items-center justify-between rounded-xl bg-secondary/30 px-4 py-2.5 text-sm">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Payout</p>
            <p className="font-mono font-bold text-primary">{Math.round(payoutRate * 100)}%</p>
          </div>
          <div className="h-full w-px bg-border/50" />
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">If Win</p>
            <p className="font-mono font-bold text-green-400">+${potentialProfit}</p>
          </div>
          <div className="h-full w-px bg-border/50" />
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">If Loss</p>
            <p className="font-mono font-bold text-red-400">-${tradeAmt}</p>
          </div>
        </div>

        {/* Long / Short buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleTrade('long')}
            disabled={placing || !account || !!accountError || !tradesData || !!tradesError || !currentPrice || insufficient}
            className="group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl bg-green-500/12 py-5 font-bold text-green-400 ring-1 ring-green-500/30 transition hover:bg-green-500/22 hover:ring-green-500/60 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-buy-long"
          >
            <TrendingUp size={24} strokeWidth={2.5} />
            <span className="text-base font-extrabold tracking-tight">BUY LONG</span>
            <span className="text-[11px] font-normal text-green-400/60">Price will rise ↑</span>
          </button>
          <button
            type="button"
            onClick={() => handleTrade('short')}
            disabled={placing || !account || !!accountError || !tradesData || !!tradesError || !currentPrice || insufficient}
            className="group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl bg-red-500/12 py-5 font-bold text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/22 hover:ring-red-500/60 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-sell-short"
          >
            <TrendingDown size={24} strokeWidth={2.5} />
            <span className="text-base font-extrabold tracking-tight">SELL SHORT</span>
            <span className="text-[11px] font-normal text-red-400/60">Price will fall ↓</span>
          </button>
        </div>
        {tradeError && (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-destructive" role="alert" data-testid="status-trade-error">
            <AlertCircle size={15} />{tradeError}
          </p>
        )}
        </div>
      </div>

      <FuturesPositions
        positions={futuresPositions}
        isLoading={futuresPositionsLoading}
        error={futuresPositionsError}
        onRetry={() => { void refetchFuturesPositions(); }}
      />

      {/* ── Active Trades ── */}
      {activeTrades.length > 0 && (
        <div className="mb-3 rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Zap size={14} className="text-primary" />
            Active Spot Trades ({activeTrades.length})
          </h3>
          <div className="space-y-2">
            {activeTrades.map(trade => {
              const pct = Math.max(0, 1 - (new Date(trade.expiresAt).getTime() - Date.now()) / (trade.timeframeSecs * 1000));
              return (
                <button
                  type="button"
                  key={trade.id}
                  onClick={() => {
                    const direction = trade.direction;
                    if (direction !== 'long' && direction !== 'short') return;
                    setActiveSpotTrade({
                      id: trade.id,
                      asset: trade.asset,
                      direction,
                      amount: Number(trade.amount),
                      timeframeSecs: trade.timeframeSecs,
                      entryPrice: Number(trade.entryPrice),
                      expiresAt: trade.expiresAt,
                      payoutRate: Number(trade.payoutRate),
                    });
                  }}
                  aria-label={`View countdown and details for ${trade.asset} ${trade.direction} trade`}
                  data-testid={`button-active-trade-${trade.id}`}
                  className="block w-full overflow-hidden rounded-xl border border-border/40 bg-secondary/20 text-left transition hover:border-primary/40 hover:bg-secondary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Progress bar */}
                  <div className="h-0.5 w-full bg-border/30">
                    <div
                      className="h-full bg-primary transition-all duration-1000"
                      style={{ width: `${Math.min(100, pct * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                        trade.direction === 'long'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        {trade.direction === 'long' ? '↑ LONG' : '↓ SHORT'}
                      </span>
                      <span className="text-sm font-bold">{trade.asset}</span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="font-mono text-xs font-bold">${Number(trade.amount).toFixed(0)}</p>
                        <p className="text-[10px] text-muted-foreground">stake</p>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock size={11} />
                        <CountdownTimer expiresAt={trade.expiresAt} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trade History ── */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Trophy size={14} className="text-muted-foreground" />
            Recent Spot History
          </h3>
          <div className="space-y-1.5">
            {history.map(trade => (
              <button
                type="button"
                key={trade.id}
                onClick={() => setSelectedTradeId(trade.id)}
                className="flex w-full items-center justify-between rounded-xl bg-secondary/20 px-3 py-2 text-left transition hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`View details for ${trade.asset} ${trade.direction === 'long' ? 'buy long' : 'sell short'} trade`}
                data-testid={`button-trade-history-${trade.id}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                      trade.direction === 'long'
                        ? 'bg-green-500/10 text-green-400/80'
                        : 'bg-red-500/10 text-red-400/80'
                    }`}
                  >
                    {trade.direction === 'long' ? '↑' : '↓'} {trade.asset}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ${Number(trade.amount).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-sm font-bold ${
                      trade.result === 'win' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {trade.result === 'win'
                      ? `+$${Math.round(Number(trade.amount) * Number(trade.payoutRate))}`
                      : `-$${Number(trade.amount).toFixed(0)}`}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                      trade.result === 'win'
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {trade.result}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Futures trade modal — execution is separate from spot orders */}
      {showFutures && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowFutures(false)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-x-3 top-1/2 z-50 max-h-[calc(100dvh-1.5rem)] -translate-y-1/2 overflow-y-auto rounded-3xl border border-primary/25 bg-[hsl(222_10%_8%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,.65),0_0_40px_hsl(var(--primary)/.08)] sm:left-1/2 sm:right-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="futures-modal-title"
          >
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-border/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_18px_hsl(var(--primary)/.12)]">
                  <Zap size={18} />
                </div>
                <div>
                  <h2 id="futures-modal-title" className="text-base font-extrabold uppercase tracking-wider">
                    Futures Trade Box
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-primary">{asset}{futuresSettlement} {futuresContractType}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFutures(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/70 bg-secondary/60 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                aria-label="Close futures trade"
                data-testid="button-close-futures-modal"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              {(['Perpetual', 'Quarterly'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFuturesContractType(type)}
                  className={`h-9 rounded-xl border text-xs font-bold transition ${
                    futuresContractType === type
                      ? 'border-primary/60 bg-primary/12 text-primary shadow-[0_0_16px_hsl(var(--primary)/.08)]'
                      : 'border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`button-futures-contract-${type.toLowerCase()}`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              {(['USDT', 'USDC'] as const).map(settlement => (
                <button
                  key={settlement}
                  type="button"
                  onClick={() => setFuturesSettlement(settlement)}
                  className={`h-9 rounded-xl border text-xs font-bold transition ${
                    futuresSettlement === settlement
                      ? 'border-sky-500/60 bg-sky-500/12 text-sky-300'
                      : 'border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`button-futures-settlement-${settlement.toLowerCase()}`}
                >
                  {settlement}
                </button>
              ))}
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-border/40 bg-secondary/25 p-3 text-center">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Live reference</p>
                <p className="mt-1 font-mono text-sm font-bold" data-testid="text-futures-mark-price">
                  {freshFuturesQuote && futuresQuote?.price
                    ? `$${futuresQuote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`
                    : 'Unavailable'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Funding</p>
                <p className="mt-1 font-mono text-sm font-bold text-muted-foreground">Not charged</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Expiry</p>
                <p className="mt-1 font-mono text-sm font-bold">
                  {futuresContractType === 'Perpetual' ? 'Never' : 'Quarterly'}
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-secondary/25 p-1">
              <button
                type="button"
                onClick={() => setFuturesDirection('long')}
                className={`h-10 rounded-lg text-sm font-extrabold transition active:scale-[.98] ${
                  futuresDirection === 'long'
                    ? 'bg-green-500 text-white shadow-[0_5px_16px_rgba(34,197,94,.28)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid="button-futures-direction-long"
              >
                Long
              </button>
              <button
                type="button"
                onClick={() => setFuturesDirection('short')}
                className={`h-10 rounded-lg text-sm font-extrabold transition active:scale-[.98] ${
                  futuresDirection === 'short'
                    ? 'bg-red-500 text-white shadow-[0_5px_16px_rgba(239,68,68,.24)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid="button-futures-direction-short"
              >
                Short
              </button>
            </div>

            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-bold text-muted-foreground">Leverage</label>
                <div className="relative">
                  <select
                    value={futuresLeverage}
                    onChange={event => setFuturesLeverage(Number(event.target.value) as FuturesPositionInputLeverage)}
                    className="h-7 appearance-none rounded-lg border border-input bg-secondary/50 py-0 pl-2.5 pr-7 font-mono text-xs font-bold text-primary outline-none transition focus:border-primary"
                    data-testid="select-futures-leverage-dropdown"
                    aria-label="Leverage dropdown"
                  >
                    {[1, 2, 5, 10, 20, 50, 100].map(value => (
                      <option key={value} value={value}>{value}x</option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="pointer-events-none absolute right-2 top-2 text-muted-foreground" />
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {[1, 2, 5, 10, 20, 50, 100].map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFuturesLeverage(value as FuturesPositionInputLeverage)}
                    className={`h-8 min-w-[42px] flex-1 rounded-lg border text-xs font-bold transition ${
                      futuresLeverage === value
                        ? 'border-primary/60 bg-primary/12 text-primary'
                        : 'border-border/60 bg-secondary/25 text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid={`button-futures-leverage-${value}`}
                  >
                    {value}x
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="text-xs font-bold text-muted-foreground">Margin ({futuresSettlement})</label>
                <span className="text-right text-[11px] text-muted-foreground">
                  Available: <span className="font-mono font-bold text-foreground" data-testid="text-futures-available">{account && futuresPositions && !futuresPositionsError ? `$${futuresAvailable.toFixed(2)}` : '—'}</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={futuresMargin}
                  onChange={event => setFuturesMargin(event.target.value)}
                  min="0"
                  step="any"
                  className="h-11 w-full rounded-xl border border-input bg-secondary/40 pl-3 pr-24 font-mono text-base font-bold outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
                  data-testid="input-futures-margin"
                />
                <div className="absolute right-1.5 top-1.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFuturesMargin(Math.min(futuresAvailable, 10_000_000).toFixed(8).replace(/\.?0+$/, ''))}
                    disabled={!account || !futuresPositions || !!futuresPositionsError || !!accountError}
                    className="rounded-lg bg-primary/15 px-2 py-1.5 text-[10px] font-extrabold text-primary transition hover:bg-primary/25"
                    data-testid="button-futures-max"
                  >
                    MAX
                  </button>
                  <span className="pr-1 text-xs font-bold text-muted-foreground">{futuresSettlement}</span>
                </div>
              </div>
            </div>

            <p className="mb-4 text-[11px] text-muted-foreground" data-testid="text-futures-balance">
              Futures allocation: {account ? `$${futuresTotal.toFixed(2)}` : '—'} USDT · Reserved margin: {futuresPositions && !futuresPositionsError ? `$${futuresReserved.toFixed(2)}` : '—'} USDT. Spot funds are separate.
            </p>
            {!supportedFuturesMode && (
              <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300" role="status" data-testid="status-futures-unsupported">
                {futuresContractType === 'Quarterly' ? 'Quarterly contracts' : 'USDC settlement'} cannot be opened yet. Select USDT Perpetual to trade.
              </p>
            )}
            {supportedFuturesMode && !freshFuturesQuote && (
              <p className="mb-4 text-xs text-amber-300" role="status" data-testid="status-futures-quote-unavailable">A provider-timestamped live quote is unavailable for {asset}. Opening is paused until a fresh trade arrives.</p>
            )}
            {supportedFuturesMode && futuresMargin && !validFuturesMargin && account && futuresPositions && !futuresPositionsError && (
              <p className="mb-4 text-xs text-amber-300" role="status" data-testid="status-futures-margin">Enter 1–10,000,000 USDT, no more than your available Futures balance (up to 8 decimal places).</p>
            )}
            {(accountLoading || futuresPositionsLoading && !futuresPositions) && (
              <p className="mb-4 text-xs text-muted-foreground" role="status" data-testid="status-futures-loading">Checking Futures balance and positions…</p>
            )}
            {(accountError || futuresPositionsError) && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert" data-testid="status-futures-data-error">
                <span>Futures balance or positions could not be loaded.</span>
                <button type="button" className="font-bold underline" onClick={() => { void refetchAccount(); void refetchFuturesPositions(); }} data-testid="button-retry-futures-data">Retry</button>
              </div>
            )}
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-4 text-amber-200/90">
                Leverage amplifies gains and losses. Loss per position is limited to its reserved margin. Positions settle inside this app using live reference prices, not on an external exchange. Funding and automatic liquidation are not enabled.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenFutures}
              disabled={!canOpenFutures}
              className={`w-full rounded-xl py-3.5 text-sm font-extrabold text-white transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                futuresDirection === 'long'
                  ? 'bg-green-600 shadow-[0_8px_22px_rgba(22,163,74,.25)] hover:bg-green-500'
                  : 'bg-red-600 shadow-[0_8px_22px_rgba(220,38,38,.22)] hover:bg-red-500'
              }`}
              data-testid="button-open-futures-order"
            >
              {openFuturesPosition.isPending ? 'Opening position…' : `Open ${futuresLeverage}x ${futuresDirection === 'long' ? 'Long' : 'Short'} — ${asset}/${futuresSettlement}`}
            </button>
            {futuresNotice && (
              <div className={`mt-3 text-center text-[11px] font-semibold ${futuresNotice.kind === 'error' ? 'text-red-300' : 'text-green-300'}`} role={futuresNotice.kind === 'error' ? 'alert' : 'status'} data-testid="status-futures-order">
                <p>{futuresNotice.text}</p>
                {futuresNotice.kind === 'success' && (
                  <button type="button" data-testid="button-view-futures-positions" className="mt-2 underline" onClick={() => {
                    setShowFutures(false);
                    requestAnimationFrame(() => document.getElementById('futures-positions-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                  }}>View My Positions</button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Timeframe picker sheet */}
      {showPicker && (
        <TimeframeSheet
          value={timeframeSecs}
          onChange={setTimeframeSecs}
          onClose={() => setShowPicker(false)}
        />
      )}
      {selectedTrade && (
        <TradeDetailModal
          trade={selectedTrade}
          onClose={() => setSelectedTradeId(null)}
        />
      )}
      {activeSpotTrade && (
        <ActiveTradeStatusModal
          trade={activeSpotTrade}
          currentPrice={currentPrice}
          settledTrade={trades.find(trade => trade.id === activeSpotTrade.id)}
          onClose={() => setActiveSpotTrade(null)}
        />
      )}
    </div>
  );
}
