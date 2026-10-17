import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Cpu, Pickaxe, ShieldCheck, Zap, Play, Square, Gift } from 'lucide-react';

type MiningOffer = {
  id: string;
  name: string;
  ticker: string;
  kind: 'Staking' | 'Pool' | 'Cloud mining';
  apy: number;
  minimum: number;
  period: string;
  status: 'Available' | 'Limited';
  color: string;
  detail: string;
};

const offers: MiningOffer[] = [
  { id: 'eth-stake', name: 'Ethereum Staking', ticker: 'ETH', kind: 'Staking', apy: 3.4, minimum: 0.01, period: 'Flexible', status: 'Available', color: '#8797f5', detail: 'Ethereum staking session' },
  { id: 'sol-stake', name: 'Solana Staking', ticker: 'SOL', kind: 'Staking', apy: 6.2, minimum: 0.1, period: 'Flexible', status: 'Available', color: '#9a83f7', detail: 'Solana staking session' },
  { id: 'atom-stake', name: 'Cosmos Staking', ticker: 'ATOM', kind: 'Staking', apy: 12.1, minimum: 1, period: '21-day unbonding', status: 'Available', color: '#a7b4d7', detail: 'Cosmos staking session' },
  { id: 'btc-pool', name: 'Bitcoin Pool', ticker: 'BTC', kind: 'Pool', apy: 0, minimum: 10, period: 'Daily settlement', status: 'Available', color: '#f4b740', detail: 'Bitcoin mining pool session' },
  { id: 'ltc-pool', name: 'Litecoin Pool', ticker: 'LTC', kind: 'Pool', apy: 0, minimum: 5, period: 'Daily settlement', status: 'Limited', color: '#9da5b2', detail: 'Litecoin mining pool session' },
  { id: 'cloud-sha', name: 'SHA-256 Cloud Hashrate', ticker: 'TH/s', kind: 'Cloud mining', apy: 0, minimum: 25, period: '90 days', status: 'Available', color: '#f0c95c', detail: 'SHA-256 mining session' },
];

const cryptoLogoUrls: Record<string, string> = {
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  ATOM: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  LTC: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
  'TH/s': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
};

function MiningOfferLogo({ ticker, name, color }: { ticker: string; name: string; color: string }) {
  const [failed, setFailed] = useState(false);
  const src = cryptoLogoUrls[ticker] ?? cryptoLogoUrls.BTC;
  if (failed) return <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background/70" aria-label={`${name} logo fallback`}><Cpu size={21} style={{ color }} /></div>;
  return <img src={src} alt={`${name} logo`} width={48} height={48} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded-full border border-white/10 bg-[#111318] p-1.5 object-contain shadow-sm" />;
}

const money = (n: number, digits = 2) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits }).format(n);

export function MiningDashboard() {
  const [filter, setFilter] = useState<'All' | MiningOffer['kind']>('All');
  const [selected, setSelected] = useState('eth-stake');
  const [amount, setAmount] = useState('1000');
  const [sessions, setSessions] = useState<Record<string, { active: boolean; rewards: number; startedAt: number }>>({});
  const [demoBalance, setDemoBalance] = useState(0);
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);
  const active = offers.find((offer) => offer.id === selected) ?? offers[0];
  const principal = Math.max(0, Number(amount) || 0);
  const projected = useMemo(() => principal * active.apy / 100, [principal, active.apy]);
  const visible = offers.filter((offer) => filter === 'All' || offer.kind === filter);
  const runningCount = Object.values(sessions).filter(s => s.active).length;

  useEffect(() => {
    const timer = window.setInterval(() => setTick(n => n + 1), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const startSession = (offer: MiningOffer) => {
    setSessions(current => {
      const previous = current[offer.id];
      return { ...current, [offer.id]: { active: true, rewards: previous?.rewards ?? 0, startedAt: previous?.startedAt ?? Date.now() } };
    });
    setNotice(`${offer.ticker} demo session started`);
  };

  const stopSession = (offer: MiningOffer) => {
    setSessions(current => ({ ...current, [offer.id]: { ...(current[offer.id] ?? { rewards: 0, startedAt: Date.now() }), active: false } }));
    setNotice(`${offer.ticker} session paused`);
  };

  const claimRewards = (offer: MiningOffer) => {
    const session = sessions[offer.id];
    if (!session || session.rewards <= 0) {
      setNotice('No demo rewards to claim yet');
      return;
    }
    const claimed = session.rewards;
    setDemoBalance(balance => balance + claimed);
    setSessions(current => ({ ...current, [offer.id]: { ...current[offer.id], rewards: 0 } }));
    setNotice(`${money(claimed)} demo rewards added to this screen's demo balance`);
  };

  return <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-primary"><Pickaxe size={15} /> Earn & Mining</div><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mining & Staking</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Manage interactive mining and staking demo sessions.</p></div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Interactive demo mode"><ShieldCheck size={15} className="text-primary/80" /><span>Interactive demo</span></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-semibold text-muted-foreground">Available offerings</p><p className="mt-2 text-2xl font-extrabold">{offers.length}</p><p className="mt-1 text-xs text-muted-foreground">Staking, pools and cloud hashrate</p></div>
      <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-semibold text-muted-foreground">Active sessions</p><p className="mt-2 text-2xl font-extrabold text-emerald-400">{runningCount}</p><p className="mt-1 text-xs text-muted-foreground">Currently running on this screen</p></div>
      <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-semibold text-muted-foreground">Demo rewards balance</p><p className="mt-2 text-2xl font-extrabold text-primary">{money(demoBalance)}</p><p className="mt-1 text-xs text-muted-foreground">Claimed demo rewards</p></div>
    </div>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Zap size={21} /></div><div><h2 className="text-lg font-extrabold">Staking reward estimator</h2><p className="mt-1 text-sm text-muted-foreground">Adjust the principal to explore estimated annual rewards.</p></div></div>
      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1fr_1fr] md:items-end">
        <label className="block text-sm font-semibold">Staking asset<select value={active.id} onChange={e => setSelected(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-foreground outline-none focus:border-primary">{offers.filter(o => o.kind === 'Staking').map(o => <option key={o.id} value={o.id}>{o.name} · {o.apy}% APY</option>)}</select></label>
        <label className="block text-sm font-semibold">Principal (USD)<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" type="number" min="0" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-foreground outline-none focus:border-primary" /></label>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-semibold text-muted-foreground">Estimated annual rewards</p><p className="mt-1 text-2xl font-extrabold text-primary">{money(projected)}</p><p className="mt-1 text-xs text-muted-foreground">At {active.apy.toFixed(1)}% APY</p></div>
      </div>
    </section>
    {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><span>{notice}</span><button className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
    <div className="flex flex-wrap items-center gap-2">{(['All', 'Staking', 'Pool', 'Cloud mining'] as const).map(kind => <button key={kind} onClick={() => setFilter(kind)} className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${filter === kind ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>{kind}</button>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      {visible.map(offer => {
        const session = sessions[offer.id] ?? { active: false, rewards: 0, startedAt: 0 };
        const simulatedRate = offer.kind === 'Staking' ? Math.max(0.01, (Number(amount) || 1000) * offer.apy / 100 / 365 / 24 / 20) : offer.ticker === 'BTC' ? 0.025 : offer.ticker === 'LTC' ? 0.012 : 0.008;
        const liveRewards = session.rewards + (session.active ? simulatedRate * tick : 0);
        const hashRate = offer.kind === 'Staking' ? null : (offer.ticker === 'BTC' ? 650 : offer.ticker === 'LTC' ? 1.2 : 10) * (session.active ? 1 + (tick % 7) / 100 : 1);
        return <article key={offer.id} className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40">
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><MiningOfferLogo ticker={offer.ticker} name={offer.name} color={offer.color} /><div className="min-w-0"><h3 className="font-extrabold">{offer.name}</h3><p className="mt-1 text-xs text-muted-foreground">{offer.ticker} · {offer.kind}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${session.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{session.active ? 'Active' : 'Inactive'}</span></div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{offer.detail}</p>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-background/70 p-3"><p className="text-[11px] font-semibold text-muted-foreground">{offer.kind === 'Staking' ? 'APY' : 'Hash rate'}</p><p className="mt-1 font-extrabold">{offer.kind === 'Staking' ? `${offer.apy.toFixed(1)}%` : `${hashRate?.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${offer.ticker === 'LTC' ? 'PH/s' : offer.ticker === 'BTC' ? 'EH/s' : 'TH/s'}`}</p></div><div className="rounded-xl bg-background/70 p-3"><p className="text-[11px] font-semibold text-muted-foreground">Session rewards</p><p className="mt-1 font-extrabold text-primary">{money(liveRewards, 6)}</p></div></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><span className="text-xs text-muted-foreground">{offer.period}</span><div className="flex flex-wrap gap-2">{session.active ? <button onClick={() => stopSession(offer)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"><Square size={13} /> Stop</button> : <button onClick={() => startSession(offer)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"><Play size={13} /> {offer.kind === 'Staking' ? 'Stake Now' : 'Start Mining'}</button>}<button onClick={() => claimRewards(offer)} disabled={liveRewards <= 0} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"><Gift size={13} /> Claim Rewards</button><button onClick={() => setSelected(offer.id)} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">Details <ArrowUpRight size={14} /></button></div></div>
        </article>;
      })}
    </div>
  </div>;
}
