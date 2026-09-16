// ─── Trading & Futures Module ─────────────────────────────────────────────────
// Trades settle against the same USDT wallet balance shown on Overview.

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, ChevronUp, Clock, Trophy, AlertCircle, Zap, X } from 'lucide-react';
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

const PRICE_FALLBACKS: Record<string, number> = {
  BTC: 67000,
  ETH: 3500,
  BNB: 580,
  SOL: 145,
  XRP: 0.52,
  GOLD: 2348.4,
};

// ─── Per-asset minimum trade amount (USDT) — mirrors the backend enforcement ──
const ASSET_MIN_TRADE: Record<string, number> = {
  GOLD: 30000,
  BTC: 15000,
  ETH: 10000,
  BNB: 10000,
  SOL: 10000,
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

// ─── Price chart helpers ───────────────────────────────────────────────────────

function generatePriceHistory(base: number, count: number) {
  const pts: { t: number; price: number }[] = [];
  let p = base * (1 - 0.008 * Math.random());
  for (let i = count - 1; i >= 0; i--) {
    p = p * (1 + (Math.random() - 0.497) * 0.0025);
    pts.push({ t: Date.now() - i * 1500, price: p });
  }
  return pts;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriceChart({
  basePrice,
  entryPrice,
  assetKey,
}: {
  basePrice: number;
  entryPrice?: number;
  assetKey: string;
}) {
  const [data, setData] = useState<{ t: number; price: number }[]>([]);

  // Re-seed when asset or base price changes significantly
  const basePriceRef = useRef(basePrice);
  useEffect(() => {
    if (Math.abs(basePriceRef.current - basePrice) / basePrice > 0.01 || data.length === 0) {
      basePriceRef.current = basePrice;
      setData(generatePriceHistory(basePrice, 80));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey, basePrice > 0]);

  useEffect(() => {
    if (basePrice <= 0) return;
    const iv = setInterval(() => {
      setData(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1].price;
        const next = last * (1 + (Math.random() - 0.497) * 0.0025);
        return [...prev.slice(-79), { t: Date.now(), price: next }];
      });
    }, 1200);
    return () => clearInterval(iv);
  }, [basePrice]);

  const prices = data.map(d => d.price);
  const lo = Math.min(...prices) * 0.9992;
  const hi = Math.max(...prices) * 1.0008;
  const current = data[data.length - 1]?.price ?? basePrice;
  const first = data[0]?.price ?? basePrice;
  const isUp = current >= first;
  const stroke = isUp ? '#22c55e' : '#ef4444';

  return (
    <div className="relative">
      {/* Live price badge */}
      <div className="pointer-events-none absolute left-3 top-2 z-10 flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-extrabold tracking-tight" style={{ color: stroke }}>
          ${current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isUp ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {isUp ? '▲' : '▼'} LIVE
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
    const tick = () => setSecs(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
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

// ─── Main Trading Page ────────────────────────────────────────────────────────

export function TradingPage() {
  const [asset, setAsset] = useState('BTC');
  const [amount, setAmount] = useState(String(minTradeAmountFor('BTC')));
  const [goldTierIndex, setGoldTierIndex] = useState(0);
  const [timeframeSecs, setTimeframeSecs] = useState(60);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<{ msg: string; type: 'win' | 'loss' } | null>(null);
  const [tradeError, setTradeError] = useState('');
  const qc = useQueryClient();

  const { data: market = [] } = useGetMarketSummary({ query: { queryKey: getGetMarketSummaryQueryKey(), refetchInterval: 30_000 } });
  const { data: account } = useGetTradingAccount({ query: { queryKey: getGetTradingAccountQueryKey(), refetchInterval: 5_000 } });
  const { data: portfolio } = useGetPortfolio({ query: { queryKey: getGetPortfolioQueryKey(), refetchInterval: 5_000 } });
  const { data: trades = [], refetch: refetchTrades } = useGetTrades({
    query: { queryKey: getGetTradesQueryKey(), refetchInterval: 3_000 },
  });
  const placeTradeHook = usePlaceTrade();

  const marketSymbol = asset === 'GOLD' ? 'XAUT' : asset;
  const marketAsset = market.find(m => m.symbol === marketSymbol);
  const currentPrice = marketAsset?.price ?? PRICE_FALLBACKS[asset] ?? 0;

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
  const belowMinTrade = tradeAmt < minTrade;
  const balanceBelowMin = balance < minTrade;
  const insufficient = tradeAmt > availableToTrade || belowMinTrade || balanceBelowMin;
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
    if (placing || !currentPrice || insufficient) return;
    setPlacing(true);
    setTradeError('');
    try {
      await placeTradeHook.mutateAsync({ data: { asset, direction, amount: tradeAmt, timeframeSecs } });
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
    <div className="mx-auto max-w-xl">
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
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      {/* ── Deposit required banner (zero balance) ── */}
      {balance === 0 && (
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

      {/* ── Chart ── */}
      <div className="mb-3 overflow-hidden rounded-2xl border border-border/60 bg-card">
        {currentPrice > 0 ? (
          <PriceChart
            key={asset}
            basePrice={currentPrice}
            entryPrice={entryPrice}
            assetKey={asset}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-primary" />
            Loading market data…
          </div>
        )}
      </div>

      {/* ── Order Panel ── */}
      <div className="mb-3 rounded-2xl border border-border/60 bg-card p-4">
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
              Available: <span className="font-mono font-bold">${availableToTrade.toFixed(0)}</span>
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
            disabled={placing || !currentPrice || insufficient}
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
            disabled={placing || !currentPrice || insufficient}
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

      {/* ── Active Trades ── */}
      {activeTrades.length > 0 && (
        <div className="mb-3 rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Zap size={14} className="text-primary" />
            Active Positions ({activeTrades.length})
          </h3>
          <div className="space-y-2">
            {activeTrades.map(trade => {
              const pct = Math.max(0, 1 - (new Date(trade.expiresAt).getTime() - Date.now()) / (trade.timeframeSecs * 1000));
              return (
                <div key={trade.id} className="overflow-hidden rounded-xl border border-border/40 bg-secondary/20">
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
                </div>
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
            Recent History
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
    </div>
  );
}
