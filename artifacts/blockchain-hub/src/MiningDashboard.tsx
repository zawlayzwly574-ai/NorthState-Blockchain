import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, Cpu, Pickaxe, Zap, Play, Square, Gift,
  CheckCircle2, ShieldCheck, Flame, Layers, Lock, Sparkles,
  TrendingUp, Wallet, Clock, RefreshCw
} from 'lucide-react';
import { useWeb3 } from './lib/web3-wallet';

export type MiningOffer = {
  id: string;
  name: string;
  ticker: string;
  kind: 'Staking' | 'Pool' | 'Cloud mining';
  baseApy: number;
  minimum: number;
  unit: string;
  period: string;
  status: 'Active' | 'High Yield' | 'Institutional';
  color: string;
  algorithm?: string;
  detail: string;
  network: string;
  totalPoolValue: string;
};

const offers: MiningOffer[] = [
  {
    id: 'eth-stake',
    name: 'Ethereum Liquid Staking',
    ticker: 'ETH',
    kind: 'Staking',
    baseApy: 3.8,
    minimum: 0.05,
    unit: 'ETH',
    period: 'Flexible / Instant Unstake',
    status: 'Active',
    color: '#8797f5',
    detail: 'Decentralized Ethereum validator staking with daily automated compounding and liquid staking yield.',
    network: 'Ethereum Mainnet',
    totalPoolValue: '$1,420,800,000',
  },
  {
    id: 'sol-stake',
    name: 'Solana High-Yield Validator',
    ticker: 'SOL',
    kind: 'Staking',
    baseApy: 6.9,
    minimum: 0.5,
    unit: 'SOL',
    period: 'Flexible',
    status: 'High Yield',
    color: '#9a83f7',
    detail: 'High-performance Solana cluster with 0% validator commission and maximum MEV reward distribution.',
    network: 'Solana Network',
    totalPoolValue: '$840,500,000',
  },
  {
    id: 'atom-stake',
    name: 'Cosmos Hub Staking',
    ticker: 'ATOM',
    kind: 'Staking',
    baseApy: 13.2,
    minimum: 2.0,
    unit: 'ATOM',
    period: '21-day unbonding',
    status: 'High Yield',
    color: '#a7b4d7',
    detail: 'Interchain security staking securing multi-zone Cosmos ecosystem IBC traffic with premium rewards.',
    network: 'Cosmos Hub',
    totalPoolValue: '$310,200,000',
  },
  {
    id: 'btc-pool',
    name: 'Bitcoin SHA-256 Mining Pool',
    ticker: 'BTC',
    kind: 'Pool',
    baseApy: 18.4,
    minimum: 50,
    unit: 'USDT',
    period: 'Daily settlement',
    status: 'Active',
    color: '#f4b740',
    algorithm: 'SHA-256',
    detail: 'Tier-1 enterprise ASIC computing power connected to high-efficiency hydroelectric facilities.',
    network: 'Bitcoin Core',
    totalPoolValue: '4.82 EH/s',
  },
  {
    id: 'ltc-doge-pool',
    name: 'Litecoin & Dogecoin Merged Pool',
    ticker: 'LTC+DOGE',
    kind: 'Pool',
    baseApy: 16.8,
    minimum: 25,
    unit: 'USDT',
    period: 'Daily settlement',
    status: 'Active',
    color: '#345d9d',
    algorithm: 'Scrypt',
    detail: 'Dual-reward merged Scrypt mining receiving both LTC and DOGE block rewards simultaneously.',
    network: 'Scrypt Network',
    totalPoolValue: '1.25 PH/s',
  },
  {
    id: 'kaspa-pool',
    name: 'Kaspa BlockDAG Hashrate',
    ticker: 'KAS',
    kind: 'Cloud mining',
    baseApy: 22.5,
    minimum: 100,
    unit: 'USDT',
    period: '60 days lockup',
    status: 'High Yield',
    color: '#70c7ba',
    algorithm: 'kHeavyHash',
    detail: 'Ultra-fast sub-second GHOSTDAG block mining with cutting-edge dedicated ASIC rigs.',
    network: 'Kaspa Mainnet',
    totalPoolValue: '980 TH/s',
  },
];

const cryptoLogoUrls: Record<string, string> = {
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  ATOM: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  'LTC+DOGE': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
  KAS: 'https://assets.coingecko.com/coins/images/28898/large/kaspa.png',
};

function MiningOfferLogo({ ticker, name, color }: { ticker: string; name: string; color: string }) {
  const [failed, setFailed] = useState(false);
  const src = cryptoLogoUrls[ticker] ?? cryptoLogoUrls.BTC;
  if (failed) {
    return (
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/80"
        aria-label={`${name} logo`}
      >
        <Cpu size={22} style={{ color }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`${name} logo`}
      width={48}
      height={48}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-2xl border border-white/10 bg-[#111318] p-2 object-contain shadow-md"
    />
  );
}

const money = (n: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
  }).format(n);

interface ActiveSession {
  id: string;
  active: boolean;
  principal: number;
  durationDays: number;
  autoCompound: boolean;
  rewards: number;
  startedAt: number;
}

export function MiningDashboard() {
  const { isConnected, account, openConnectModal } = useWeb3();
  const [filter, setFilter] = useState<'All' | MiningOffer['kind']>('All');
  const [selectedOffer, setSelectedOffer] = useState<MiningOffer | null>(null);
  const [stakeAmount, setStakeAmount] = useState<string>('500');
  const [lockupDays, setLockupDays] = useState<number>(0); // 0 = flexible
  const [autoCompound, setAutoCompound] = useState<boolean>(true);
  const [sessions, setSessions] = useState<Record<string, ActiveSession>>(() => {
    try {
      const stored = localStorage.getItem('ns_mining_sessions');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [rewardsBalance, setRewardsBalance] = useState<number>(() => {
    try {
      const val = localStorage.getItem('ns_rewards_balance');
      return val ? Number(val) : 0;
    } catch {
      return 0;
    }
  });
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Save sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ns_mining_sessions', JSON.stringify(sessions));
      localStorage.setItem('ns_rewards_balance', String(rewardsBalance));
    } catch {}
  }, [sessions, rewardsBalance]);

  // Real-time yield accumulation timer
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSessions((current) => {
        let hasActive = false;
        const next: Record<string, ActiveSession> = {};
        for (const [id, session] of Object.entries(current)) {
          if (!session.active) {
            next[id] = session;
            continue;
          }
          hasActive = true;
          const offer = offers.find((o) => o.id === id);
          if (!offer) {
            next[id] = session;
            continue;
          }
          // Yield generated every 3 seconds based on APY + lockup boost
          const boost = session.durationDays === 90 ? 3.2 : session.durationDays === 60 ? 1.8 : session.durationDays === 30 ? 0.8 : 0;
          const totalApy = offer.baseApy + boost;
          const secondYield = (session.principal * (totalApy / 100)) / (365 * 24 * 3600);
          const incremental = secondYield * 3 * (session.autoCompound ? 1.05 : 1);
          next[id] = {
            ...session,
            rewards: session.rewards + incremental,
          };
        }
        return hasActive ? next : current;
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const runningSessions = Object.values(sessions).filter((s) => s.active);
  const totalPrincipal = runningSessions.reduce((sum, s) => sum + s.principal, 0);

  const handleStartStake = (offer: MiningOffer) => {
    const amt = parseFloat(stakeAmount);
    if (isNaN(amt) || amt < offer.minimum) {
      setNotice({
        message: `Minimum required commitment for ${offer.name} is ${offer.minimum} ${offer.unit}.`,
        type: 'info',
      });
      return;
    }

    setSessions((prev) => ({
      ...prev,
      [offer.id]: {
        id: offer.id,
        active: true,
        principal: (prev[offer.id]?.principal || 0) + amt,
        durationDays: lockupDays,
        autoCompound,
        rewards: prev[offer.id]?.rewards || 0,
        startedAt: Date.now(),
      },
    }));

    setNotice({
      message: `Successfully allocated ${amt} ${offer.unit} to ${offer.name} with ${lockupDays === 0 ? 'flexible' : `${lockupDays}-day`} lockup!`,
      type: 'success',
    });
    setSelectedOffer(null);
  };

  const handleStopStake = (offer: MiningOffer) => {
    setSessions((prev) => {
      const existing = prev[offer.id];
      if (!existing) return prev;
      return {
        ...prev,
        [offer.id]: {
          ...existing,
          active: false,
        },
      };
    });
    setNotice({
      message: `${offer.name} session unbonded and stopped. Accrued rewards are available to claim.`,
      type: 'info',
    });
  };

  const handleClaim = (offer: MiningOffer) => {
    const session = sessions[offer.id];
    if (!session || session.rewards <= 0) return;
    const claimed = session.rewards;
    setRewardsBalance((b) => b + claimed);
    setSessions((prev) => ({
      ...prev,
      [offer.id]: {
        ...session,
        rewards: 0,
      },
    }));
    setNotice({
      message: `Successfully claimed ${money(claimed, 4)} in mining rewards to your balance!`,
      type: 'success',
    });
  };

  const visibleOffers = offers.filter((o) => filter === 'All' || o.kind === filter);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-[#121622] via-[#0d1017] to-[#07090d] p-6 sm:p-10 shadow-2xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[80px]" />
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Pickaxe size={14} /> Institutional Staking & Enterprise Cloud Mining
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Earn, Mine & Stake Digital Assets
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Participate in Proof-of-Stake consensus validation and institutional Bitcoin ASIC pools.
              Enjoy automated compound yields, daily on-chain settlements, and zero hardware maintenance.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {!isConnected && (
              <button
                onClick={openConnectModal}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-lg hover:brightness-110"
              >
                <Wallet size={16} /> Connect Web3 Wallet
              </button>
            )}
          </div>
        </div>

        {/* Global Performance Stats */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-border/80 pt-6">
          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
            <span className="text-xs font-semibold text-muted-foreground">Total Value Staked</span>
            <p className="mt-1 font-mono-ui text-xl sm:text-2xl font-extrabold text-foreground">
              $2,571,500,000
            </p>
            <span className="text-[11px] text-emerald-400 font-bold">+4.2% this week</span>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
            <span className="text-xs font-semibold text-muted-foreground">Active Hashrate</span>
            <p className="mt-1 font-mono-ui text-xl sm:text-2xl font-extrabold text-foreground">
              6.07 EH/s
            </p>
            <span className="text-[11px] text-primary font-bold">100% SLA Uptime</span>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
            <span className="text-xs font-semibold text-muted-foreground">Your Active Commitments</span>
            <p className="mt-1 font-mono-ui text-xl sm:text-2xl font-extrabold text-primary">
              {money(totalPrincipal)}
            </p>
            <span className="text-[11px] text-muted-foreground font-semibold">
              {runningSessions.length} active session{runningSessions.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
            <span className="text-xs font-semibold text-muted-foreground">Claimed Yield Balance</span>
            <p className="mt-1 font-mono-ui text-xl sm:text-2xl font-extrabold text-emerald-400">
              {money(rewardsBalance)}
            </p>
            <span className="text-[11px] text-emerald-400 font-bold">Available in Wallet</span>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-sm font-semibold transition animate-rise ${
            notice.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-primary/30 bg-primary/10 text-primary'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['All', 'Staking', 'Pool', 'Cloud mining'] as const).map((kind) => (
            <button
              key={kind}
              onClick={() => setFilter(kind)}
              className={`rounded-xl border px-4 py-2 text-xs font-extrabold transition ${
                filter === kind
                  ? 'border-primary bg-primary text-primary-foreground shadow-md'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {kind}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <ShieldCheck size={15} className="text-primary" /> Verified Smart Contracts & Audited Infrastructure
        </div>
      </div>

      {/* Offerings Grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {visibleOffers.map((offer) => {
          const session = sessions[offer.id] || {
            active: false,
            principal: 0,
            rewards: 0,
            durationDays: 0,
            autoCompound: true,
            startedAt: 0,
          };
          const isMining = offer.kind !== 'Staking';

          return (
            <div
              key={offer.id}
              className={`surface relative flex flex-col justify-between rounded-3xl border p-5 transition-all duration-300 hover:border-primary/50 hover:shadow-xl ${
                session.active ? 'border-emerald-500/50 bg-[#0e141c]' : 'border-border'
              }`}
            >
              {session.active && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Generating Yield
                </div>
              )}

              <div>
                {/* Header */}
                <div className="flex items-start gap-3">
                  <MiningOfferLogo ticker={offer.ticker} name={offer.name} color={offer.color} />
                  <div>
                    <h3 className="font-extrabold text-base text-white">{offer.name}</h3>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {offer.ticker} · {offer.network}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs leading-5 text-muted-foreground line-clamp-2">
                  {offer.detail}
                </p>

                {/* Metrics Box */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl border border-border/80 bg-background/60 p-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {isMining ? 'Est. Annualized' : 'Validator APY'}
                    </span>
                    <p className="mt-0.5 font-mono-ui text-xl font-extrabold text-primary">
                      {offer.baseApy.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {isMining ? 'Pool Hashrate' : 'Pool Liquidity'}
                    </span>
                    <p className="mt-0.5 font-mono-ui text-sm font-extrabold text-foreground truncate">
                      {offer.totalPoolValue}
                    </p>
                  </div>
                </div>

                {/* Active Session Info if running */}
                {session.active && (
                  <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Allocated Principal:</span>
                      <span className="font-mono-ui font-extrabold text-white">
                        {session.principal} {offer.unit}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Accrued Rewards:</span>
                      <span className="font-mono-ui font-extrabold text-emerald-400">
                        {money(session.rewards, 4)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 space-y-2 border-t border-border/80 pt-4">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                  <span>Min: {offer.minimum} {offer.unit}</span>
                  <span>{offer.period}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {session.active ? (
                    <>
                      <button
                        onClick={() => handleStopStake(offer)}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Square size={13} /> Unstake
                      </button>
                      <button
                        onClick={() => handleClaim(offer)}
                        disabled={session.rewards <= 0}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 disabled:opacity-40"
                      >
                        <Gift size={13} /> Claim
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setSelectedOffer(offer);
                          setStakeAmount(String(offer.minimum * 5));
                        }}
                        className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:brightness-110"
                      >
                        <Play size={14} /> {isMining ? 'Join Mining Pool' : 'Stake Now'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stake/Mine Configuration Modal */}
      {selectedOffer && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="surface relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-primary/25 bg-[#0e1117] p-6 sm:p-7 shadow-2xl animate-rise">
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <MiningOfferLogo
                  ticker={selectedOffer.ticker}
                  name={selectedOffer.name}
                  color={selectedOffer.color}
                />
                <div>
                  <h3 className="text-lg font-extrabold text-white">{selectedOffer.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Base APY: <span className="font-bold text-primary">{selectedOffer.baseApy}%</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOffer(null)}
                className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Commitment Amount */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Deposit Commitment ({selectedOffer.unit})
                </label>
                <div className="relative mt-2">
                  <input
                    type="number"
                    min={selectedOffer.minimum}
                    step="any"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder={`Min ${selectedOffer.minimum}`}
                    className="w-full rounded-2xl border border-border bg-background/80 px-4 py-3.5 font-mono-ui text-base font-bold text-white outline-none focus:border-primary"
                  />
                  <span className="absolute right-4 top-3.5 text-xs font-bold text-primary">
                    {selectedOffer.unit}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  {[selectedOffer.minimum, selectedOffer.minimum * 5, selectedOffer.minimum * 20, selectedOffer.minimum * 50].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setStakeAmount(String(preset))}
                      className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lockup Duration */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Lockup Term & APY Boost
                </label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[
                    { days: 0, label: 'Flexible', boost: '+0%' },
                    { days: 30, label: '30 Days', boost: '+0.8%' },
                    { days: 60, label: '60 Days', boost: '+1.8%' },
                    { days: 90, label: '90 Days', boost: '+3.2%' },
                  ].map((term) => (
                    <button
                      key={term.days}
                      type="button"
                      onClick={() => setLockupDays(term.days)}
                      className={`flex flex-col items-center rounded-xl border p-2 text-center transition ${
                        lockupDays === term.days
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="text-xs font-extrabold">{term.label}</span>
                      <span className="mt-0.5 text-[10px] font-bold text-emerald-400">{term.boost}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-Compound Toggle */}
              <div className="flex items-center justify-between rounded-2xl border border-border bg-background/60 p-3.5">
                <div className="flex items-center gap-2.5">
                  <RefreshCw size={16} className="text-primary" />
                  <div>
                    <p className="text-xs font-bold text-white">Auto-Restake Daily Yield</p>
                    <p className="text-[11px] text-muted-foreground">
                      Reinvest rewards automatically to maximize compounding APY
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoCompound}
                  onChange={(e) => setAutoCompound(e.target.checked)}
                  className="h-5 w-5 accent-primary cursor-pointer"
                />
              </div>

              {/* Projected Yield Calculation */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>Effective APY:</span>
                  <span className="font-mono-ui font-extrabold text-primary">
                    {(selectedOffer.baseApy + (lockupDays === 90 ? 3.2 : lockupDays === 60 ? 1.8 : lockupDays === 30 ? 0.8 : 0)).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>Est. Monthly Yield:</span>
                  <span className="font-mono-ui font-extrabold text-white">
                    {money(
                      ((parseFloat(stakeAmount) || 0) *
                        (selectedOffer.baseApy + (lockupDays === 90 ? 3.2 : lockupDays === 60 ? 1.8 : lockupDays === 30 ? 0.8 : 0))) /
                        100 /
                        12
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>Est. Annual Return:</span>
                  <span className="font-mono-ui text-base font-extrabold text-emerald-400">
                    {money(
                      ((parseFloat(stakeAmount) || 0) *
                        (selectedOffer.baseApy + (lockupDays === 90 ? 3.2 : lockupDays === 60 ? 1.8 : lockupDays === 30 ? 0.8 : 0))) /
                        100
                    )}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="button"
                onClick={() => handleStartStake(selectedOffer)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg hover:brightness-110"
              >
                <CheckCircle2 size={16} /> Confirm Allocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
