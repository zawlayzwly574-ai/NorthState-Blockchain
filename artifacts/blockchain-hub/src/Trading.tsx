// ─── Trading & Futures Module ─────────────────────────────────────────────────
// Trades settle against the same USDT wallet balance shown on Overview.

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { TrendingUp, TrendingDown, ChevronUp, Clock, Trophy, AlertCircle, Zap, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AreaChart, Area, ResponsiveContainer, YAxis, ReferenceLine, Tooltip,
} from 'recharts';
import {
  useGetTradingAccount,
  useGetPortfolio,
  useGetTrades,
  usePlaceTrade,
  useGetMarketSummary,
  useGetMiningPlace,
  useGetMiningInvestments,
  useConvertMiningGold,
  getGetMarketSummaryQueryKey,
  getGetTradingAccountQueryKey,
  getGetTradesQueryKey,
  getGetPortfolioQueryKey,
  getGetMiningPlaceQueryKey,
  getGetMiningInvestmentsQueryKey,
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

const TRADING_ASSETS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'GOLD'];
const PAYOUT_RATE = 0.85;
const DEFAULT_MAIN_WALLET_BALANCE = 24_680.42;

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
              onClick={() => { onChange(tf.secs); onClose(); }}
              className={`min-h-[44px] rounded-xl py-3 text-sm font-bold transition active:scale-95 ${
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
          onClick={onClose}
          className="mt-5 min-h-[44px] w-full rounded-xl py-3 text-sm text-muted-foreground transition hover:text-foreground"
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
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary/70 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
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
  const { isLoaded, isSignedIn } = useAuth();
  const memberQueriesEnabled = isLoaded && isSignedIn;
  const [asset, setAsset] = useState('BTC');
  const [amount, setAmount] = useState('100');
  const [timeframeSecs, setTimeframeSecs] = useState(60);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [goldSourceId, setGoldSourceId] = useState('');
  const [goldUnits, setGoldUnits] = useState('');
  const [goldDestination, setGoldDestination] = useState('USDT');
  const [goldConversionError, setGoldConversionError] = useState('');
  const [goldConversionDone, setGoldConversionDone] = useState('');
  const [flash, setFlash] = useState<{ msg: string; type: 'win' | 'loss' } | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: market = [] } = useGetMarketSummary({ query: { queryKey: getGetMarketSummaryQueryKey(), refetchInterval: 30_000, placeholderData: (previous) => previous } });
  const { data: miningPlace } = useGetMiningPlace({ query: { queryKey: getGetMiningPlaceQueryKey(), refetchInterval: 30_000, placeholderData: (previous) => previous } });
  const { data: miningInvestments } = useGetMiningInvestments({ query: { queryKey: getGetMiningInvestmentsQueryKey(), enabled: memberQueriesEnabled, refetchInterval: 30_000, placeholderData: (previous) => previous } });
  const { data: account } = useGetTradingAccount({ query: { queryKey: getGetTradingAccountQueryKey(), enabled: memberQueriesEnabled, refetchInterval: 5_000, placeholderData: (previous) => previous } });
  const { data: portfolio } = useGetPortfolio({ query: { queryKey: getGetPortfolioQueryKey(), enabled: memberQueriesEnabled, refetchInterval: 5_000, placeholderData: (previous) => previous } });
  const { data: trades = [], refetch: refetchTrades } = useGetTrades({
    query: { queryKey: getGetTradesQueryKey(), enabled: memberQueriesEnabled, refetchInterval: 3_000, placeholderData: (previous) => previous },
  });
  const placeTradeHook = usePlaceTrade();
  const convertGold = useConvertMiningGold();

  const goldQuote = miningPlace?.assets.find(item => item.symbol === 'GOLD');
  const marketAsset = asset === 'GOLD' ? goldQuote : market.find(m => m.symbol === asset);
  const currentPrice = marketAsset?.price ?? (asset === 'GOLD' ? 2348.4 : 0);
  const goldInvestments = miningInvestments?.investments.filter(investment => investment.symbol === 'GOLD' && investment.status === 'active') ?? [];
  const heldGoldUnits = goldInvestments.reduce((total, investment) => total + Number(investment.units ?? 0), 0);
  const heldGoldValue = goldInvestments.reduce((total, investment) => total + Number(investment.currentValue ?? 0), 0);
  const selectedGoldInvestment = goldInvestments.find(investment => investment.id === goldSourceId) ?? goldInvestments[0];

  useEffect(() => {
    if (!goldSourceId && goldInvestments[0]) setGoldSourceId(goldInvestments[0].id);
    if (goldSourceId && !goldInvestments.some(investment => investment.id === goldSourceId)) {
      setGoldSourceId(goldInvestments[0]?.id ?? '');
    }
  }, [goldInvestments, goldSourceId]);

  const activeTrades = trades.filter(t => t.status === 'active');
  const history = trades.filter(t => t.status === 'completed').slice(0, 12);
  const selectedTrade = selectedTradeId === null
    ? null
    : trades.find(trade => trade.id === selectedTradeId) ?? null;
  const assetActiveTrade = activeTrades.find(t => t.asset === asset);
  const entryPrice = assetActiveTrade ? Number(assetActiveTrade.entryPrice) : undefined;

  const tradeAmt = Math.max(1, Number(amount) || 0);
  const potentialProfit = Math.floor(tradeAmt * PAYOUT_RATE);
  const timeframeLabel = TIMEFRAMES.find(tf => tf.secs === timeframeSecs)?.label ?? '60s';
  // Overview and Trading display the same main-wallet total. Keep the seeded
  // wallet value visible while the shared portfolio query is still loading.
  const balance = Number(portfolio?.totalValue ?? DEFAULT_MAIN_WALLET_BALANCE);
  const reservedBalance = activeTrades.reduce((total, trade) => total + Number(trade.amount), 0);
  const availableToTrade = Math.max(0, balance - reservedBalance);
  const insufficient = tradeAmt > availableToTrade;
  const winRate = account?.totalTrades
    ? Math.round(((account.wins ?? 0) / account.totalTrades) * 100)
    : null;

  const triggerFlash = (msg: string, type: 'win' | 'loss') => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 2500);
  };

  const refreshCanonicalBalance = async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: getGetTradingAccountQueryKey(), type: 'all' }),
      qc.refetchQueries({ queryKey: getGetPortfolioQueryKey(), type: 'all' }),
    ]);
  };

  const handleTrade = async (direction: 'long' | 'short') => {
    if (placing) return;
    if (insufficient) {
      toast({
        variant: 'destructive',
        title: 'Trade not placed',
        description: `Reduce the amount below your available $${availableToTrade.toFixed(2)} balance.`,
      });
      return;
    }
    setPlacing(true);
    try {
      const result = await placeTradeHook.mutateAsync({ data: { asset, direction, amount: tradeAmt, timeframeSecs } });
      await refetchTrades();
      await refreshCanonicalBalance();
      toast({
        title: `${direction === 'long' ? 'BUY LONG' : 'SELL SHORT'} placed`,
        description: `${asset} trade #${result.tradeId} is active. $${tradeAmt.toFixed(2)} is reserved from your main wallet.`,
      });
    } catch (error) {
      const apiError = error as { data?: { error?: string }; message?: string };
      toast({
        variant: 'destructive',
        title: 'Trade could not be placed',
        description: apiError.data?.error ?? apiError.message ?? 'Please check your wallet balance and try again.',
      });
    } finally {
      setPlacing(false);
    }
  };

  const handleGoldConversion = async () => {
    const units = Number(goldUnits);
    if (!selectedGoldInvestment || !Number.isFinite(units) || units <= 0) return;
    setGoldConversionError('');
    setGoldConversionDone('');
    try {
      const result = await convertGold.mutateAsync({
        id: selectedGoldInvestment.id,
        data: { units, toAsset: goldDestination as 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'DAI' | 'FDUSD' | 'BNB' },
      });
      setGoldUnits('');
      setGoldConversionDone(`${result.fromUnits.toFixed(6)} oz converted to ${result.toAmount.toFixed(6)} ${result.toAsset}.`);
      await Promise.all([
        qc.refetchQueries({ queryKey: getGetMiningInvestmentsQueryKey(), type: 'all' }),
        qc.refetchQueries({ queryKey: getGetPortfolioQueryKey(), type: 'all' }),
      ]);
    } catch (error) {
      const apiError = error as { data?: { error?: string } };
      setGoldConversionError(apiError.data?.error ?? 'Gold could not be converted. Refresh the position and try again.');
    }
  };

  // Flash result when a trade completes
  const prevActive = useRef<number[]>([]);
  useEffect(() => {
    const nowActive = activeTrades.map(t => t.id);
    const justCompleted = prevActive.current.filter(id => !nowActive.includes(id));
    if (justCompleted.length > 0) {
      void refreshCanonicalBalance();
      const settled = trades.filter(t => justCompleted.includes(t.id));
      const wins = settled.filter(t => t.result === 'win');
      if (wins.length > 0) {
        triggerFlash(`+$${Math.round(Number(wins[0].amount) * PAYOUT_RATE)} — WIN!`, 'win');
      } else if (settled.length > 0) {
        triggerFlash(`-$${Number(settled[0].amount).toFixed(0)} — LOSS`, 'loss');
      }
    }
    prevActive.current = nowActive;
  }, [activeTrades.length, trades]);

  return (
    <div className="mx-auto w-full max-w-xl pb-4">
      {/* Win/Loss flash overlay */}
      {flash && (
        <div className={`pointer-events-none fixed inset-x-0 top-20 z-50 mx-auto w-fit rounded-2xl px-6 py-3 text-center text-sm font-extrabold shadow-2xl animate-in slide-in-from-top-4 fade-in ${
          flash.type === 'win'
            ? 'bg-green-500 text-white'
            : 'bg-destructive text-white'
        }`}>
          {flash.msg}
        </div>
      )}

      {/* ── Header row ── */}
      <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">Trading Balance</p>
          <p className="mt-1 break-words font-mono text-2xl font-extrabold tracking-tight sm:text-xl">
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          <div className="rounded-xl bg-secondary/40 px-3 py-2.5 text-left sm:bg-transparent sm:p-0 sm:text-right">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Trades</p>
            <p className="mt-1 font-mono text-base font-extrabold">{account?.totalTrades ?? 0}</p>
          </div>
          <div className="rounded-xl bg-secondary/40 px-3 py-2.5 text-left sm:bg-transparent sm:p-0 sm:text-right">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Win Rate</p>
            <p className={`mt-1 font-mono text-base font-extrabold ${winRate !== null && winRate >= 50 ? 'text-green-400' : 'text-muted-foreground'}`}>
              {winRate !== null ? `${winRate}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Asset selector ── */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {TRADING_ASSETS.map(a => {
          const mkt = a === 'GOLD' ? goldQuote : market.find(m => m.symbol === a);
          const chg = mkt?.change24h ?? 0;
          return (
            <button
              key={a}
              onClick={() => setAsset(a)}
              className={`min-h-[48px] shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-extrabold transition active:scale-95 ${
                asset === a
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_hsl(var(--primary)/.3)]'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="block">{a}</span>
              {mkt && (
                <span className={`block font-mono text-[10px] font-semibold ${chg >= 0 ? 'text-green-400' : 'text-red-400'} ${asset === a ? 'text-primary-foreground/70' : ''}`}>
                  {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {asset === 'GOLD' && (
        <div className="mb-3 rounded-2xl border border-[#d6ad3b]/30 bg-[#d6ad3b]/8 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#d6ad3b]">Mining Place Gold</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Convert units from an active position into a wallet asset at the current server quote.</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-sm font-extrabold">{heldGoldUnits.toFixed(6)} oz</p>
              <p className="text-[10px] text-muted-foreground">${heldGoldValue.toFixed(2)} held</p>
            </div>
          </div>
          {goldInvestments.length > 0 ? (
            <div className="mt-4 grid gap-3 border-t border-[#d6ad3b]/20 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-bold text-muted-foreground">
                  Source position
                  <select value={selectedGoldInvestment?.id ?? ''} onChange={event => setGoldSourceId(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-foreground" data-testid="select-gold-source">
                    {goldInvestments.map(investment => (
                      <option key={investment.id} value={investment.id}>#{investment.id} · {Number(investment.units ?? 0).toFixed(6)} oz</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-bold text-muted-foreground">
                  Destination wallet asset
                  <select value={goldDestination} onChange={event => setGoldDestination(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-foreground" data-testid="select-gold-destination">
                    {['USDT', 'USDC', 'BTC', 'ETH', 'DAI', 'FDUSD', 'BNB'].map(symbol => <option key={symbol}>{symbol}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="number" min="0.000000000001" step="any" max={Number(selectedGoldInvestment?.units ?? 0)} value={goldUnits} onChange={event => setGoldUnits(event.target.value)} placeholder="Gold units (oz)" className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 font-mono text-sm" data-testid="input-gold-conversion-units" />
                <button type="button" onClick={() => setGoldUnits(String(selectedGoldInvestment?.units ?? ''))} className="h-11 rounded-xl border border-[#d6ad3b]/30 px-3 text-xs font-bold text-[#d6ad3b]">Max</button>
                <button type="button" onClick={handleGoldConversion} disabled={convertGold.isPending || !goldUnits || Number(goldUnits) <= 0 || Number(goldUnits) > Number(selectedGoldInvestment?.units ?? 0)} className="h-11 rounded-xl bg-[#d6ad3b] px-4 text-sm font-extrabold text-black disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-convert-gold">
                  {convertGold.isPending ? 'Converting…' : `Convert to ${goldDestination}`}
                </button>
              </div>
              {goldConversionError && <p className="text-xs font-semibold text-destructive" data-testid="status-gold-conversion-error">{goldConversionError}</p>}
              {goldConversionDone && <p className="text-xs font-semibold text-green-400" data-testid="status-gold-conversion-success">{goldConversionDone}</p>}
            </div>
          ) : (
            <p className="mt-3 border-t border-[#d6ad3b]/20 pt-3 text-xs text-muted-foreground">You need an approved active Gold position before you can convert units.</p>
          )}
        </div>
      )}

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
      <div className="mb-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
        {/* Amount */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-extrabold text-muted-foreground">Trade Amount (USD)</label>
            <span className="text-xs font-semibold text-muted-foreground">
              Available: <span className="font-mono font-bold">${availableToTrade.toFixed(0)}</span>
            </span>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="1"
              step="1"
              className="h-14 min-h-[56px] w-full min-w-0 flex-1 rounded-xl border border-input bg-secondary/40 px-4 font-mono text-lg font-extrabold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-12 sm:min-h-[48px] sm:text-base"
              placeholder="100"
              data-testid="input-trade-amount"
            />
            <div className="grid w-full shrink-0 grid-cols-4 gap-2 sm:w-auto sm:grid-cols-2">
              {[25, 50, 100, 250].map(v => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className={`h-12 min-h-[48px] rounded-xl border px-2 text-sm font-extrabold transition hover:text-foreground sm:h-11 sm:min-h-[44px] sm:text-xs ${
                    Number(amount) === v
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {insufficient && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-destructive">
              <AlertCircle size={12} />Insufficient balance
            </p>
          )}
        </div>

        {/* Timeframe */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-extrabold text-muted-foreground">Expiry Timeframe</label>
          <button
            onClick={() => setShowPicker(true)}
            className="flex h-14 min-h-[56px] w-full items-center justify-between rounded-xl border border-input bg-secondary/40 px-4 text-base font-extrabold transition hover:border-primary/50 sm:h-12 sm:min-h-[48px]"
            data-testid="button-timeframe-picker"
          >
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-muted-foreground" />
              <span>{timeframeLabel}</span>
            </div>
            <ChevronUp size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Payout summary */}
        <div className="mb-4 grid grid-cols-3 items-stretch rounded-xl bg-secondary/30 px-2 py-3 text-sm sm:px-4">
          <div className="text-center">
            <p className="text-[11px] text-muted-foreground uppercase font-extrabold tracking-wider">Payout</p>
            <p className="mt-1 font-mono text-base font-extrabold text-primary">{Math.round(PAYOUT_RATE * 100)}%</p>
          </div>
          <div className="h-full w-px bg-border/50" />
          <div className="text-center">
            <p className="text-[11px] text-muted-foreground uppercase font-extrabold tracking-wider">If Win</p>
            <p className="mt-1 font-mono text-base font-extrabold text-green-400">+${potentialProfit}</p>
          </div>
          <div className="h-full w-px bg-border/50" />
          <div className="text-center">
            <p className="text-[11px] text-muted-foreground uppercase font-extrabold tracking-wider">If Loss</p>
            <p className="mt-1 font-mono text-base font-extrabold text-red-400">-${tradeAmt}</p>
          </div>
        </div>

        {/* Long / Short buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleTrade('long')}
            aria-busy={placing}
            className="group relative flex min-h-[88px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-green-500/12 px-2 py-5 font-bold text-green-400 ring-1 ring-green-500/30 transition hover:bg-green-500/22 hover:ring-green-500/60 active:scale-[.98]"
            data-testid="button-buy-long"
          >
            <TrendingUp size={24} strokeWidth={2.5} />
            <span className="text-lg font-extrabold tracking-tight">{placing ? 'PLACING…' : 'BUY LONG'}</span>
            <span className="text-xs font-semibold text-green-400/70">Price will rise ↑</span>
          </button>
          <button
            type="button"
            onClick={() => handleTrade('short')}
            aria-busy={placing}
            className="group relative flex min-h-[88px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-red-500/12 px-2 py-5 font-bold text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/22 hover:ring-red-500/60 active:scale-[.98]"
            data-testid="button-sell-short"
          >
            <TrendingDown size={24} strokeWidth={2.5} />
            <span className="text-lg font-extrabold tracking-tight">{placing ? 'PLACING…' : 'SELL SHORT'}</span>
            <span className="text-xs font-semibold text-red-400/70">Price will fall ↓</span>
          </button>
        </div>
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
                      ? `+$${Math.round(Number(trade.amount) * PAYOUT_RATE)}`
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
