import { useEffect, useMemo, useRef, useState } from 'react';
import { TradingPage } from './Trading';
import type * as React from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, BarChart3, Bell, Check, ChevronDown, ChevronRight,
  Clipboard, Copy, Eye, EyeOff, FileCheck2, Fingerprint, Home as HomeIcon, Landmark, LineChart,
  Lock, Mail, Menu, MessageCircle, Phone, RefreshCw, Search, Send, Settings2, ShieldCheck, Smartphone,
  Sparkles, TrendingDown, TrendingUp, Upload, Wallet, X, Zap,
} from 'lucide-react';
import {
  getGetActivityQueryKey, getGetFxRatesQueryKey, getGetMarketDetailQueryKey, getGetMarketSummaryQueryKey, getGetPortfolioQueryKey,
  getGetProfileQueryKey, getGetReferralQueryKey, getGetMiningPlaceQueryKey, getGetMiningInvestmentsQueryKey,
  useCreateDeposit, useCreateReferralShare, useCreateSend, useCreateSwap, useCreateWithdrawal,
  useGetActivity, useGetFxRates, useGetMarketDetail, useGetMarketSummary, useGetNotifications, useGetPortfolio, useGetProfile,
  useGetReferral, useSubmitKyc, useUpdateProfile,
  useSetupTotp, useVerifyTotp, useDisableTotp,
  useListPasskeys, useBeginPasskeyRegistration, useFinishPasskeyRegistration, useDeletePasskey,
  useSendSmsOtp, useVerifySmsOtp,
  useGetSupportMessages, useSendSupportMessage, getGetSupportMessagesQueryKey,
  useGetMiningPlace, useGetMiningInvestments, useCreateMiningInvestment,
} from '@workspace/api-client-react';
import type { MarketAsset, MiningPlaceAsset } from '@workspace/api-client-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { getMarketLogoFile } from '@/market-logos';
import { getMiningLogoFile } from '@/mining-logos';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import teamPhoto from '@assets/image_2026-08-14_02-07-24_1786697034785.png';
import fanPhoto from '@assets/image_2026-08-14_02-07-25_(10)_1786697034786.png';
import teamCollage from '@assets/image_2026-08-14_02-07-25_(9)_1786697034788.png';
import leadershipNicolas from '@assets/image_2026-08-14_02-07-25_(8)_1786697034789.png';
import leadershipPeter from '@assets/image_2026-08-14_02-07-25_(7)_1786697034789.png';
import leadershipNic from '@assets/image_2026-08-14_02-07-25_(6)_1786697034790.png';
import leadershipTom from '@assets/image_2026-08-14_02-07-25_(5)_1786697034791.png';
import leadershipJim from '@assets/image_2026-08-14_02-07-25_(4)_1786697034794.png';
import leadershipManuel from '@assets/image_2026-08-14_02-07-25_(3)_1786697034796.png';
import leadershipLandon from '@assets/image_2026-08-14_02-07-25_(2)_1786697034796.png';
import leadershipTimothy from '@assets/image_2026-08-14_02-07-25_1786697034798.png';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the workspace environment.');
}
const currencies = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY',
  'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'NZD', 'MXN', 'INR',
  'BRL', 'KRW', 'ZAR', 'THB', 'MYR', 'IDR', 'PHP', 'AED',
  'SAR', 'TRY', 'PLN', 'CZK', 'HUF', 'RON', 'MMK',
];
const depositAssets = [
  { symbol: 'BTC', name: 'Bitcoin', color: '#f6ad3c' },
  { symbol: 'USDT', name: 'Tether', color: '#4bbd91' },
  { symbol: 'ETH', name: 'Ethereum', color: '#9a9cf5' },
  { symbol: 'USDC', name: 'USD Coin', color: '#4b9cdd' },
  { symbol: 'DAI', name: 'Dai', color: '#f0b84a' },
  { symbol: 'FDUSD', name: 'First Digital USD', color: '#7ca8ff' },
  { symbol: 'BNB', name: 'BNB', color: '#f2ca52' },
];

function money(value = 0, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    // Fallback for unsupported currency codes (e.g. MMK in some environments)
    return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`;
  }
}
function compact(value = 0) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}
function pct(value = 0) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`; }
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function iconForActivity(type: string) {
  if (type === 'deposit') return <ArrowDownLeft size={17} />;
  if (type === 'send') return <Send size={17} />;
  if (type === 'withdrawal') return <ArrowUpRight size={17} />;
  if (type === 'convert') return <ArrowLeftRight size={17} />;
  return type === 'buy' ? <TrendingUp size={17} /> : <TrendingDown size={17} />;
}
function initials(name = 'North State User') { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(); }

function NorthStateMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="North State Blockchain">
      <rect width="36" height="36" rx="9" fill="#0c0d10"/>
      <path d="M8 27 L8 9 L26 27 L26 9" stroke="#cfa230" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="30" y1="4.5" x2="30" y2="8.5" stroke="#cfa230" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="28" y1="6.5" x2="32" y2="6.5" stroke="#cfa230" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  );
}
function Logo({ compact: isCompact = false }: { compact?: boolean }) {
  return <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
    <NorthStateMark size={36} />
    {!isCompact && <span className="text-[15px] font-extrabold tracking-[-.04em] text-foreground"><span>NORTH STATE</span><span className="ml-1 text-primary">BLOCKCHAIN</span></span>}
  </Link>;
}

function Button({ children, variant = 'primary', className = '', ...props }: { children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: 'bg-primary text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/.16)] hover:brightness-110',
    secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-muted',
    ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
    danger: 'bg-destructive/15 text-destructive border border-destructive/25 hover:bg-destructive/25',
  };
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>{children}</button>;
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="grid gap-2 text-sm font-semibold text-foreground">{label}<input {...props} className={`h-11 rounded-xl border border-input bg-background/70 px-3.5 text-sm font-medium outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 ${props.className ?? ''}`} /></label>;
}
function SelectField({ label, children, ...props }: { label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <label className="grid gap-2 text-sm font-semibold text-foreground">{label}<select {...props} className="h-11 rounded-xl border border-input bg-background/70 px-3.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">{children}</select></label>;
}

function LoadingState({ lines = 4 }: { lines?: number }) {
  return <div className="grid gap-3 animate-pulse" data-testid="loading-state">{Array.from({ length: lines }).map((_, index) => <div key={index} className={`h-12 rounded-xl bg-secondary/70 ${index === 0 ? 'w-3/5' : 'w-full'}`} />)}</div>;
}
function ErrorState({ retry }: { retry: () => void }) {
  return <div className="surface rounded-2xl p-7 text-center" data-testid="error-state"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-destructive/15 text-destructive"><Zap size={18} /></div><h3 className="font-bold">We could not load this view</h3><p className="mt-1 text-sm text-muted-foreground">Check your connection and try once more.</p><Button variant="secondary" onClick={retry} className="mt-5" data-testid="button-retry">Try again</Button></div>;
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="surface rounded-2xl p-9 text-center" data-testid="empty-state"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles size={22} /></div><h3 className="font-bold">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p></div>;
}

function Modal({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/78 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="dialog-overlay">
    <div className="surface max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 sm:p-7 animate-rise" data-testid="dialog-panel">
      <div className="mb-6 flex items-start justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-1 text-xl font-extrabold tracking-[-.03em]">{title}</h2></div><button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close dialog" data-testid="button-close-dialog"><X size={18} /></button></div>
      {children}
    </div>
  </div>;
}

function PublicNav() {
  return <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 lg:px-8"><Logo /><nav className="hidden items-center gap-8 text-sm font-semibold text-muted-foreground md:flex"><a href="#how-it-works" className="transition hover:text-foreground">How it works</a><a href="#security" className="transition hover:text-foreground">Security</a><Link href="/about" className="transition hover:text-foreground" data-testid="link-public-about">About us</Link><Link href="/markets" className="transition hover:text-foreground" data-testid="link-public-markets">Markets</Link><Link href="/mining-place" className="transition hover:text-foreground" data-testid="link-public-mining">Mining Place</Link></nav><div className="flex items-center gap-2"><Link href="/sign-in" className="hidden rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground sm:inline-flex" data-testid="link-public-sign-in">Sign in</Link><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/.15)]" data-testid="link-public-sign-up">Open an account <ArrowUpRight size={15} /></Link></div></header>;
}

function Home() {
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (isSignedIn) setLocation('/dashboard'); }, [isSignedIn]);
  return <main className="min-h-[100dvh] overflow-hidden"><PublicNav /><section className="relative mx-auto max-w-7xl px-5 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-24">
    <div className="pointer-events-none absolute -right-40 top-0 h-[520px] w-[520px] rounded-full bg-primary/10 blur-3xl" />
    <div className="relative grid items-center gap-14 lg:grid-cols-[1.02fr_.98fr]">
      <div className="animate-rise"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary pulse-line" />A calmer way to hold digital assets</div><h1 className="max-w-2xl text-balance text-5xl font-extrabold leading-[.98] tracking-[-.07em] text-foreground sm:text-7xl">Your money, with <span className="text-primary">North State Blockchain.</span></h1><p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">North State Blockchain gives everyday investors a clear view of their crypto, with simple wallet actions and honest market context.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground" data-testid="link-hero-get-started">Get started <ArrowUpRight size={16} /></Link><Link href="/markets" className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-5 py-3 text-sm font-bold text-foreground hover:bg-secondary" data-testid="link-hero-explore-markets">Explore markets <LineChart size={16} /></Link></div><div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" />Bank-grade controls</span><span className="flex items-center gap-2"><Check size={15} className="text-primary" />Transparent fees</span></div></div>
      <div className="animate-rise-2 relative"><div className="surface grid-lines relative overflow-hidden rounded-3xl p-4 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">Portfolio snapshot</p><p className="mt-1 text-xs text-muted-foreground">A clear view, at a glance</p></div><span className="rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 font-mono-ui text-[10px] font-medium text-primary">LIVE</span></div><div className="rounded-2xl border border-border/70 bg-background/55 p-5"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold text-muted-foreground">Total balance</p><p className="mt-2 text-3xl font-extrabold tracking-[-.05em]">$24,680<span className="text-muted-foreground">.42</span></p></div><span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">+8.42%</span></div><div className="mt-7 h-28"><HeroChart /></div><div className="mt-4 flex justify-between text-[10px] font-mono-ui text-muted-foreground"><span>FEB 08</span><span>MAR 08</span><span>APR 08</span><span>MAY 08</span></div></div><div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-border/70 bg-background/45 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[#f6ad3c]" />BTC</div><p className="mt-2 font-mono-ui text-sm font-medium">$11,208.44</p></div><div className="rounded-2xl border border-border/70 bg-background/45 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[#9a9cf5]" />ETH</div><p className="mt-2 font-mono-ui text-sm font-medium">$6,892.10</p></div></div></div><div className="absolute -bottom-5 -left-5 rounded-2xl border border-primary/20 bg-[#171209] p-4 shadow-xl sm:-left-10"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary"><ShieldCheck size={18} /></div><div><p className="text-xs font-bold">Protected by design</p><p className="mt-0.5 text-[10px] text-muted-foreground">Your keys. Your control.</p></div></div></div></div>
    </div>
  </section><section id="how-it-works" className="border-y border-border/70 bg-background/25"><div className="mx-auto grid max-w-7xl gap-7 px-5 py-14 md:grid-cols-3 lg:px-8"><div><p className="eyebrow">Built for clarity</p><h2 className="mt-3 text-2xl font-extrabold tracking-[-.04em]">The important parts are easy to find.</h2></div>{[['01','See the whole picture','One balance that includes every supported holding, not a maze of wallet addresses.'],['02','Move with confidence','Deposit, send, and withdraw with clear confirmations before anything leaves.'],['03','Stay grounded','Market data and performance context that keeps the noise in its place.']].map(([number,title,detail]) => <div key={number} className="border-l border-primary/30 pl-5"><p className="font-mono-ui text-xs text-primary">{number}</p><h3 className="mt-3 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></div>)}</div></section><section id="security" className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[.8fr_1.2fr] lg:px-8"><div><p className="eyebrow">A steady hand</p><h2 className="mt-3 max-w-lg text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">Complex infrastructure. Plain-English decisions.</h2><p className="mt-5 max-w-md leading-7 text-muted-foreground">From your first deposit to your hundredth market check, North State Blockchain makes every step legible. No hype. No hidden corners.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="surface rounded-2xl p-5"><ShieldCheck className="text-primary" size={21} /><h3 className="mt-5 font-bold">Security you can see</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Verification and transaction states are always visible, so you know where you stand.</p></div><div className="surface rounded-2xl p-5"><BarChart3 className="text-accent" size={21} /><h3 className="mt-5 font-bold">Markets without the theater</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Useful movement, useful numbers, and enough context to make your own call.</p></div></div></section><footer className="border-t border-border/70 px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-xs text-muted-foreground sm:flex-row"><Logo /><span>North State Blockchain · Digital assets, made legible.</span></div></footer></main>;
}
function HeroChart() { return <svg viewBox="0 0 500 130" className="h-full w-full" preserveAspectRatio="none" aria-label="Portfolio trend"><defs><linearGradient id="heroFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#cfa230" stopOpacity=".22" /><stop offset="1" stopColor="#cfa230" stopOpacity="0" /></linearGradient></defs><path d="M0 108 C35 104 45 92 73 95 C108 99 114 66 148 76 C180 85 190 46 221 60 C255 75 274 38 301 47 C335 59 342 24 369 31 C405 41 422 18 452 20 C471 21 488 7 500 10 L500 130 L0 130Z" fill="url(#heroFill)" /><path d="M0 108 C35 104 45 92 73 95 C108 99 114 66 148 76 C180 85 190 46 221 60 C255 75 274 38 301 47 C335 59 342 24 369 31 C405 41 422 18 452 20 C471 21 488 7 500 10" fill="none" stroke="#cfa230" strokeWidth="2.5" /></svg>; }

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const node = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = node.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={node} className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}>{children}</div>;
}

const leadership = [
  { name: 'Nicolas Brand', role: 'Investor, Director', image: leadershipNicolas },
  { name: 'Peter Smith', role: 'CEO, Co-Founder & Executive Chairman', image: leadershipPeter },
  { name: 'Nic Cary', role: 'Vice Chairman & Co-Founder', image: leadershipNic },
  { name: 'Tom Horton', role: 'Lead Director', image: leadershipTom },
  { name: 'Jim Messina', role: 'Director', image: leadershipJim },
  { name: 'Manuel Stotz', role: 'Investor, Director', image: leadershipManuel },
  { name: 'Landon Edmond', role: 'Independent Director', image: leadershipLandon },
  { name: 'Timothy Flynn', role: 'Independent Director', image: leadershipTimothy },
];

function PortraitCard({ person }: { person: (typeof leadership)[number] }) {
  return <article className="group overflow-hidden rounded-2xl border border-border/80 bg-card/65" data-testid={`card-leader-${person.name.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="relative aspect-[4/4.6] overflow-hidden bg-secondary"><img src={person.image} alt={person.name} className="h-full w-full object-cover grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-0" /><div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#061327]/90 to-transparent" /></div>
    <div className="p-4"><h3 className="text-sm font-extrabold">{person.name}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{person.role}</p></div>
  </article>;
}

function About() {
  return <main className="min-h-[100dvh] overflow-hidden"><PublicNav />
    <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-14 lg:px-8 lg:pb-28 lg:pt-24">
      <div className="pointer-events-none absolute -right-40 -top-24 h-[600px] w-[600px] rounded-full bg-primary/10 blur-3xl" />
      <div className="relative grid items-end gap-12 lg:grid-cols-[.95fr_1.05fr]">
        <Reveal><p className="eyebrow">THE MISSION</p><h1 className="mt-5 max-w-xl text-balance text-5xl font-extrabold leading-[.94] tracking-[-.08em] sm:text-7xl">A greater human economic freedom</h1><p className="mt-7 max-w-lg text-lg leading-8 text-muted-foreground">Global crypto infrastructure for people, institutions, and AI</p><div className="mt-8 flex items-center gap-3 text-xs font-bold uppercase tracking-[.16em] text-muted-foreground"><span className="h-px w-10 bg-primary" />Since 2011</div></Reveal>
        <Reveal className="relative"><div className="overflow-hidden rounded-[2rem] border border-border/80 bg-secondary shadow-2xl"><img src={teamCollage} alt="North State Blockchain team gathered together" className="aspect-[1.35/1] w-full object-cover grayscale-[.22]" /><div className="absolute inset-0 bg-gradient-to-tr from-[#061327]/55 via-transparent to-primary/10" /></div><div className="absolute -bottom-6 -left-4 rounded-2xl border border-primary/20 bg-[#171209] px-5 py-4 shadow-xl sm:-left-8"><p className="font-mono-ui text-xl font-medium text-primary">2011</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Founded</p></div></Reveal>
      </div>
    </section>
    <Reveal><section className="border-y border-border/70 bg-[#07172b]"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[.75fr_1.25fr] lg:px-8 lg:py-24"><div><p className="eyebrow">The long view</p><h2 className="mt-4 max-w-sm text-3xl font-extrabold leading-tight tracking-[-.06em]">Infrastructure for the next financial world.</h2></div><div><p className="max-w-3xl text-xl font-medium leading-9 text-foreground sm:text-2xl">Over a decade ago, we saw what blockchain technology could become — it’s why we named our company after it. Today, Blockchain.com is the leading infrastructure provider powering a new financial world.</p><div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border sm:grid-cols-4"><div className="bg-[#0c213a] p-4 sm:p-5"><p className="font-mono-ui text-2xl text-primary">2011</p><p className="mt-2 text-xs text-muted-foreground">Founded</p></div><div className="bg-[#0c213a] p-4 sm:p-5"><p className="font-mono-ui text-2xl text-primary">95M+</p><p className="mt-2 text-xs text-muted-foreground">Wallets created</p></div><div className="bg-[#0c213a] p-4 sm:p-5"><p className="font-mono-ui text-2xl text-primary">$1.1T+</p><p className="mt-2 text-xs text-muted-foreground">Volume moved through our platform</p></div><div className="bg-[#0c213a] p-4 sm:p-5"><p className="font-mono-ui text-2xl text-primary">20+</p><p className="mt-2 text-xs text-muted-foreground">Products across every market cycle</p></div></div></div></div></section></Reveal>
    <Reveal><section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:py-28"><div className="overflow-hidden rounded-[2rem] border border-border/80 bg-secondary"><img src={teamPhoto} alt="Blockchain.com team in a black and white group portrait" className="aspect-[1.1/1] h-full w-full object-cover grayscale" /></div><div className="flex flex-col justify-center"><p className="eyebrow">Built in public</p><h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-.06em] sm:text-4xl">A team for an open financial system.</h2><p className="mt-6 text-base leading-8 text-muted-foreground">We believe the most important financial infrastructure should be understandable, available, and built to last. That conviction brings together builders, operators, investors, and believers from every corner of the world.</p><p className="mt-5 text-base leading-8 text-muted-foreground">Our global team is united by a shared mission: to usher in a brave new world by accelerating the adoption of cryptocurrency and building a more open, accessible, and inclusive economic future for everyone</p><Link href="/sign-up" className="mt-8 inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground" data-testid="link-about-join">Build with us <ArrowUpRight size={16} /></Link></div></section></Reveal>
    <Reveal><section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-28"><div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">The people behind it</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-.06em] sm:text-4xl">Our industry-leading leadership</h2></div><p className="max-w-lg text-sm leading-6 text-muted-foreground">Our board and management team bring more than 200 years of combined experience from the world’s most respected financial institutions, technology companies, and startups.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">{leadership.map((person) => <PortraitCard key={person.name} person={person} />)}</div></section></Reveal>
    <Reveal><section className="border-y border-border/70 bg-[#07172b]"><div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20"><p className="eyebrow">Backed by conviction</p><h2 className="mt-4 text-2xl font-extrabold tracking-[-.05em] sm:text-3xl">Trusted by leading investors</h2><div className="mt-10 grid grid-cols-2 gap-3 text-sm font-bold text-muted-foreground sm:grid-cols-4"><div className="rounded-xl border border-border/70 bg-background/30 px-4 py-5">Lightspeed</div><div className="rounded-xl border border-border/70 bg-background/30 px-4 py-5">Baillie Gifford</div><div className="rounded-xl border border-border/70 bg-background/30 px-4 py-5">Kingsway</div><div className="rounded-xl border border-border/70 bg-background/30 px-4 py-5">Lakestar</div></div></div></section></Reveal>
    <Reveal><section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28"><div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">Our global team</p><h2 className="mt-4 max-w-sm text-3xl font-extrabold leading-tight tracking-[-.06em]">Building the future of finance</h2></div><div><p className="text-xl leading-9 text-foreground sm:text-2xl">Our global team is united by a shared mission: to usher in a brave new world by accelerating the adoption of cryptocurrency and building a more open, accessible, and inclusive economic future for everyone</p><div className="mt-8 overflow-hidden rounded-2xl border border-border/80"><img src={fanPhoto} alt="Fan wearing a Blockchain.com jersey" className="aspect-[2/1] w-full object-cover object-center grayscale-[.18]" /></div></div></div></section></Reveal>
    <Reveal><section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-28"><div className="grid gap-10 rounded-[2rem] border border-primary/20 bg-primary/7 p-7 sm:p-10 lg:grid-cols-[.8fr_1.2fr] lg:p-14"><div><p className="eyebrow">About Blockchain.com</p><h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-.06em] sm:text-4xl">The world’s financial system is being rebuilt in the open.</h2></div><div className="space-y-6 text-sm leading-7 text-muted-foreground"><p className="text-lg font-semibold leading-8 text-foreground">We started our company on the conviction that the world’s finances would run better on crypto.</p><p>Back then, we built the original Blockchain Explorer—the search engine for Bitcoin transactions—and an API that let developers everywhere build on top of it. Our Wallet went on to become the most widely-used in the world, putting self-custody in the hands of millions.</p><p>Today, we’re a market leader powering the next era of finance: the infrastructure layer for the people, institutions, and AI agents moving money on-chain. Retail users, the largest financial firms, crypto-native companies, autonomous agents—they come to us from across the world because crypto is simply better engineered for how money should move. Faster, open, global, permissionless. That’s how we arrive at greater human economic freedom.</p><p className="border-l-2 border-primary pl-4 font-semibold text-foreground">The world’s financial system is being rebuilt in the open. We’re the infrastructure beneath it.</p></div></div></section></Reveal>
    <section className="border-t border-border/70 px-5 py-14 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 sm:flex-row sm:items-center"><div><p className="eyebrow">Find your north star</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-.05em]">A clearer way to move through crypto.</h2></div><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground" data-testid="link-about-get-started">Open an account <ArrowUpRight size={16} /></Link></div></section>
    <footer className="border-t border-border/70 px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-xs text-muted-foreground sm:flex-row"><Logo /><span>North State Blockchain · Digital assets, made legible.</span></div></footer>
  </main>;
}

function AuthPage({ signUp = false }: { signUp?: boolean }) {
  const [submitted, setSubmitted] = useState(false);
  return <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8"><div className="w-full max-w-[440px] animate-rise"><div className="mb-8 flex justify-center"><Logo /></div><div className="surface rounded-3xl p-6 sm:p-8"><div className="mb-7"><p className="eyebrow">{signUp ? 'Start with North State Blockchain' : 'Welcome back'}</p><h1 className="mt-2 text-2xl font-extrabold tracking-[-.05em]">{signUp ? 'A clearer crypto account.' : 'Your portfolio is waiting.'}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{signUp ? 'Create your account with the email or phone you use every day.' : 'Sign in to see your balance, activity, and markets.'}</p></div>{submitted ? <div className="rounded-2xl border border-primary/25 bg-primary/10 p-5 text-center" data-testid="status-auth-success"><div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={19} /></div><h2 className="mt-4 font-bold">{signUp ? 'Check your inbox' : 'Sign-in link sent'}</h2><p className="mt-2 text-sm text-muted-foreground">Your configured account flow will continue from there.</p><Link href="/dashboard" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="link-auth-dashboard">Continue to North State Blockchain</Link></div> : <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}><Field label={signUp ? 'Email or phone' : 'Email or phone'} type="text" placeholder="you@example.com" required data-testid="input-auth-identifier" /><Field label="Password" type="password" placeholder="Enter your password" required data-testid="input-auth-password" />{!signUp && <Link href="/sign-in/forgot-password" className="justify-self-end text-xs font-bold text-primary hover:underline" data-testid="link-forgot-password">Forgot password?</Link>}<Button type="submit" className="mt-2 w-full" data-testid="button-auth-submit">{signUp ? 'Create account' : 'Sign in'} <ArrowUpRight size={16} /></Button><div className="my-1 flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div><Button type="button" variant="secondary" className="w-full" onClick={() => setSubmitted(true)} data-testid="button-auth-continue-email">{signUp ? 'Continue with email' : 'Continue with email'}</Button></form>}<div className="mt-7 border-t border-border pt-5 text-center text-sm text-muted-foreground">{signUp ? 'Already have an account?' : 'New to North State Blockchain?'} <Link href={signUp ? '/sign-in' : '/sign-up'} className="font-bold text-primary hover:underline" data-testid="link-auth-switch">{signUp ? 'Sign in' : 'Create an account'}</Link></div></div><p className="mt-6 text-center text-[11px] leading-5 text-muted-foreground">By continuing, you agree to North State Blockchain's terms and privacy policy.</p></div></main>;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#55dbe1',
    colorForeground: '#eaf3ff',
    colorMutedForeground: '#8fa5bd',
    colorDanger: '#f48b9d',
    colorBackground: '#0b1b32',
    colorInput: '#08172a',
    colorInputForeground: '#eaf3ff',
    colorNeutral: '#29425e',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: '0.9rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#0b1b32] rounded-3xl w-[440px] max-w-full overflow-hidden border border-[#29425e]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#eaf3ff] font-extrabold',
    headerSubtitle: 'text-[#8fa5bd]',
    socialButtonsBlockButtonText: 'text-[#eaf3ff]',
    formFieldLabel: 'text-[#eaf3ff]',
    footerActionLink: 'text-[#55dbe1] font-bold',
    footerActionText: 'text-[#8fa5bd]',
    dividerText: 'text-[#8fa5bd]',
    identityPreviewEditButton: 'text-[#55dbe1]',
    formFieldSuccessText: 'text-[#55dbe1]',
    alertText: 'text-[#eaf3ff]',
    logoBox: 'rounded-2xl',
    logoImage: 'rounded-2xl',
    socialButtonsBlockButton: 'border-[#29425e] bg-[#171209] hover:bg-[#17304e]',
    formButtonPrimary: 'bg-[#55dbe1] text-[#06152a] hover:bg-[#77e5e9] font-extrabold',
    formFieldInput: 'border-[#29425e] bg-[#08172a] text-[#eaf3ff]',
    footerAction: 'border-[#29425e]',
    dividerLine: 'bg-[#29425e]',
    alert: 'border-[#29425e] bg-[#171209]',
    otpCodeFieldInput: 'border-[#29425e] bg-[#08172a] text-[#eaf3ff]',
    formFieldRow: 'text-[#eaf3ff]',
    main: 'bg-transparent',
  },
};

function ClerkAuthPage({ signUp = false }: { signUp?: boolean }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8">
    <div className="w-full max-w-[440px] animate-rise">
      <div className="mb-8 flex justify-center"><Logo /></div>
      {signUp
        ? <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/dashboard`} />
        : <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/dashboard`} />}
      <p className="mt-6 text-center text-[11px] leading-5 text-muted-foreground">North State Blockchain uses secure identity verification to protect every account.</p>
    </div>
  </main>;
}

function KycStatusScreen({ status }: { status: string }) {
  const [, setLocation] = useLocation();
  if (status === 'pending') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-2xl bg-accent/15 text-accent shadow-[0_0_0_8px_hsl(var(--accent)/.08)]">
          <ShieldCheck size={34} strokeWidth={1.5} />
        </div>
        <h2 className="mt-8 text-2xl font-extrabold tracking-tight">Verification Under Review</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">Your identity documents have been submitted and are being reviewed by our compliance team. This usually takes 1–2 business days. You will have full access to your wallet once approved.</p>
        <div className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-accent/25 bg-accent/8 px-6 py-4 text-sm font-bold text-accent">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          KYC Pending Admin Approval
        </div>
        <button onClick={() => setLocation('/settings')} className="mt-5 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">View submission → Settings</button>
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-2xl bg-destructive/15 text-destructive shadow-[0_0_0_8px_hsl(var(--destructive)/.08)]">
          <X size={34} strokeWidth={1.5} />
        </div>
        <h2 className="mt-8 text-2xl font-extrabold tracking-tight">Verification Not Approved</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">Your identity verification was not approved. Please resubmit with a clear, valid government-issued document. Contact support if you need assistance.</p>
        <button onClick={() => setLocation('/settings')} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/.15)]">Resubmit Verification <ArrowUpRight size={16} /></button>
      </div>
    );
  }
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-2xl bg-primary/15 text-primary shadow-[0_0_0_8px_hsl(var(--primary)/.08)]">
        <FileCheck2 size={34} strokeWidth={1.5} />
      </div>
      <h2 className="mt-8 text-2xl font-extrabold tracking-tight">Complete Identity Verification</h2>
      <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">To access your wallet and begin trading, you need to complete a one-time identity check. It only takes a few minutes and keeps your account secure.</p>
      <button onClick={() => setLocation('/settings')} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/.15)]">Start Verification <ArrowUpRight size={16} /></button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { data: profile } = useGetProfile();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifs = useGetNotifications();
  const [lastSeen, setLastSeen] = useState(() => localStorage.getItem('notif-last-seen') ?? '');
  const unreadCount = (notifs.data ?? []).filter(n => n.createdAt > lastSeen).length;
  const openNotifications = () => {
    setNotifOpen(o => !o);
    const ts = new Date().toISOString();
    setLastSeen(ts);
    localStorage.setItem('notif-last-seen', ts);
  };
  const links = [{ href: '/dashboard', label: 'Overview', icon: HomeIcon }, { href: '/markets', label: 'Markets', icon: LineChart }, { href: '/mining-place', label: 'Mining Place', icon: Landmark }, { href: '/activity', label: 'Activity', icon: BarChart3 }, { href: '/trading', label: 'Trading', icon: Zap }, { href: '/settings', label: 'Settings', icon: Settings2 }];
  const verificationStatus = profile?.verificationStatus;
  const isExemptRoute = location === '/settings' || location.startsWith('/settings') || location === '/trading' || location.startsWith('/trading');
  const gatedContent = (!isExemptRoute && verificationStatus && verificationStatus !== 'verified') ? <KycStatusScreen status={verificationStatus} /> : children;
  return <div className="min-h-[100dvh] w-full overflow-x-hidden"><aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}><div className="px-2"><Logo /></div><div className="mt-12"><p className="px-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Workspace</p><nav className="mt-3 grid gap-1">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${location.startsWith(href) ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`} data-testid={`link-nav-${label.toLowerCase()}`}><Icon size={17} />{label}</Link>)}</nav></div><div className="mt-auto rounded-2xl border border-primary/15 bg-primary/7 p-4"><div className="flex items-center gap-2 text-primary"><ShieldCheck size={16} /><span className="text-xs font-bold">Your account is protected</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Keep your sign-in details private. North State Blockchain will never ask for your password.</p></div></aside><div className="lg:pl-[250px]"><header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/85 px-5 backdrop-blur-xl lg:px-8"><button className="rounded-xl p-2 text-muted-foreground hover:bg-secondary lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={20} /></button><div className="hidden text-sm font-semibold text-muted-foreground lg:block">{location === '/dashboard' ? 'Good to see you' : location.replace('/', '').replace('-', ' ')}</div><div className="ml-auto flex items-center gap-3"><div className="relative">
              <button onClick={openNotifications} className="relative rounded-xl p-2 text-muted-foreground hover:bg-secondary" aria-label="Notifications" data-testid="button-notifications">
                <Bell size={18} />
                {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-destructive text-[9px] font-extrabold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-border bg-background shadow-xl animate-rise" data-testid="panel-notifications">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <p className="text-sm font-extrabold">Notifications</p>
                    <button onClick={() => setNotifOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"><X size={15} /></button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-border/70">
                    {notifs.isLoading ? (
                      <div className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</div>
                    ) : !notifs.data || notifs.data.length === 0 ? (
                      <div className="px-4 py-8 text-center"><Bell size={20} className="mx-auto mb-2 text-muted-foreground/40" /><p className="text-xs text-muted-foreground">No notifications yet</p></div>
                    ) : notifs.data.map(n => (
                      <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs ${n.type === 'deposit' ? 'bg-primary/10 text-primary' : n.type === 'withdrawal' || n.type === 'send' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`}>{iconForActivity(n.type)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold capitalize">{n.type} · {n.asset}</p>
                          <p className="text-[10px] text-muted-foreground">{dateLabel(n.createdAt)}</p>
                        </div>
                        <span className={`text-[10px] font-bold capitalize ${n.status === 'completed' ? 'text-[#2db87a]' : n.status === 'failed' ? 'text-destructive' : 'text-accent'}`}>{n.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div><Link href="/settings" className="flex items-center gap-2 rounded-xl border border-border bg-secondary/45 px-2 py-1.5 hover:bg-secondary" data-testid="link-profile-menu"><span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-xs font-extrabold text-primary">{profile?.initials ?? initials(profile?.name)}</span><span className="hidden text-xs font-bold sm:inline">{profile?.name?.split(' ')[0] ?? 'Account'}</span><ChevronDown size={14} className="text-muted-foreground" /></Link></div></header><main className="mx-auto max-w-[1440px] px-5 py-7 lg:px-8 lg:py-9">{gatedContent}</main></div>{mobileOpen && <button className="fixed inset-0 z-30 bg-background/60 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation" />}</div>;
}

function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-.05em]">{title}</h1>{detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

// ─── Security Tab components ──────────────────────────────────────────────────

const COUNTRY_CODES: [string, string][] = [
  // ── North America ─────────────────────────────────────────────────────────
  ['+1',    '🇺🇸 United States (+1)'],
  ['+1',    '🇨🇦 Canada (+1)'],
  ['+52',   '🇲🇽 Mexico (+52)'],
  ['+1787', '🇵🇷 Puerto Rico (+1787)'],
  ['+502',  '🇬🇹 Guatemala (+502)'],
  ['+503',  '🇸🇻 El Salvador (+503)'],
  ['+504',  '🇭🇳 Honduras (+504)'],
  ['+505',  '🇳🇮 Nicaragua (+505)'],
  ['+506',  '🇨🇷 Costa Rica (+506)'],
  ['+507',  '🇵🇦 Panama (+507)'],
  ['+509',  '🇭🇹 Haiti (+509)'],
  ['+1809', '🇩🇴 Dominican Republic (+1809)'],
  ['+53',   '🇨🇺 Cuba (+53)'],
  ['+1876', '🇯🇲 Jamaica (+1876)'],
  ['+1868', '🇹🇹 Trinidad & Tobago (+1868)'],
  ['+1246', '🇧🇧 Barbados (+1246)'],
  ['+1242', '🇧🇸 Bahamas (+1242)'],
  // ── South America ─────────────────────────────────────────────────────────
  ['+55',   '🇧🇷 Brazil (+55)'],
  ['+54',   '🇦🇷 Argentina (+54)'],
  ['+57',   '🇨🇴 Colombia (+57)'],
  ['+56',   '🇨🇱 Chile (+56)'],
  ['+51',   '🇵🇪 Peru (+51)'],
  ['+58',   '🇻🇪 Venezuela (+58)'],
  ['+593',  '🇪🇨 Ecuador (+593)'],
  ['+591',  '🇧🇴 Bolivia (+591)'],
  ['+595',  '🇵🇾 Paraguay (+595)'],
  ['+598',  '🇺🇾 Uruguay (+598)'],
  ['+592',  '🇬🇾 Guyana (+592)'],
  ['+597',  '🇸🇷 Suriname (+597)'],
  // ── Western Europe ────────────────────────────────────────────────────────
  ['+44',   '🇬🇧 United Kingdom (+44)'],
  ['+33',   '🇫🇷 France (+33)'],
  ['+49',   '🇩🇪 Germany (+49)'],
  ['+39',   '🇮🇹 Italy (+39)'],
  ['+34',   '🇪🇸 Spain (+34)'],
  ['+351',  '🇵🇹 Portugal (+351)'],
  ['+31',   '🇳🇱 Netherlands (+31)'],
  ['+32',   '🇧🇪 Belgium (+32)'],
  ['+41',   '🇨🇭 Switzerland (+41)'],
  ['+43',   '🇦🇹 Austria (+43)'],
  ['+353',  '🇮🇪 Ireland (+353)'],
  ['+354',  '🇮🇸 Iceland (+354)'],
  ['+46',   '🇸🇪 Sweden (+46)'],
  ['+47',   '🇳🇴 Norway (+47)'],
  ['+45',   '🇩🇰 Denmark (+45)'],
  ['+358',  '🇫🇮 Finland (+358)'],
  ['+352',  '🇱🇺 Luxembourg (+352)'],
  ['+356',  '🇲🇹 Malta (+356)'],
  ['+357',  '🇨🇾 Cyprus (+357)'],
  ['+30',   '🇬🇷 Greece (+30)'],
  // ── Eastern Europe ────────────────────────────────────────────────────────
  ['+7',    '🇷🇺 Russia (+7)'],
  ['+48',   '🇵🇱 Poland (+48)'],
  ['+420',  '🇨🇿 Czech Republic (+420)'],
  ['+421',  '🇸🇰 Slovakia (+421)'],
  ['+36',   '🇭🇺 Hungary (+36)'],
  ['+40',   '🇷🇴 Romania (+40)'],
  ['+359',  '🇧🇬 Bulgaria (+359)'],
  ['+380',  '🇺🇦 Ukraine (+380)'],
  ['+375',  '🇧🇾 Belarus (+375)'],
  ['+370',  '🇱🇹 Lithuania (+370)'],
  ['+371',  '🇱🇻 Latvia (+371)'],
  ['+372',  '🇪🇪 Estonia (+372)'],
  ['+386',  '🇸🇮 Slovenia (+386)'],
  ['+385',  '🇭🇷 Croatia (+385)'],
  ['+381',  '🇷🇸 Serbia (+381)'],
  ['+387',  '🇧🇦 Bosnia (+387)'],
  ['+389',  '🇲🇰 North Macedonia (+389)'],
  ['+355',  '🇦🇱 Albania (+355)'],
  ['+382',  '🇲🇪 Montenegro (+382)'],
  ['+373',  '🇲🇩 Moldova (+373)'],
  ['+374',  '🇦🇲 Armenia (+374)'],
  ['+994',  '🇦🇿 Azerbaijan (+994)'],
  ['+995',  '🇬🇪 Georgia (+995)'],
  // ── Middle East ───────────────────────────────────────────────────────────
  ['+971',  '🇦🇪 UAE (+971)'],
  ['+966',  '🇸🇦 Saudi Arabia (+966)'],
  ['+965',  '🇰🇼 Kuwait (+965)'],
  ['+974',  '🇶🇦 Qatar (+974)'],
  ['+973',  '🇧🇭 Bahrain (+973)'],
  ['+968',  '🇴🇲 Oman (+968)'],
  ['+972',  '🇮🇱 Israel (+972)'],
  ['+90',   '🇹🇷 Turkey (+90)'],
  ['+98',   '🇮🇷 Iran (+98)'],
  ['+964',  '🇮🇶 Iraq (+964)'],
  ['+962',  '🇯🇴 Jordan (+962)'],
  ['+961',  '🇱🇧 Lebanon (+961)'],
  ['+963',  '🇸🇾 Syria (+963)'],
  ['+967',  '🇾🇪 Yemen (+967)'],
  // ── South Asia ────────────────────────────────────────────────────────────
  ['+91',   '🇮🇳 India (+91)'],
  ['+92',   '🇵🇰 Pakistan (+92)'],
  ['+880',  '🇧🇩 Bangladesh (+880)'],
  ['+94',   '🇱🇰 Sri Lanka (+94)'],
  ['+977',  '🇳🇵 Nepal (+977)'],
  ['+960',  '🇲🇻 Maldives (+960)'],
  ['+975',  '🇧🇹 Bhutan (+975)'],
  ['+93',   '🇦🇫 Afghanistan (+93)'],
  // ── Southeast Asia ────────────────────────────────────────────────────────
  ['+65',   '🇸🇬 Singapore (+65)'],
  ['+60',   '🇲🇾 Malaysia (+60)'],
  ['+66',   '🇹🇭 Thailand (+66)'],
  ['+95',   '🇲🇲 Myanmar (+95)'],
  ['+84',   '🇻🇳 Vietnam (+84)'],
  ['+63',   '🇵🇭 Philippines (+63)'],
  ['+62',   '🇮🇩 Indonesia (+62)'],
  ['+855',  '🇰🇭 Cambodia (+855)'],
  ['+856',  '🇱🇦 Laos (+856)'],
  ['+673',  '🇧🇳 Brunei (+673)'],
  ['+670',  '🇹🇱 Timor-Leste (+670)'],
  // ── East Asia ─────────────────────────────────────────────────────────────
  ['+86',   '🇨🇳 China (+86)'],
  ['+81',   '🇯🇵 Japan (+81)'],
  ['+82',   '🇰🇷 South Korea (+82)'],
  ['+886',  '🇹🇼 Taiwan (+886)'],
  ['+852',  '🇭🇰 Hong Kong (+852)'],
  ['+853',  '🇲🇴 Macau (+853)'],
  ['+976',  '🇲🇳 Mongolia (+976)'],
  // ── Central Asia ──────────────────────────────────────────────────────────
  ['+7',    '🇰🇿 Kazakhstan (+7)'],
  ['+998',  '🇺🇿 Uzbekistan (+998)'],
  ['+996',  '🇰🇬 Kyrgyzstan (+996)'],
  ['+992',  '🇹🇯 Tajikistan (+992)'],
  ['+993',  '🇹🇲 Turkmenistan (+993)'],
  // ── Oceania ───────────────────────────────────────────────────────────────
  ['+61',   '🇦🇺 Australia (+61)'],
  ['+64',   '🇳🇿 New Zealand (+64)'],
  ['+679',  '🇫🇯 Fiji (+679)'],
  ['+675',  '🇵🇬 Papua New Guinea (+675)'],
  ['+685',  '🇼🇸 Samoa (+685)'],
  ['+676',  '🇹🇴 Tonga (+676)'],
  ['+677',  '🇸🇧 Solomon Islands (+677)'],
  ['+678',  '🇻🇺 Vanuatu (+678)'],
  // ── Africa ────────────────────────────────────────────────────────────────
  ['+27',   '🇿🇦 South Africa (+27)'],
  ['+234',  '🇳🇬 Nigeria (+234)'],
  ['+254',  '🇰🇪 Kenya (+254)'],
  ['+233',  '🇬🇭 Ghana (+233)'],
  ['+20',   '🇪🇬 Egypt (+20)'],
  ['+212',  '🇲🇦 Morocco (+212)'],
  ['+213',  '🇩🇿 Algeria (+213)'],
  ['+216',  '🇹🇳 Tunisia (+216)'],
  ['+218',  '🇱🇾 Libya (+218)'],
  ['+251',  '🇪🇹 Ethiopia (+251)'],
  ['+255',  '🇹🇿 Tanzania (+255)'],
  ['+256',  '🇺🇬 Uganda (+256)'],
  ['+250',  '🇷🇼 Rwanda (+250)'],
  ['+260',  '🇿🇲 Zambia (+260)'],
  ['+263',  '🇿🇼 Zimbabwe (+263)'],
  ['+267',  '🇧🇼 Botswana (+267)'],
  ['+265',  '🇲🇼 Malawi (+265)'],
  ['+258',  '🇲🇿 Mozambique (+258)'],
  ['+261',  '🇲🇬 Madagascar (+261)'],
  ['+237',  '🇨🇲 Cameroon (+237)'],
  ['+225',  '🇨🇮 Ivory Coast (+225)'],
  ['+221',  '🇸🇳 Senegal (+221)'],
  ['+223',  '🇲🇱 Mali (+223)'],
  ['+228',  '🇹🇬 Togo (+228)'],
  ['+229',  '🇧🇯 Benin (+229)'],
  ['+226',  '🇧🇫 Burkina Faso (+226)'],
  ['+227',  '🇳🇪 Niger (+227)'],
  ['+235',  '🇹🇩 Chad (+235)'],
  ['+236',  '🇨🇫 Central African Republic (+236)'],
  ['+242',  '🇨🇬 Republic of Congo (+242)'],
  ['+243',  '🇨🇩 DR Congo (+243)'],
  ['+241',  '🇬🇦 Gabon (+241)'],
  ['+240',  '🇬🇶 Equatorial Guinea (+240)'],
  ['+239',  '🇸🇹 São Tomé & Príncipe (+239)'],
  ['+244',  '🇦🇴 Angola (+244)'],
  ['+264',  '🇳🇦 Namibia (+264)'],
  ['+268',  '🇸🇿 Eswatini (+268)'],
  ['+266',  '🇱🇸 Lesotho (+266)'],
  ['+252',  '🇸🇴 Somalia (+252)'],
  ['+253',  '🇩🇯 Djibouti (+253)'],
  ['+291',  '🇪🇷 Eritrea (+291)'],
  ['+249',  '🇸🇩 Sudan (+249)'],
  ['+211',  '🇸🇸 South Sudan (+211)'],
  ['+257',  '🇧🇮 Burundi (+257)'],
  ['+232',  '🇸🇱 Sierra Leone (+232)'],
  ['+231',  '🇱🇷 Liberia (+231)'],
  ['+224',  '🇬🇳 Guinea (+224)'],
  ['+245',  '🇬🇼 Guinea-Bissau (+245)'],
  ['+220',  '🇬🇲 Gambia (+220)'],
  ['+222',  '🇲🇷 Mauritania (+222)'],
  ['+230',  '🇲🇺 Mauritius (+230)'],
  ['+269',  '🇰🇲 Comoros (+269)'],
  ['+248',  '🇸🇨 Seychelles (+248)'],
  ['+238',  '🇨🇻 Cape Verde (+238)'],
];

function SecInput({
  label, type = 'text', value, onChange, placeholder = '', disabled = false, autoComplete = 'off',
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; disabled?: boolean; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className="h-11 w-full rounded-xl border border-input bg-secondary/40 px-3 pr-10 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SecBtn({
  loading = false, onClick, disabled = false, children, variant = 'primary', className = '',
}: {
  loading?: boolean; onClick?: () => void; disabled?: boolean; children: React.ReactNode;
  variant?: 'primary' | 'ghost'; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold transition disabled:opacity-50 ${
        variant === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[.98]'
          : 'border border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
      } ${className}`}
    >
      {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

function FormMsg({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold leading-5 ${
      type === 'success'
        ? 'border-primary/20 bg-primary/8 text-primary'
        : 'border-destructive/25 bg-destructive/8 text-destructive'
    }`}>
      <span className="mt-px shrink-0">{type === 'success' ? <Check size={13} /> : <X size={13} />}</span>
      {msg}
    </div>
  );
}

function SecurityRow({
  id, icon, title, badge, open, onToggle, children,
}: {
  id: string; icon: React.ReactNode; title: string; badge?: React.ReactNode;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`transition-colors ${open ? 'bg-primary/[.03]' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6 sm:py-5 transition-colors ${!open ? 'hover:bg-secondary/40' : ''}`}
        data-testid={`button-security-${id}`}
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${open ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">{title}</p>
          {badge !== undefined && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{badge}</p>
          )}
        </div>
        <ChevronRight size={16} className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border/60 px-5 pb-6 pt-5 sm:px-6">
          {children}
        </div>
      )}
    </div>
  );
}

// ── WebAuthn helpers ──────────────────────────────────────────────────────────
function b64urlToBytes(b64: string): Uint8Array {
  const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}
function bytesToB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac Touch ID';
  if (/Win/.test(ua)) return 'Windows Hello';
  return 'Security Key';
}

function SmsOtpBoxes({ digits, onChange }: { digits: string[]; onChange: (d: string[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const update = (i: number, raw: string) => {
    const ch = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[i] = ch; onChange(next);
    if (ch && i < 5) refs.current[i + 1]?.focus();
  };
  const onKd = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus(); }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = Array(6).fill('') as string[];
    for (let i = 0; i < raw.length; i++) next[i] = raw[i];
    onChange(next);
    refs.current[Math.min(raw.length, 5)]?.focus();
    e.preventDefault();
  };
  return (
    <div className="flex justify-center gap-2" data-testid="sms-otp-boxes">
      {digits.map((d, i) => (
        <input key={i} ref={el => { refs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1}
          value={d} onChange={e => update(i, e.target.value)} onKeyDown={e => onKd(i, e)}
          onPaste={i === 0 ? onPaste : undefined}
          className="h-12 w-10 rounded-xl border border-input bg-secondary/40 text-center text-lg font-mono font-bold outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20 sm:w-11"
          aria-label={`OTP digit ${i + 1}`} data-testid={`input-sms-otp-digit-${i}`} />
      ))}
    </div>
  );
}

function SecurityTab({ profile }: { profile: { name: string; email: string; id: string; verificationStatus: string; twoFactorEnabled?: boolean; smsPhoneNumber?: string | null; smsPhoneVerified?: boolean } | undefined }) {
  const { user } = useUser();
  const qc = useQueryClient();
  type Panel = 'email' | 'phone' | 'password' | '2fa' | 'passkeys' | 'sms' | null;
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setPanel(prev => prev === p ? null : p);

  // ── Email state ──────────────────────────────────────────────────────────
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStep, setEmailStep] = useState<'form' | 'verify'>('form');
  const [emailObj, setEmailObj] = useState<any>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState('');
  const [emailOk, setEmailOk] = useState('');

  // ── Phone state ──────────────────────────────────────────────────────────
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNum, setPhoneNum] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'form' | 'verify'>('form');
  const [phoneObj, setPhoneObj] = useState<any>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneErr, setPhoneErr] = useState('');
  const [phoneOk, setPhoneOk] = useState('');

  // ── Password state ───────────────────────────────────────────────────────
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [cfmPwd, setCfmPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdErr, setPwdErr] = useState('');
  const [pwdOk, setPwdOk] = useState('');

  // ── 2FA state — local DB-backed ──────────────────────────────────────────
  const setupTotpMut = useSetupTotp();
  const verifyTotpMut = useVerifyTotp();
  const disableTotpMut = useDisableTotp();
  const [totpData, setTotpData] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpErr, setTotpErr] = useState('');
  const [totpOk, setTotpOk] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  // ── Passkeys state — local DB-backed + WebAuthn ───────────────────────────
  const { data: passkeyList = [], refetch: refetchPasskeys } = useListPasskeys();
  const beginPasskeyMut = useBeginPasskeyRegistration();
  const finishPasskeyMut = useFinishPasskeyRegistration();
  const deletePasskeyMut = useDeletePasskey();
  const [pkBusy, setPkBusy] = useState(false);
  const [pkErr, setPkErr] = useState('');
  const [pkOk, setPkOk] = useState('');

  // ── SMS OTP state — Twilio-backed ────────────────────────────────────────
  const sendSmsOtpMut = useSendSmsOtp();
  const verifySmsOtpMut = useVerifySmsOtp();
  const [smsStep, setSmsStep] = useState<'form' | 'verify'>('form');
  const [smsCountry, setSmsCountry] = useState('+1');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsFullPhone, setSmsFullPhone] = useState('');
  const [smsDigits, setSmsDigits] = useState<string[]>(Array(6).fill(''));
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsErr, setSmsErr] = useState('');
  const [smsOk, setSmsOk] = useState('');
  const [smsCountdown, setSmsCountdown] = useState(0);

  const clerkErr = (e: unknown) => {
    const ce = e as { errors?: { message: string }[]; message?: string };
    return ce?.errors?.[0]?.message ?? ce?.message ?? 'Something went wrong. Please try again.';
  };

  const isTotpEnabled: boolean = profile?.twoFactorEnabled ?? false;
  const primaryPhone: string = (user as any)?.primaryPhoneNumber?.phoneNumber ?? '';

  // ── Email handlers ───────────────────────────────────────────────────────
  const submitEmail = async () => {
    if (!user || !newEmail.includes('@')) return;
    setEmailBusy(true); setEmailErr(''); setEmailOk('');
    try {
      const ea = await (user as any).createEmailAddress({ email: newEmail.trim() });
      await ea.prepareVerification({ strategy: 'email_code' });
      setEmailObj(ea);
      setEmailStep('verify');
    } catch (e) { setEmailErr(clerkErr(e)); }
    finally { setEmailBusy(false); }
  };

  const verifyEmail = async () => {
    if (!emailObj || emailCode.trim().length < 4) return;
    setEmailBusy(true); setEmailErr('');
    try {
      const result = await emailObj.attemptVerification({ code: emailCode.trim() });
      if (result?.verification?.status === 'verified') {
        await (user as any).update({ primaryEmailAddressId: emailObj.id });
      }
      setEmailOk('Email address updated successfully.');
      setEmailStep('form'); setNewEmail(''); setEmailCode(''); setEmailObj(null);
    } catch (e) { setEmailErr(clerkErr(e)); }
    finally { setEmailBusy(false); }
  };

  // ── Phone handlers ───────────────────────────────────────────────────────
  const submitPhone = async () => {
    if (!user || phoneNum.replace(/\D/g, '').length < 7) return;
    setPhoneBusy(true); setPhoneErr(''); setPhoneOk('');
    const full = countryCode + phoneNum.replace(/\D/g, '');
    try {
      const pn = await (user as any).createPhoneNumber({ phoneNumber: full });
      await pn.prepareVerification();
      setPhoneObj(pn);
      setPhoneStep('verify');
    } catch (e) { setPhoneErr(clerkErr(e)); }
    finally { setPhoneBusy(false); }
  };

  const verifyPhone = async () => {
    if (!phoneObj || phoneCode.trim().length < 4) return;
    setPhoneBusy(true); setPhoneErr('');
    try {
      await phoneObj.attemptVerification({ code: phoneCode.trim() });
      await (user as any).update({ primaryPhoneNumberId: phoneObj.id });
      setPhoneOk('Phone number saved successfully.');
      setPhoneStep('form'); setPhoneNum(''); setPhoneCode(''); setPhoneObj(null);
    } catch (e) { setPhoneErr(clerkErr(e)); }
    finally { setPhoneBusy(false); }
  };

  // ── Password handlers ────────────────────────────────────────────────────
  const submitPassword = async () => {
    if (!user) return;
    if (newPwd !== cfmPwd) { setPwdErr('Passwords do not match.'); return; }
    if (newPwd.length < 8) { setPwdErr('New password must be at least 8 characters.'); return; }
    setPwdBusy(true); setPwdErr(''); setPwdOk('');
    try {
      await (user as any).updatePassword({ currentPassword: curPwd, newPassword: newPwd });
      setPwdOk('Password changed successfully.');
      setCurPwd(''); setNewPwd(''); setCfmPwd('');
    } catch (e) { setPwdErr(clerkErr(e)); }
    finally { setPwdBusy(false); }
  };

  // ── 2FA handlers — local API ─────────────────────────────────────────────
  const setupTotp = async () => {
    setTotpBusy(true); setTotpErr(''); setTotpOk('');
    try {
      const data = await setupTotpMut.mutateAsync(undefined as unknown as void);
      setTotpData({ secret: data.secret, uri: data.uri });
    } catch (e: any) {
      setTotpErr(e?.response?.data?.error ?? e?.message ?? 'Could not start 2FA setup.');
    } finally { setTotpBusy(false); }
  };

  const verifyTotp = async () => {
    if (totpCode.trim().length < 6) return;
    setTotpBusy(true); setTotpErr('');
    try {
      await verifyTotpMut.mutateAsync({ data: { code: totpCode.trim() } });
      setTotpOk('Two-factor authentication is now active.');
      setTotpData(null); setTotpCode('');
      qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    } catch (e: any) {
      setTotpErr(e?.response?.data?.error ?? e?.message ?? 'Verification failed. Try again.');
    } finally { setTotpBusy(false); }
  };

  const disableTotp = async () => {
    setTotpBusy(true); setTotpErr('');
    try {
      await disableTotpMut.mutateAsync(undefined as unknown as void);
      setTotpOk('Two-factor authentication disabled.');
      qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    } catch (e: any) {
      setTotpErr(e?.response?.data?.error ?? e?.message ?? 'Could not disable 2FA.');
    } finally { setTotpBusy(false); }
  };

  // ── Passkey handlers — WebAuthn + local API ──────────────────────────────
  const registerPasskey = async () => {
    if (!navigator.credentials) {
      setPkErr('Passkeys are not supported in this browser.'); return;
    }
    setPkBusy(true); setPkErr(''); setPkOk('');
    try {
      // 1. Get challenge from server
      const opts = await beginPasskeyMut.mutateAsync({ data: { origin: window.location.origin } });
      const { challenge, rpId, rpName, userId: webAuthnUserId, userDisplayName, timeout } = opts;

      // 2. Build WebAuthn options
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        challenge: b64urlToBytes(challenge).buffer as ArrayBuffer,
        rp: { name: rpName, id: rpId },
        user: {
          id: b64urlToBytes(webAuthnUserId).buffer as ArrayBuffer,
          name: profile?.email ?? 'user',
          displayName: userDisplayName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' },  // RS256
        ],
        timeout: timeout ?? 60000,
        attestation: 'none',
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      };

      // 3. Create credential via browser
      const credential = await navigator.credentials.create({ publicKey: publicKeyOptions });
      if (!credential) throw new Error('Credential creation was cancelled.');

      const pkCred = credential as PublicKeyCredential;
      const attResp = pkCred.response as AuthenticatorAttestationResponse;

      // 4. Send encoded credential to server
      await finishPasskeyMut.mutateAsync({
        data: {
          credentialId: pkCred.id,
          publicKey: bytesToB64url(new Uint8Array(attResp.attestationObject)),
          challenge,
          deviceName: guessDeviceName(),
          transports: JSON.stringify(attResp.getTransports?.() ?? []),
        },
      });

      setPkOk('Passkey registered successfully.');
      refetchPasskeys();
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') {
        setPkErr('Registration was cancelled or timed out.');
      } else {
        setPkErr(e?.response?.data?.error ?? e?.message ?? 'Passkey registration failed.');
      }
    } finally { setPkBusy(false); }
  };

  const removePasskey = async (id: string) => {
    setPkErr(''); setPkOk('');
    try {
      await deletePasskeyMut.mutateAsync({ id });
      setPkOk('Passkey removed.');
      refetchPasskeys();
    } catch (e: any) {
      setPkErr(e?.response?.data?.error ?? e?.message ?? 'Could not remove passkey.');
    }
  };

  // ── SMS OTP handlers — Twilio ─────────────────────────────────────────────
  const startSmsCountdown = () => {
    setSmsCountdown(60);
    const t = setInterval(() => setSmsCountdown(prev => { if (prev <= 1) { clearInterval(t); return 0; } return prev - 1; }), 1000);
  };
  const doSendSmsOtp = async () => {
    const full = smsCountry + smsPhone.replace(/\D/g, '');
    if (full.replace(/\D/g, '').length < 7) return;
    setSmsBusy(true); setSmsErr(''); setSmsOk('');
    try {
      await sendSmsOtpMut.mutateAsync({ data: { phoneNumber: full } });
      setSmsFullPhone(full); setSmsStep('verify'); startSmsCountdown();
    } catch (e: any) { setSmsErr(e?.response?.data?.error ?? e?.message ?? 'Could not send SMS. Please try again.'); }
    finally { setSmsBusy(false); }
  };
  const doVerifySmsOtp = async () => {
    const code = smsDigits.join('');
    if (code.length < 6) return;
    setSmsBusy(true); setSmsErr('');
    try {
      await verifySmsOtpMut.mutateAsync({ data: { phoneNumber: smsFullPhone, code } });
      setSmsOk('Phone number verified and saved.');
      setSmsStep('form'); setSmsPhone(''); setSmsDigits(Array(6).fill(''));
      qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    } catch (e: any) { setSmsErr(e?.response?.data?.error ?? e?.message ?? 'Verification failed. Try again.'); }
    finally { setSmsBusy(false); }
  };

  const qrSrc = totpData?.uri
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(totpData.uri)}&size=200x200&margin=10&color=000000&bgcolor=ffffff`
    : '';

  const copySecret = () => {
    if (!totpData) return;
    navigator.clipboard?.writeText(totpData.secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  };

  return (
    <div className="surface overflow-hidden rounded-2xl divide-y divide-border">
      {/* Header */}
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <ShieldCheck size={19} />
        </div>
        <div className="min-w-0">
          <p className="eyebrow">Account protection</p>
          <h2 className="mt-0.5 text-xl font-extrabold leading-tight">Security settings</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Manage how you sign in and protect your account. All changes take effect immediately.
          </p>
        </div>
      </div>

      {/* ── 1. Email ── */}
      <SecurityRow
        id="email" icon={<Mail size={17} />} title="Email address"
        badge={profile?.email ?? 'Not set'}
        open={panel === 'email'} onToggle={() => toggle('email')}
      >
        <div className="grid gap-4">
          {emailStep === 'form' ? (
            <>
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Current email</p>
                <p className="mt-1 truncate text-sm font-semibold">{profile?.email ?? '—'}</p>
              </div>
              <SecInput label="New email address" type="email" value={newEmail} onChange={setNewEmail}
                placeholder="you@example.com" autoComplete="email" />
              {emailErr && <FormMsg type="error" msg={emailErr} />}
              {emailOk && <FormMsg type="success" msg={emailOk} />}
              <SecBtn loading={emailBusy} onClick={submitEmail} disabled={!newEmail.includes('@')}>
                <Mail size={15} />Send verification code
              </SecBtn>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
                <p className="text-sm font-bold text-primary">Check your inbox</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  A 6-digit code was sent to <strong className="text-foreground">{newEmail}</strong>.
                  Enter it below to verify your new address.
                </p>
              </div>
              <SecInput label="6-digit verification code" type="text" value={emailCode} onChange={setEmailCode}
                placeholder="123456" autoComplete="one-time-code" />
              {emailErr && <FormMsg type="error" msg={emailErr} />}
              <div className="flex flex-col gap-2 sm:flex-row">
                <SecBtn variant="ghost" onClick={() => { setEmailStep('form'); setEmailErr(''); }} className="sm:w-auto sm:flex-1">
                  ← Back
                </SecBtn>
                <SecBtn loading={emailBusy} onClick={verifyEmail} disabled={emailCode.length < 4} className="sm:flex-[2]">
                  Verify &amp; update email
                </SecBtn>
              </div>
            </>
          )}
        </div>
      </SecurityRow>

      {/* ── 2. Phone ── */}
      <SecurityRow
        id="phone" icon={<Phone size={17} />} title="Phone number"
        badge={profile?.smsPhoneVerified && profile.smsPhoneNumber ? profile.smsPhoneNumber : 'Not added'}
        open={panel === 'phone'} onToggle={() => toggle('phone')}
      >
        <div className="grid gap-5">
          {smsStep === 'form' ? (
            <>
              {profile?.smsPhoneVerified && profile.smsPhoneNumber && (
                <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/8 px-4 py-3">
                  <ShieldCheck size={16} className="shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-primary">Currently verified</p>
                    <p className="font-mono text-xs text-muted-foreground">{profile.smsPhoneNumber}</p>
                  </div>
                </div>
              )}
              <p className="text-sm leading-6 text-muted-foreground">
                Link a mobile number to your account. We'll send a one-time 6-digit code via SMS to verify ownership.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-muted-foreground">Mobile number</label>
                <div className="flex gap-2">
                  <select
                    value={smsCountry}
                    onChange={e => setSmsCountry(e.target.value)}
                    className="h-11 shrink-0 rounded-xl border border-input bg-secondary/40 px-2 text-xs font-bold outline-none transition focus:border-primary w-[150px] sm:w-[160px]"
                    aria-label="Country code"
                  >
                    {COUNTRY_CODES.map(([code, label]) => (
                      <option key={label} value={code}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    value={smsPhone}
                    onChange={e => setSmsPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doSendSmsOtp(); }}
                    placeholder="(555) 000-0000"
                    autoComplete="tel-national"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-secondary/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
                    data-testid="input-phone-number"
                  />
                </div>
              </div>
              {smsErr && <FormMsg type="error" msg={smsErr} />}
              {smsOk && <FormMsg type="success" msg={smsOk} />}
              <SecBtn
                loading={smsBusy}
                onClick={doSendSmsOtp}
                disabled={smsPhone.replace(/\D/g, '').length < 7}
                data-testid="button-phone-send-otp"
              >
                <Phone size={15} />Send verification code
              </SecBtn>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
                <p className="text-sm font-bold text-primary">Code sent via SMS</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  A 6-digit code was sent to <strong className="font-mono text-foreground">{smsFullPhone}</strong>. Valid for 5 minutes.
                </p>
              </div>
              <div className="grid gap-2">
                <p className="text-center text-xs font-bold text-muted-foreground">Enter your 6-digit code</p>
                <SmsOtpBoxes digits={smsDigits} onChange={setSmsDigits} />
              </div>
              {smsErr && <FormMsg type="error" msg={smsErr} />}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {smsCountdown > 0 ? `Resend available in ${smsCountdown}s` : 'Didn\'t receive it?'}
                </span>
                <button
                  type="button"
                  disabled={smsCountdown > 0 || smsBusy}
                  onClick={() => { setSmsStep('form'); setSmsErr(''); setSmsDigits(Array(6).fill('')); }}
                  className="font-bold text-primary disabled:opacity-40 hover:underline disabled:no-underline"
                >
                  {smsCountdown > 0 ? `Resend (${smsCountdown}s)` : 'Resend code'}
                </button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <SecBtn
                  variant="ghost"
                  onClick={() => { setSmsStep('form'); setSmsErr(''); setSmsDigits(Array(6).fill('')); }}
                  className="sm:w-auto sm:flex-1"
                >
                  ← Back
                </SecBtn>
                <SecBtn
                  loading={smsBusy}
                  onClick={doVerifySmsOtp}
                  disabled={smsDigits.join('').length < 6}
                  className="sm:flex-[2]"
                  data-testid="button-phone-verify"
                >
                  <ShieldCheck size={15} />Verify &amp; save number
                </SecBtn>
              </div>
            </>
          )}
        </div>
      </SecurityRow>

      {/* ── 3. Password ── */}
      <SecurityRow
        id="password" icon={<Lock size={17} />} title="Password"
        badge="Use a strong, unique password"
        open={panel === 'password'} onToggle={() => toggle('password')}
      >
        <div className="grid gap-4">
          <SecInput label="Current password" type="password" value={curPwd} onChange={setCurPwd}
            placeholder="••••••••" autoComplete="current-password" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SecInput label="New password" type="password" value={newPwd} onChange={setNewPwd}
              placeholder="••••••••" autoComplete="new-password" />
            <SecInput label="Confirm new password" type="password" value={cfmPwd} onChange={setCfmPwd}
              placeholder="••••••••" autoComplete="new-password" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['8+ characters', 'Letters & numbers', 'Special character'].map(hint => (
              <span key={hint} className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                {hint}
              </span>
            ))}
          </div>
          {pwdErr && <FormMsg type="error" msg={pwdErr} />}
          {pwdOk && <FormMsg type="success" msg={pwdOk} />}
          <SecBtn loading={pwdBusy} onClick={submitPassword} disabled={!curPwd || !newPwd || !cfmPwd}>
            <Lock size={15} />Update password
          </SecBtn>
        </div>
      </SecurityRow>

      {/* ── 4. Two-Factor Auth ── */}
      <SecurityRow
        id="2fa" icon={<Smartphone size={17} />} title="Two-Factor Authentication"
        badge={isTotpEnabled ? '● Active — authenticator app connected' : 'Not enabled'}
        open={panel === '2fa'} onToggle={() => toggle('2fa')}
      >
        <div className="grid gap-4">
          {isTotpEnabled ? (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/8 px-4 py-3">
                <ShieldCheck size={18} className="shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold text-primary">2FA is active</p>
                  <p className="text-xs text-muted-foreground">Your account requires a code from your authenticator app at sign-in.</p>
                </div>
              </div>
              {totpErr && <FormMsg type="error" msg={totpErr} />}
              {totpOk && <FormMsg type="success" msg={totpOk} />}
              <SecBtn variant="ghost" loading={totpBusy} onClick={disableTotp}>
                Disable two-factor authentication
              </SecBtn>
            </>
          ) : totpData ? (
            <>
              {/* Step 1: QR code */}
              <div className="rounded-xl border border-border bg-muted/10 p-4 sm:p-5">
                <p className="mb-1 text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">Step 1 — Scan QR code</p>
                <p className="mb-4 text-xs leading-5 text-muted-foreground">
                  Open <strong className="text-foreground">Google Authenticator</strong>, <strong className="text-foreground">Authy</strong>, or <strong className="text-foreground">1Password</strong> and scan the code below.
                </p>
                <div className="flex justify-center">
                  {qrSrc ? (
                    <img src={qrSrc} alt="TOTP QR code" className="h-48 w-48 rounded-xl border border-border bg-white p-2 sm:h-52 sm:w-52" />
                  ) : (
                    <div className="grid h-48 w-48 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                      QR unavailable
                    </div>
                  )}
                </div>
                {/* Manual key */}
                <div className="mt-4">
                  <p className="mb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Manual entry key</p>
                  <div className="flex items-center gap-2">
                    <code className={`min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs tracking-widest transition-all duration-200 select-all ${showSecret ? '' : 'blur-sm'}`}>
                      {totpData.secret}
                    </code>
                    <button type="button" onClick={() => setShowSecret(s => !s)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:text-foreground"
                      aria-label={showSecret ? 'Hide key' : 'Reveal key'}>
                      {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button type="button" onClick={copySecret}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:text-foreground"
                      aria-label="Copy key">
                      {secretCopied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>
              {/* Step 2: verify code */}
              <div>
                <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">Step 2 — Enter code to activate</p>
                <SecInput label="6-digit code from your authenticator app" type="text"
                  value={totpCode} onChange={setTotpCode} placeholder="123456" autoComplete="one-time-code" />
              </div>
              {totpErr && <FormMsg type="error" msg={totpErr} />}
              <div className="flex flex-col gap-2 sm:flex-row">
                <SecBtn variant="ghost" onClick={() => { setTotpData(null); setTotpCode(''); setTotpErr(''); }} className="sm:w-auto sm:flex-1">
                  Cancel
                </SecBtn>
                <SecBtn loading={totpBusy} onClick={verifyTotp} disabled={totpCode.length < 6} className="sm:flex-[2]">
                  <ShieldCheck size={15} />Activate 2FA
                </SecBtn>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-muted-foreground">
                Protect your account with a time-based one-time password. Each login requires a 6-digit code generated by your authenticator app — even if someone has your password.
              </p>
              {totpErr && <FormMsg type="error" msg={totpErr} />}
              {totpOk && <FormMsg type="success" msg={totpOk} />}
              <SecBtn loading={totpBusy} onClick={setupTotp}>
                <Smartphone size={15} />Set up authenticator app
              </SecBtn>
            </>
          )}
        </div>
      </SecurityRow>

      {/* ── 5. Passkeys ── */}
      <SecurityRow
        id="passkeys" icon={<Fingerprint size={17} />} title="Passkeys"
        badge={`${passkeyList.length} passkey${passkeyList.length !== 1 ? 's' : ''} registered`}
        open={panel === 'passkeys'} onToggle={() => toggle('passkeys')}
      >
        <div className="grid gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Passkeys use your device's biometrics (Face ID, Touch ID, Windows Hello) or a hardware key to sign you in — no password required.
          </p>
          {passkeyList.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
              {passkeyList.map((pk) => (
                <div key={pk.id} className="flex items-center gap-3 px-4 py-3">
                  <Fingerprint size={16} className="shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{pk.deviceName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Added {new Date(pk.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePasskey(pk.id)}
                    className="shrink-0 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[11px] font-bold text-destructive transition hover:bg-destructive/10 min-h-[36px]"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center">
              <Fingerprint size={22} className="mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No passkeys registered yet.</p>
            </div>
          )}
          {pkErr && <FormMsg type="error" msg={pkErr} />}
          {pkOk && <FormMsg type="success" msg={pkOk} />}
          <SecBtn loading={pkBusy} onClick={registerPasskey}>
            <Fingerprint size={15} />Register new passkey
          </SecBtn>
        </div>
      </SecurityRow>

    </div>
  );
}

function WalletDialogs({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'deposit' | 'send' | 'withdraw' | 'convert' | null>(null);
  const [asset, setAsset] = useState('BTC');
  const [toAsset, setToAsset] = useState('ETH');
  const [copied, setCopied] = useState(false);
  const [swapDone, setSwapDone] = useState<{ toAmount: number; rate: number; toAsset: string } | null>(null);
  const [swapError, setSwapError] = useState('');

  const qc = useQueryClient();
  const deposit = useCreateDeposit();
  const send = useCreateSend();
  const withdrawal = useCreateWithdrawal();
  const swap = useCreateSwap();

  const address = asset === 'BTC' ? '17v1CRcS2JbZhYy24g7mJRth8uz1Um4QFq' : '0x45fa3421948a8a0372e0a172ab9a3725f785a1d2';

  const close = () => { setMode(null); setCopied(false); setSwapDone(null); setSwapError(''); };

  const submitDeposit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    deposit.mutate({ data: { asset, amount: Number(form.get('amount')), txHash: String(form.get('txHash')), proofPath: null } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetPortfolioQueryKey() }); qc.invalidateQueries({ queryKey: getGetActivityQueryKey() }); close(); onDone(); },
    });
  };

  const submitTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = { asset, amount: Number(form.get('amount')), destination: String(form.get('destination')) };
    const mutation = mode === 'send' ? send : withdrawal;
    mutation.mutate({ data }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetPortfolioQueryKey() }); qc.invalidateQueries({ queryKey: getGetActivityQueryKey() }); close(); onDone(); },
    });
  };

  const submitSwap = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSwapError('');
    const form = new FormData(event.currentTarget);
    swap.mutate({ data: { fromAsset: asset, toAsset, fromAmount: Number(form.get('fromAmount')) } }, {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
        qc.invalidateQueries({ queryKey: getGetActivityQueryKey() });
        setSwapDone({ toAmount: data.toAmount, rate: data.rate, toAsset: data.toAsset });
        onDone();
      },
      onError: () => setSwapError('Insufficient balance or unsupported asset pair.'),
    });
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Button variant="secondary" onClick={() => setMode('deposit')} data-testid="button-open-deposit"><ArrowDownLeft size={17} />Deposit</Button>
        <Button variant="secondary" onClick={() => setMode('send')} data-testid="button-open-send"><Send size={17} />Send</Button>
        <Button variant="secondary" onClick={() => setMode('withdraw')} data-testid="button-open-withdraw"><ArrowUpRight size={17} />Withdraw</Button>
        <Button variant="secondary" onClick={() => { setMode('convert'); setSwapDone(null); setSwapError(''); }} data-testid="button-open-convert"><ArrowLeftRight size={17} />Convert</Button>
      </div>

      {/* ── Deposit ── */}
      {mode === 'deposit' && (
        <Modal title="Add funds" eyebrow="Deposit" onClose={close}>
          <form className="grid gap-5" onSubmit={submitDeposit}>
            <SelectField label="Asset" value={asset} onChange={(event) => setAsset(event.target.value)} data-testid="select-deposit-asset">
              {depositAssets.map((item) => (
                <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.name}</option>
              ))}
            </SelectField>
            <div className="rounded-xl border border-primary/20 bg-primary/7 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{asset} deposit address</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all font-mono-ui text-[11px] text-foreground">{address}</code>
                <button type="button" className="shrink-0 rounded-lg border border-primary/20 p-2 text-primary hover:bg-primary/10" onClick={() => { navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1800); }} aria-label="Copy deposit address" data-testid="button-copy-deposit-address">
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
              {copied && <p className="mt-2 text-xs font-bold text-primary" data-testid="status-address-copied">Address copied</p>}
            </div>
            <Field label={`Amount (${asset})`} name="amount" type="number" min="0" step="any" placeholder="0.00" required data-testid="input-deposit-amount" />
            <Field label="Transaction hash" name="txHash" type="text" placeholder="Paste the on-chain transaction hash" required data-testid="input-deposit-txhash" />
            <Button type="submit" className="w-full" disabled={deposit.isPending} data-testid="button-submit-deposit">
              {deposit.isPending ? 'Submitting deposit...' : 'Submit deposit proof'} <ArrowUpRight size={16} />
            </Button>
            {deposit.isError && <p className="text-sm font-semibold text-destructive" data-testid="status-deposit-error">Deposit could not be submitted. Try again.</p>}
          </form>
        </Modal>
      )}

      {/* ── Send / Withdraw ── */}
      {(mode === 'send' || mode === 'withdraw') && (
        <Modal title={mode === 'send' ? 'Send funds' : 'Withdraw funds'} eyebrow={mode === 'send' ? 'Transfer' : 'Withdrawal'} onClose={close}>
          <form className="grid gap-5" onSubmit={submitTransfer}>
            <SelectField label="Asset" value={asset} onChange={(event) => setAsset(event.target.value)} data-testid="select-transfer-asset">
              {depositAssets.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.name}</option>)}
            </SelectField>
            <Field label={`Amount (${asset})`} name="amount" type="number" min="0" step="any" placeholder="0.00" required data-testid="input-transfer-amount" />
            <Field label={mode === 'send' ? 'Destination wallet address' : 'Withdrawal destination'} name="destination" type="text" placeholder="Paste a wallet address" required data-testid="input-transfer-destination" />
            <div className="rounded-xl border border-accent/20 bg-accent/7 p-3 text-xs leading-5 text-muted-foreground">
              <strong className="text-accent">Review carefully.</strong> Blockchain transfers cannot be reversed after confirmation.
            </div>
            <Button type="submit" className="w-full" disabled={send.isPending || withdrawal.isPending} data-testid={`button-submit-${mode}`}>
              {send.isPending || withdrawal.isPending ? 'Processing...' : `Confirm ${mode}`} <ArrowUpRight size={16} />
            </Button>
            {(send.isError || withdrawal.isError) && <p className="text-sm font-semibold text-destructive" data-testid="status-transfer-error">We could not process this request. Check the details and try again.</p>}
          </form>
        </Modal>
      )}

      {/* ── Convert / Swap ── */}
      {mode === 'convert' && (
        <Modal title="Convert assets" eyebrow="Swap" onClose={close}>
          {swapDone ? (
            <div className="grid gap-5 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary"><ArrowLeftRight size={26} /></div>
              <div>
                <p className="text-sm text-muted-foreground">Conversion complete</p>
                <p className="mt-2 font-mono-ui text-2xl font-bold">{swapDone.toAmount.toFixed(6)} <span className="text-primary">{swapDone.toAsset}</span></p>
                <p className="mt-1 text-xs text-muted-foreground">Rate: 1 {asset} = {swapDone.rate.toFixed(6)} {swapDone.toAsset}</p>
              </div>
              <Button className="w-full" onClick={close}><Check size={16} />Done</Button>
            </div>
          ) : (
            <form className="grid gap-5" onSubmit={submitSwap}>
              <div className="grid gap-1">
                <SelectField label="From asset" value={asset} onChange={(event) => { setAsset(event.target.value); if (event.target.value === toAsset) setToAsset(depositAssets.find(a => a.symbol !== event.target.value)?.symbol ?? 'ETH'); }}>
                  {depositAssets.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.name}</option>)}
                </SelectField>
              </div>
              <div className="flex items-center justify-center">
                <button type="button" className="rounded-full border border-border bg-secondary p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition" onClick={() => { const tmp = asset; setAsset(toAsset); setToAsset(tmp); }} aria-label="Swap direction">
                  <RefreshCw size={16} />
                </button>
              </div>
              <SelectField label="To asset" value={toAsset} onChange={(event) => { setToAsset(event.target.value); if (event.target.value === asset) setAsset(depositAssets.find(a => a.symbol !== event.target.value)?.symbol ?? 'BTC'); }}>
                {depositAssets.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.name}</option>)}
              </SelectField>
              <Field label={`Amount to convert (${asset})`} name="fromAmount" type="number" min="0" step="any" placeholder="0.00" required data-testid="input-swap-amount" />
              <div className="rounded-xl border border-accent/20 bg-accent/7 p-3 text-xs leading-5 text-muted-foreground">
                <strong className="text-accent">Instant settlement.</strong> Conversions execute at live market rates and are reflected in your portfolio immediately.
              </div>
              {swapError && <p className="text-sm font-semibold text-destructive">{swapError}</p>}
              <Button type="submit" className="w-full" disabled={swap.isPending} data-testid="button-submit-swap">
                {swap.isPending ? 'Converting...' : `Convert ${asset} → ${toAsset}`} <ArrowLeftRight size={16} />
              </Button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

function Dashboard() {
  const [currency, setCurrency] = useState('USD');
  const [notice, setNotice] = useState('');

  const portfolio = useGetPortfolio({ query: { queryKey: getGetPortfolioQueryKey(), refetchInterval: 5_000, placeholderData: (prev) => prev } });
  const activity = useGetActivity({ query: { queryKey: getGetActivityQueryKey(), refetchInterval: 60_000, placeholderData: (prev) => prev } });
  const fxQuery = useGetFxRates({ query: { queryKey: getGetFxRatesQueryKey(), staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 } });

  // Exchange rate: convert USD → selected currency
  const fxRate = (currency === 'USD' ? 1 : (fxQuery.data?.rates?.[currency] ?? 1));
  const cx = (usdValue: number) => usdValue * fxRate;

  const data = portfolio.data;
  const recent = activity.data?.slice(0, 5) ?? [];
  const holdings = data?.holdings ?? [];

  return (
    <Shell>
      <PageHeader eyebrow="Overview" title="Your portfolio" detail="A grounded view of everything you hold."
        action={<WalletDialogs onDone={() => { setNotice('Request submitted successfully'); setTimeout(() => setNotice(''), 3000); }} />}
      />
      {notice && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-bold text-primary animate-rise" data-testid="status-wallet-success">
          <Check size={17} />{notice}
        </div>
      )}
      {portfolio.isLoading ? <LoadingState lines={5} />
        : portfolio.isError ? <ErrorState retry={() => portfolio.refetch()} />
        : !data ? <EmptyState title="Your portfolio is ready for its first asset" detail="Make a deposit to see your balance and holdings here." />
        : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
              {/* Total balance card */}
              <div className="surface relative overflow-hidden rounded-2xl p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Total balance</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <p className="font-mono-ui text-4xl font-medium tracking-[-.06em] sm:text-5xl" data-testid="text-total-balance">
                        {money(data.totalValue, 'USD')}
                      </p>
                      <span className="rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 font-mono-ui text-xs font-medium text-primary">
                        USD
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm">
                      <span className={`font-bold ${data.dayChange >= 0 ? 'text-[#2db87a]' : 'text-destructive'}`}>
                        {money(cx(data.dayChange), currency)}
                      </span>
                      <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${data.dayChangePercent >= 0 ? 'bg-[#2db87a]/10 text-[#2db87a]' : 'bg-destructive/10 text-destructive'}`}>
                        {pct(data.dayChangePercent)}
                      </span>
                      <span className="text-muted-foreground">today</span>
                    </div>
                  </div>
                  <span className="hidden rounded-xl border border-border bg-background/35 p-3 text-primary sm:block"><Wallet size={21} /></span>
                </div>
                <div className="mt-8 h-32"><HeroChart /></div>
                <div className="mt-4 flex justify-between text-[10px] font-mono-ui text-muted-foreground">
                  <span>09:00</span><span>12:00</span><span>15:00</span><span>NOW</span>
                </div>
              </div>

              {/* Cash card */}
              <div className="surface rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Available cash</p>
                    <p className="mt-2 font-mono-ui text-3xl font-medium tracking-[-.05em]" data-testid="text-cash-balance">
                      {money(cx(data.cashBalance), currency)}
                    </p>
                    <label className="relative mt-3 inline-block">
                      <select value={currency} onChange={(event) => setCurrency(event.target.value)}
                        className="appearance-none rounded-lg border border-border bg-background/60 py-1.5 pl-2.5 pr-7 font-mono-ui text-xs font-medium text-muted-foreground outline-none"
                        aria-label="Cash and holdings display currency" data-testid="select-balance-currency">
                        {currencies.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-2.5 text-muted-foreground" />
                    </label>
                  </div>
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent"><Landmark size={20} /></div>
                </div>
                <div className="mt-7 border-t border-border pt-5">
                  <p className="text-xs leading-5 text-muted-foreground">Ready to deploy when you are. Cash stays separate from your asset allocation.</p>
                  <Link href="/markets" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-browse-markets">Browse markets <ArrowUpRight size={15} /></Link>
                </div>
              </div>
            </section>

            <section className="mt-7 grid gap-7 xl:grid-cols-[1.3fr_.7fr]">
              {/* Holdings */}
              <div className="surface rounded-2xl p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div><p className="eyebrow">Allocation</p><h2 className="mt-1 text-lg font-extrabold tracking-[-.03em]">Holdings</h2></div>
                  <span className="font-mono-ui text-xs text-muted-foreground">{holdings.length} assets</span>
                </div>
                {holdings.length === 0 ? <EmptyState title="No holdings yet" detail="Your assets will appear here after your first deposit." /> : (
                  <div className="grid gap-1">
                    {holdings.map((holding) => (
                      <Link href={`/markets/${holding.symbol}`} key={holding.symbol}
                        className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-secondary sm:grid-cols-[1.3fr_1fr_.8fr_.7fr]">
                        <div className="flex items-center gap-3">
                          <CoinLogo symbol={holding.symbol} name={holding.name} color={holding.color} size={36} />
                          <div><p className="text-sm font-bold">{holding.symbol}</p><p className="text-xs text-muted-foreground">{holding.name}</p></div>
                        </div>
                        <div className="hidden text-right sm:block">
                          <p className="font-mono-ui text-xs">{holding.amount}</p>
                          <p className="text-xs text-muted-foreground">units</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono-ui text-sm font-medium">{money(cx(holding.value), currency)}</p>
                          <p className={`text-xs font-bold ${holding.change24h >= 0 ? 'text-[#2db87a]' : 'text-destructive'}`}>{pct(holding.change24h)}</p>
                        </div>
                        <div className="hidden text-right text-xs text-muted-foreground sm:block">{holding.allocation.toFixed(1)}%</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent activity */}
              <div className="surface rounded-2xl p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div><p className="eyebrow">Latest</p><h2 className="mt-1 text-lg font-extrabold tracking-[-.03em]">Recent activity</h2></div>
                  <Link href="/activity" className="text-xs font-bold text-primary hover:underline" data-testid="link-see-all-activity">View all</Link>
                </div>
                {activity.isLoading ? <LoadingState lines={4} />
                  : activity.isError ? <ErrorState retry={() => activity.refetch()} />
                  : recent.length === 0 ? <EmptyState title="Nothing here yet" detail="Your first wallet action will show up in this timeline." />
                  : (
                    <div className="grid gap-1">
                      {recent.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl px-1 py-3" data-testid={`row-recent-activity-${item.id}`}>
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground">{iconForActivity(item.type)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold capitalize">{item.type}</p>
                            <p className="text-xs text-muted-foreground">{item.asset} · {dateLabel(item.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono-ui text-xs font-medium">{item.amount} {item.asset}</p>
                            <p className={`text-[10px] font-bold capitalize ${item.status === 'completed' ? 'text-[#2db87a]' : item.status === 'failed' ? 'text-destructive' : 'text-accent'}`}>{item.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </section>

            <section className="mt-7 rounded-2xl border border-primary/15 bg-primary/7 p-5 sm:flex sm:items-center sm:justify-between sm:p-6">
              <div className="flex gap-3">
                <div className="mt-0.5 text-primary"><ShieldCheck size={20} /></div>
                <div>
                  <h2 className="font-bold">One more step for higher limits</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Complete verification to unlock the full North State Blockchain experience.</p>
                </div>
              </div>
              <Link href="/settings" className="mt-4 inline-flex text-sm font-bold text-primary hover:underline sm:mt-0" data-testid="link-dashboard-settings">Review settings <ArrowUpRight size={15} className="ml-1" /></Link>
            </section>
          </>
        )}
    </Shell>
  );
}

function Markets() {
  const [search, setSearch] = useState('');
  const market = useGetMarketSummary({ query: { queryKey: getGetMarketSummaryQueryKey(), refetchInterval: 3_000, placeholderData: (prev) => prev } }); const list = useMemo(() => (market.data ?? []).filter((item) => `${item.symbol} ${item.name}`.toLowerCase().includes(search.toLowerCase())), [market.data, search]);
  return <Shell><PageHeader eyebrow="Markets" title="Know what is moving" detail="Supported assets, with the numbers that matter." action={<label className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets" className="h-11 w-full rounded-xl border border-input bg-secondary/40 pl-9 pr-4 text-sm outline-none focus:border-primary sm:w-64" data-testid="input-market-search" /></label>} />{market.isLoading ? <LoadingState lines={7} /> : market.isError ? <ErrorState retry={() => market.refetch()} /> : list.length === 0 ? <EmptyState title="No matching assets" detail="Try a symbol or asset name, such as Bitcoin or ETH." /> : <div className="surface overflow-hidden rounded-2xl"><div className="hidden grid-cols-[48px_1.4fr_1fr_1fr_1fr_72px] gap-4 border-b border-border px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid"><span>#</span><span>Asset</span><span>Price</span><span>24h change</span><span>Market cap</span><span></span></div><div className="divide-y divide-border/70">{list.map((item) => <MarketRow item={item} key={item.symbol} />)}</div></div>}</Shell>;
}

function MarketRow({ item }: { item: MarketAsset }) {
  const previousPrice = useRef(item.price);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (previousPrice.current === item.price) return;
    setPriceDirection(item.price > previousPrice.current ? 'up' : 'down');
    previousPrice.current = item.price;
    const timeout = window.setTimeout(() => setPriceDirection(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [item.price]);

  return (
    <Link
      href={`/markets/${item.symbol}`}
      className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 transition hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:grid-cols-[48px_1.4fr_1fr_1fr_1fr_72px] md:px-5"
      data-testid={`row-market-${item.symbol}`}
      aria-label={`View ${item.name} market details`}
    >
      <span className="hidden font-mono-ui text-xs text-muted-foreground md:block">{String(item.rank).padStart(2, '0')}</span>
      <div className="flex items-center gap-3">
        <CoinLogo symbol={item.symbol} name={item.name} color={item.color ?? '#0ea5e9'} size={40} />
        <div><p className="text-sm font-bold">{item.name}</p><p className="font-mono-ui text-xs text-muted-foreground">{item.symbol}</p></div>
      </div>
      <p className={`font-mono-ui text-sm ${priceDirection ? `quote-flash-${priceDirection}` : ''}`}>{money(item.price)}</p>
      <p className={`text-sm font-bold ${item.change24h >= 0 ? 'text-[#2db87a]' : 'text-destructive'} ${priceDirection ? `quote-change-${priceDirection}` : ''}`}>{pct(item.change24h)}</p>
      <p className="hidden font-mono-ui text-sm text-muted-foreground md:block">${compact(item.marketCap)}</p>
      <span className="hidden items-center justify-end text-primary md:flex"><ArrowUpRight size={17} /></span>
    </Link>
  );
}

function Chart({ points }: { points: { time: string; value: number }[] }) {
  if (!points.length) return <EmptyState title="Chart data is not available" detail="Market history will appear here when the feed returns." />;
  const width = 900, height = 260, min = Math.min(...points.map((p) => p.value)), max = Math.max(...points.map((p) => p.value)), range = max - min || 1;
  const coords = points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * width},${height - ((point.value - min) / range) * (height - 30) - 15}`).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" aria-label="Market price chart"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#cfa230" stopOpacity=".18" /><stop offset="1" stopColor="#cfa230" stopOpacity="0" /></linearGradient></defs><polyline points={`0,${height} ${coords} ${width},${height}`} fill="url(#chartFill)" stroke="none" /><polyline points={coords} fill="none" stroke="#cfa230" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function MarketDetail() {
  const { symbol = '' } = useParams<{ symbol: string }>(); const detail = useGetMarketDetail(symbol.toUpperCase(), { query: { queryKey: getGetMarketDetailQueryKey(symbol.toUpperCase()), refetchInterval: 3_000, placeholderData: (prev) => prev } }); const item = detail.data?.asset;
  return <Shell><Link href="/markets" className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-markets"><ArrowLeft size={16} />Back to markets</Link>{detail.isLoading ? <LoadingState lines={5} /> : detail.isError || !item ? detail.isError ? <ErrorState retry={() => detail.refetch()} /> : <EmptyState title="Market not found" detail="That asset is not part of the current North State Blockchain market set." /> : <><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="flex items-center gap-4"><CoinLogo symbol={item.symbol} name={item.name} color={item.color ?? '#0ea5e9'} size={56} /><div><p className="eyebrow">{item.symbol} market</p><h1 className="mt-1 text-3xl font-extrabold tracking-[-.05em]">{item.name}</h1></div></div><div className="sm:text-right"><p className="font-mono-ui text-3xl font-medium" data-testid="text-market-price">{money(item.price)}</p><p className={`mt-1 text-sm font-bold ${item.change24h >= 0 ? 'text-[#2db87a]' : 'text-destructive'}`}>{pct(item.change24h)} today</p></div></div><div className="mt-7 grid gap-4 sm:grid-cols-4"><Stat label="Market cap" value={`$${compact(item.marketCap)}`} /><Stat label="24h volume" value={`$${compact(item.volume24h)}`} /><Stat label="Rank" value={`#${item.rank}`} /><Stat label="Session" value="Live" accent /></div><div className="surface mt-7 rounded-2xl p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="eyebrow">Price history</p><h2 className="mt-1 text-lg font-extrabold tracking-[-.03em]">Market movement</h2></div><span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Live feed</span></div><div className="mt-8 h-64"><Chart points={detail.data?.chart ?? []} /></div><div className="mt-3 flex justify-between text-[10px] font-mono-ui text-muted-foreground"><span>7D AGO</span><span>5D AGO</span><span>3D AGO</span><span>NOW</span></div></div></>}</Shell>;
}
function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="surface-muted min-w-0 rounded-xl p-4"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className={`mt-2 break-all font-mono-ui text-lg font-medium ${accent ? 'text-primary' : ''}`}>{value}</p></div>; }

function CoinLogo({ symbol, name, color, size = 36 }: { symbol: string; name?: string; color?: string; size?: number }) {
  const [err, setErr] = useState(false);
  const file = getMarketLogoFile(symbol);
  const src = file ? `${basePath}/market-logos/${file}` : '';
  useEffect(() => setErr(false), [src]);
  if (!src || err) return <span role="img" aria-label={`${name ?? symbol} logo unavailable`} className="grid shrink-0 place-items-center rounded-full border border-white/10 text-[10px] font-extrabold text-[#071326]" style={{ width: size, height: size, backgroundColor: color ?? '#55dbe1' }}>{symbol.slice(0, 2).toUpperCase()}</span>;
  return <img src={src} alt={`${name ?? symbol} logo`} width={size} height={size} className="shrink-0 rounded-full object-contain" onError={() => setErr(true)} />;
}

function ActivityPage() {
  const activity = useGetActivity(); const items = activity.data ?? [];
  return <Shell><PageHeader eyebrow="Activity" title="Your wallet timeline" detail="Every movement, with a plain status." />{activity.isLoading ? <LoadingState lines={7} /> : activity.isError ? <ErrorState retry={() => activity.refetch()} /> : items.length === 0 ? <EmptyState title="Your timeline is quiet" detail="Deposits, sends, and withdrawals will appear here as they happen." /> : <div className="surface overflow-hidden rounded-2xl"><div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-border px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:grid"><span>Activity</span><span>Amount</span><span>Status</span><span className="text-right">Date</span></div><div className="divide-y divide-border/70">{items.map((item) => <div key={item.id} className="flex items-center gap-3 px-4 py-4 sm:grid sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:gap-4 sm:px-5" data-testid={`row-activity-${item.id}`}><div className="flex min-w-0 flex-1 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">{iconForActivity(item.type)}</span><div className="min-w-0"><p className="truncate text-sm font-bold capitalize">{item.type} · {item.asset}</p><p className="text-xs text-muted-foreground">{dateLabel(item.createdAt)}</p></div></div><p className="font-mono-ui text-sm">{item.amount} {item.asset}<span className="block text-xs text-muted-foreground">{money(item.value)}</span></p><p className={`hidden text-sm font-bold capitalize sm:block ${item.status === 'completed' ? 'text-[#2db87a]' : item.status === 'failed' ? 'text-destructive' : 'text-accent'}`} data-testid={`status-activity-${item.id}`}>{item.status}</p><p className="hidden text-right text-xs text-muted-foreground sm:block">{dateLabel(item.createdAt)}</p></div>)}</div></div>}</Shell>;
}

function Settings() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const qc = useQueryClient();
  const profile = useGetProfile();
  const referral = useGetReferral();
  const kyc = useSubmitKyc();
  const share = useCreateReferralShare();
  const [tab, setTab] = useState<'profile' | 'security' | 'verification' | 'referrals'>('profile');
  const [feedback, setFeedback] = useState('');
  const [docFrontPreview, setDocFrontPreview] = useState<string | null>(null);
  const [docBackPreview, setDocBackPreview] = useState<string | null>(null);
  const [docFrontFileName, setDocFrontFileName] = useState('');
  const [docBackFileName, setDocBackFileName] = useState('');
  const [docUploadError, setDocUploadError] = useState('');
  const [kycSubmitError, setKycSubmitError] = useState('');
  const [docComposing, setDocComposing] = useState(false);
  const profileData = profile.data;
  const referralData = referral.data;
  const verStatus = profileData?.verificationStatus;

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); };

  const compressDocumentImage = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.onload = (ev) => {
      const raw = ev.target?.result;
      if (typeof raw !== 'string') {
        reject(new Error('The selected image could not be read.'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('The selected image could not be decoded.'));
      img.onload = () => {
        const MAX = 1000;
        let { width, height } = img;
        if (!width || !height) {
          reject(new Error('The selected image has invalid dimensions.'));
          return;
        }
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('The selected image could not be prepared.'));
          return;
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.74));
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setDocUploadError('');
    setKycSubmitError('');
    const extension = file.name.split('.').pop()?.toLowerCase();
    const supportedExtension = extension != null && ['jfif', 'jpg', 'jpeg', 'png'].includes(extension);
    const supportedMime = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png'].includes(file.type.toLowerCase());
    if (!supportedExtension && !supportedMime) {
      setDocUploadError('Please upload a .jfif, .jpg, .jpeg, or .png image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setDocUploadError('Each ID image must be 5 MB or smaller.');
      return;
    }
    try {
      const preview = await compressDocumentImage(file);
      if (side === 'front') {
        setDocFrontFileName(file.name);
        setDocFrontPreview(preview);
      } else {
        setDocBackFileName(file.name);
        setDocBackPreview(preview);
      }
    } catch {
      setDocUploadError('We could not process that image. Please choose another file.');
    }
  };

  const composeDocumentImages = (front: string, back: string) => new Promise<string>((resolve, reject) => {
    const frontImage = new Image();
    const backImage = new Image();
    let loaded = 0;
    const onError = () => reject(new Error('The ID images could not be prepared.'));
    const onLoad = () => {
      loaded += 1;
      if (loaded !== 2) return;
      const width = Math.max(frontImage.width, backImage.width);
      const gap = 32;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = frontImage.height + gap + backImage.height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('The ID images could not be prepared.'));
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(frontImage, (width - frontImage.width) / 2, 0);
      context.drawImage(backImage, (width - backImage.width) / 2, frontImage.height + gap);
      let quality = 0.74;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 1_600_000 && quality > 0.42) {
        quality -= 0.08;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      if (result.length > 1_850_000) {
        reject(new Error('The combined ID images are too large.'));
        return;
      }
      resolve(result);
    };
    frontImage.onerror = onError; backImage.onerror = onError;
    frontImage.onload = onLoad; backImage.onload = onLoad;
    frontImage.src = front; backImage.src = back;
  });

  const submitKyc = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!docFrontPreview || !docBackPreview) {
      setDocUploadError('Upload both the Front Side of ID and Back Side of ID before submitting.');
      return;
    }
    setDocUploadError('');
    setKycSubmitError('');
    setDocComposing(true);
    try {
      // Keep the existing single-image API/database contract backward-compatible
      // by storing both required sides in one reviewable composite image.
      const combinedDocument = await composeDocumentImages(docFrontPreview, docBackPreview);
      const result = await kyc.mutateAsync({
        data: {
          fullName: String(form.get('fullName')).trim(),
          country: String(form.get('country')).trim(),
          city: String(form.get('city')).trim(),
          occupation: String(form.get('occupation')).trim(),
          documentType: String(form.get('documentType')) as 'passport' | 'drivers_license' | 'national_id',
          documentImageBase64: combinedDocument,
        }
      });
      qc.setQueryData(getGetProfileQueryKey(), (old: typeof profileData) => old ? { ...old, verificationStatus: result.status } : old);
      showFeedback('Verification submitted — awaiting admin review.');
    } catch (error) {
      const apiError = error as { status?: number; data?: { error?: string } };
      if (apiError.status === 413) {
        setKycSubmitError('The ID images are still too large. Please choose smaller images and try again.');
      } else {
        setKycSubmitError(apiError.data?.error || 'We could not submit your details. Check your connection and try again.');
      }
    } finally {
      setDocComposing(false);
    }
  };

  const copyReferral = () => {
    if (!referralData) return;
    navigator.clipboard?.writeText(referralData.shareUrl);
    share.mutate({ data: { channel: 'copy' } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetReferralQueryKey() }); showFeedback('Referral link copied'); },
      onError: () => showFeedback('Link copied'),
    });
  };

  const showKycForm = verStatus === 'unverified' || verStatus === 'rejected';
  const updateProfile = useUpdateProfile();
  const [editName, setEditName] = useState(profileData?.name ?? '');
  const [nameSaved, setNameSaved] = useState(false);
  const saveDisplayName = () => {
    if (!editName.trim()) return;
    updateProfile.mutate({ data: { displayName: editName.trim() } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        setNameSaved(true);
        setTimeout(() => setNameSaved(false), 2500);
        showFeedback('Display name updated.');
      }
    });
  };

  const navItems: [string, string, React.ElementType][] = [
    ['profile', 'Profile', Wallet],
    ['security', 'Security', ShieldCheck],
    ['verification', 'Verification', FileCheck2],
    ['referrals', 'Referrals', Sparkles],
  ];

  return (
    <Shell>
      <PageHeader eyebrow="Settings" title="Account & trust" detail="Keep your profile current and your account protected." />
      {feedback && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-bold text-primary animate-rise" data-testid="status-settings-feedback">
          <Check size={17} />{feedback}
        </div>
      )}
      <div className="grid gap-7 lg:grid-cols-[220px_1fr]">
        {/* Sidebar nav */}
        <nav className="surface h-fit rounded-2xl p-2">
          {navItems.map(([value, label, Icon]) => (
            <button key={value} onClick={() => setTab(value as typeof tab)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${tab === value ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
              data-testid={`button-settings-${value}`}>
              <Icon size={17} />{label}
            </button>
          ))}
          <div className="mt-3 border-t border-border pt-3">
            <button onClick={() => signOut()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-destructive hover:bg-destructive/10 transition"
              data-testid="button-sign-out">
              <X size={17} />Sign out
            </button>
          </div>
        </nav>

        {/* Tab panels */}
        <div className="min-w-0">
          {/* ── Profile tab ── */}
          {tab === 'profile' && (
            <div className="surface rounded-2xl p-6 sm:p-8">
              <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/15 text-xl font-extrabold text-primary" data-testid="text-profile-initials">
                  {profileData?.initials ?? initials(profileData?.name)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-extrabold">{profileData?.name ?? 'North State Blockchain account'}</h2>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{profileData?.email ?? 'Loading profile…'}</p>
                </div>
              </div>
              {profile.isLoading ? <div className="mt-7"><LoadingState lines={3} /></div>
                : profile.isError ? <div className="mt-7"><ErrorState retry={() => profile.refetch()} /></div>
                : (
                  <>
                    <div className="mt-7 grid gap-4 sm:grid-cols-2">
                      <Stat label="Account ID" value={user?.id ?? '—'} />
                      <Stat label="Verification status" value={verStatus ?? 'unverified'} accent={verStatus === 'verified'} />
                      <Stat label="Email" value={profileData?.email ?? '—'} />
                      <Stat label="Referral code" value={profileData?.initials ? `NORTHSTATE-${profileData.id?.slice(-6).toUpperCase()}` : '—'} />
                    </div>
                    <div className="mt-6 rounded-2xl border border-border p-5">
                      <p className="mb-3 text-sm font-bold">Display name</p>
                      <div className="flex gap-3">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder={profileData?.name ?? 'Your name'}
                          className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-secondary/40 px-3 text-sm outline-none focus:border-primary"
                          data-testid="input-display-name"
                        />
                        <button
                          onClick={saveDisplayName}
                          disabled={updateProfile.isPending || !editName.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
                          data-testid="button-save-display-name"
                        >
                          {nameSaved ? <><Check size={15} />Saved</> : updateProfile.isPending ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
            </div>
          )}

          {/* ── Security tab ── */}
          {tab === 'security' && <SecurityTab profile={profileData} />}

          {/* ── Verification tab ── */}
          {tab === 'verification' && (
            <div className="surface rounded-2xl p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <ShieldCheck size={21} />
                </div>
                <div>
                  <p className="eyebrow">Identity check</p>
                  <h2 className="mt-1 text-xl font-extrabold">Verify your account</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {!showKycForm
                      ? verStatus === 'verified'
                        ? 'Your identity has been verified. No further action needed.'
                        : 'Your submission is under review. Our team will notify you once it\'s processed.'
                      : 'Complete all fields below. Your information is reviewed securely by our compliance team.'}
                  </p>
                </div>
              </div>

              {/* Status banner */}
              {verStatus === 'verified' && (
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-bold text-primary">
                  <Check size={16} />Identity Verified
                </div>
              )}
              {verStatus === 'pending' && (
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/8 px-4 py-3 text-sm font-bold text-accent">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />KYC Pending Admin Approval
                </div>
              )}
              {verStatus === 'rejected' && (
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm font-bold text-destructive">
                  <X size={16} />Verification rejected — please resubmit below.
                </div>
              )}

              {/* Form — shown when unverified or rejected */}
              {showKycForm && (
                <form className="mt-7 grid gap-4" onSubmit={submitKyc}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full legal name" name="fullName" placeholder="As shown on your document" required data-testid="input-kyc-full-name" />
                    <Field label="Country of residence" name="country" placeholder="United States" required data-testid="input-kyc-country" />
                    <Field label="City / Town / State" name="city" placeholder="New York, NY" required data-testid="input-kyc-city" />
                    <Field label="Occupation / Employment" name="occupation" placeholder="Software Engineer" required data-testid="input-kyc-occupation" />
                    <SelectField label="Document type" name="documentType" defaultValue="passport" data-testid="select-kyc-document">
                      <option value="passport">Passport</option>
                      <option value="drivers_license">Driver's license</option>
                      <option value="national_id">National ID</option>
                    </SelectField>
                  </div>

                  {/* Both ID sides are required; the submit handler preserves the existing API payload. */}
                  <div className="grid gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Upload ID images</p>
                      <p className="mt-1 text-xs text-muted-foreground">Upload clear images of both sides of your ID. JFIF, JPG, JPEG, or PNG — max 5 MB each.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([
                        { side: 'front' as const, id: 'kyc-id-front', label: 'Front Side of ID', fileName: docFrontFileName, preview: docFrontPreview, testId: 'input-kyc-id-front' },
                        { side: 'back' as const, id: 'kyc-id-back', label: 'Back Side of ID', fileName: docBackFileName, preview: docBackPreview, testId: 'input-kyc-id-back' },
                      ]).map(({ side, id, label, fileName, preview, testId }) => (
                        <div key={side} className="grid gap-2">
                          <label htmlFor={id} className="text-sm font-semibold text-foreground">{label}</label>
                          <label htmlFor={id} className="relative flex min-h-28 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-4 transition hover:border-primary/40 hover:bg-secondary/70">
                            <Upload size={18} className="shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{fileName || `Choose ${side} image`}</p>
                              <p className="text-xs text-muted-foreground">Image only</p>
                            </div>
                            <input id={id} type="file" accept=".jfif,.jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={(event) => handleFileChange(event, side)} data-testid={testId} />
                          </label>
                          {preview && (
                            <div className="overflow-hidden rounded-xl border border-border">
                              <img src={preview} alt={`${label} preview`} className="max-h-40 w-full object-contain bg-secondary/30" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {docUploadError && <p className="text-sm font-semibold text-destructive" role="alert" data-testid="status-kyc-document-error">{docUploadError}</p>}
                  </div>

                  <Button type="submit" className="mt-2 sm:w-fit" disabled={kyc.isPending || docComposing} data-testid="button-submit-kyc">
                    {kyc.isPending || docComposing ? 'Preparing…' : 'Submit for review'} <ArrowUpRight size={16} />
                  </Button>
                  {kycSubmitError && (
                    <p className="text-sm font-semibold text-destructive" data-testid="status-kyc-error">
                      {kycSubmitError}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}

          {/* ── Referrals tab ── */}
          {tab === 'referrals' && (
            <div className="surface rounded-2xl p-6 sm:p-8">
              <p className="eyebrow">North State circle</p>
              <h2 className="mt-1 text-xl font-extrabold">Invite someone you trust</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Share your personal link with a friend. No leaderboard, no pressure — just a thoughtful way to bring someone in.</p>
              {referral.isLoading ? <div className="mt-7"><LoadingState lines={3} /></div>
                : referral.isError ? <div className="mt-7"><ErrorState retry={() => referral.refetch()} /></div>
                : referralData ? (
                  <>
                    <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/7 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-primary">Your referral code</p>
                      <div className="mt-2 flex items-center justify-between gap-4">
                        <code className="font-mono-ui text-xl font-medium tracking-widest">{referralData.code}</code>
                        <button onClick={() => { navigator.clipboard?.writeText(referralData.code); showFeedback('Referral code copied'); }}
                          className="rounded-lg border border-primary/20 p-2 text-primary hover:bg-primary/10" aria-label="Copy referral code" data-testid="button-copy-referral-code">
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Stat label="People invited" value={String(referralData.invitedCount)} />
                      <Stat label="Rewards earned" value={money(referralData.reward)} accent />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button onClick={copyReferral} disabled={share.isPending} data-testid="button-share-referral">
                        <Clipboard size={16} />{share.isPending ? 'Sharing…' : 'Copy invite link'}
                      </Button>
                      <Button variant="secondary" onClick={() => {
                        navigator.share?.({ title: 'Join me on North State Blockchain', url: referralData.shareUrl }).catch(() => undefined);
                        share.mutate({ data: { channel: 'native' } }, { onSuccess: () => showFeedback('Invite shared') });
                      }} data-testid="button-native-share">
                        <Send size={16} />Share
                      </Button>
                    </div>
                  </>
                ) : <EmptyState title="Your referral link is being prepared" detail="Check back shortly to share your personal North State Blockchain invite." />}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: React.ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function TradingRoute() { return <Shell><TradingPage /></Shell>; }
const categoryLabels: Record<string, string> = {
  gold: 'Gold & Precious Metals',
  energy: 'Energy & Power',
  stock: 'Major Equities',
  oil: 'Oil & Gas'
};

function MiningLogo({ symbol, name, color, size = 48 }: { symbol: string; name: string; color: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const file = getMiningLogoFile(symbol);
  const src = file ? `${basePath}/mining-logos/${file}` : '';
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <span role="img" aria-label={`${name} logo unavailable`} className="grid shrink-0 place-items-center rounded-xl border border-border bg-background/50 text-xs font-extrabold" style={{ width: size, height: size, color }}>{symbol.slice(0, 3)}</span>;
  return <img src={src} alt={`${name} logo`} width={size} height={size} className="shrink-0 rounded-xl bg-white p-1.5 object-contain" onError={() => setFailed(true)} />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'live') return <span className="inline-flex items-center gap-1.5 rounded-md bg-[#2db87a]/15 px-2 py-0.5 text-[10px] font-bold text-[#2db87a] uppercase tracking-widest"><span className="h-1.5 w-1.5 rounded-full bg-[#2db87a] animate-pulse" />Live</span>;
  if (status === 'stale') return <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f6ad3c]/15 px-2 py-0.5 text-[10px] font-bold text-[#f6ad3c] uppercase tracking-widest"><span className="h-1.5 w-1.5 rounded-full bg-[#f6ad3c]" />Stale</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive uppercase tracking-widest"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />Fallback</span>;
}

function AssetCard({ asset }: { asset: MiningPlaceAsset }) {
  const previousPrice = useRef(asset.price);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (previousPrice.current === asset.price) return;
    setPriceDirection(asset.price > previousPrice.current ? 'up' : 'down');
    previousPrice.current = asset.price;
    const timeout = window.setTimeout(() => setPriceDirection(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [asset.price]);

  return (
    <Link
      href={`/mining-place/${encodeURIComponent(asset.symbol)}`}
      className="surface group flex flex-col justify-between rounded-2xl p-5 transition duration-300 hover:-translate-y-0.5 hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`View ${asset.name} price details`}
      data-testid={`card-mining-${asset.symbol}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
           <MiningLogo symbol={asset.symbol} name={asset.name} color={asset.color} />
          <div>
            <p className="text-sm font-bold text-foreground">{asset.name}</p>
            <p className="font-mono-ui text-xs text-muted-foreground">{asset.symbol}</p>
          </div>
        </div>
        <StatusBadge status={asset.status} />
      </div>
      <div className="mt-8 flex items-end justify-between">
        <div>
          <p className={`font-mono-ui text-2xl font-extrabold tracking-tight text-foreground ${priceDirection ? `quote-flash-${priceDirection}` : ''}`}>
            {money(asset.price, asset.currency)}
          </p>
          {asset.unit && <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Per {asset.unit}</p>}
        </div>
        <p className={`font-mono-ui text-sm font-bold transition-colors ${asset.change24h >= 0 ? 'text-[#2db87a]' : 'text-destructive'} ${priceDirection ? `quote-change-${priceDirection}` : ''}`}>
          {pct(asset.change24h)}
        </p>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <span>View details</span>
        <ArrowUpRight size={14} className="text-primary transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}

function MiningPlace() {
  const { data, isLoading, isError, refetch } = useGetMiningPlace({
    query: {
      queryKey: getGetMiningPlaceQueryKey(),
      refetchInterval: 3_000,
      placeholderData: (prev) => prev
    }
  });
  const investments = useGetMiningInvestments({ query: { queryKey: getGetMiningInvestmentsQueryKey(), refetchInterval: 10_000 } });

  const assetsByCategory = useMemo(() => {
    if (!data?.assets) return {};
    const grouped: Record<string, MiningPlaceAsset[]> = {};
    for (const asset of data.assets) {
      if (!grouped[asset.category]) grouped[asset.category] = [];
      grouped[asset.category].push(asset);
    }
    return grouped;
  }, [data]);

  const categories = Object.keys(assetsByCategory).sort();

  return (
    <Shell>
      <div className="relative mb-10 overflow-hidden rounded-3xl border border-primary/20 bg-[#171209] p-8 sm:p-12 shadow-xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[80px]" />
        <div className="relative z-10">
          <p className="eyebrow flex items-center gap-2"><Landmark size={14} /> Mining Place</p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-[-.04em] text-foreground sm:text-4xl">Real-World Benchmarks</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
             A grounded perspective on the physical economy. Monitor live quotes and request USDC investments across commodities, energy, oil, and major equities.
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState lines={7} />
      ) : isError ? (
        <ErrorState retry={() => refetch()} />
      ) : !data || data.assets.length === 0 ? (
        <EmptyState title="No assets available" detail="Real-world benchmarks are currently offline." />
      ) : (
        <div className="animate-rise grid gap-10">
          <section className="surface rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div><p className="eyebrow">Your investments</p><h2 className="mt-1 text-lg font-extrabold">Mining Place positions</h2></div>
              <span className="font-mono-ui text-sm text-primary">Available: {money(investments.data?.availableUsdc ?? 0)} USDC</span>
            </div>
            {investments.isLoading ? <div className="mt-4"><LoadingState lines={2} /></div> : !investments.data?.investments.length ? (
              <p className="mt-4 text-sm text-muted-foreground">Open an asset to submit your first investment request.</p>
            ) : <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {investments.data.investments.map(investment => <div key={investment.id} className="rounded-xl border border-border bg-background/40 p-4">
                <div className="flex items-center justify-between"><strong>{investment.symbol}</strong><span className={`text-xs font-bold capitalize ${investment.status === 'active' ? 'text-[#2db87a]' : investment.status === 'rejected' ? 'text-destructive' : 'text-accent'}`}>{investment.status}</span></div>
                <p className="mt-2 font-mono-ui text-lg">{money(investment.approvedAmount ?? investment.requestedAmount)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{investment.units?.toFixed(6) ?? '—'} units · {dateLabel(investment.createdAt)}</p>
                {investment.adminNote && <p className="mt-2 text-xs text-muted-foreground">{investment.adminNote}</p>}
              </div>)}
            </div>}
          </section>
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
             <h2 className="text-sm font-bold text-foreground">Market Feeds</h2>
             <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
               <RefreshCw size={12} className="text-primary" /> Live · 3 sec refresh · Updated {new Date(data.updatedAt).toLocaleTimeString()}
             </span>
          </div>
          {categories.map(category => (
            <section key={category}>
              <h3 className="mb-5 text-xs font-extrabold uppercase tracking-widest text-muted-foreground">{categoryLabels[category] || category}</h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {assetsByCategory[category].map(asset => (
                  <AssetCard key={asset.symbol} asset={asset} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Shell>
  );
}

function MiningPlaceDetail() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const miningPlace = useGetMiningPlace({
    query: {
      queryKey: getGetMiningPlaceQueryKey(),
      refetchInterval: 3_000,
      placeholderData: (prev) => prev
    }
  });
  const investments = useGetMiningInvestments({ query: { queryKey: getGetMiningInvestmentsQueryKey() } });
  const createInvestment = useCreateMiningInvestment();
  const queryClient = useQueryClient();
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [investmentMessage, setInvestmentMessage] = useState('');
  const item = miningPlace.data?.assets.find((asset) => asset.symbol.toLowerCase() === symbol.toLowerCase());
  const chart = useMemo(() => {
    if (!item) return [];
    const direction = item.change24h >= 0 ? 1 : -1;
    const movement = Math.max(Math.abs(item.change24h), 0.35) / 100;
    return Array.from({ length: 24 }, (_, index) => ({
      time: `${String(index).padStart(2, '0')}:00`,
      value: index === 23 ? item.price : item.price * (
        1
        - direction * movement
        + direction * movement * (index / 23)
        + Math.sin(index / 2.8) * movement * 0.18
      ),
    }));
  }, [item]);

  return (
    <Shell>
      <Link href="/mining-place" className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-mining-place">
        <ArrowLeft size={16} /> Back to Mining Place
      </Link>
      {miningPlace.isLoading ? <LoadingState lines={5} /> : miningPlace.isError ? <ErrorState retry={() => miningPlace.refetch()} /> : !item ? (
        <EmptyState title="Benchmark not found" detail="That asset is not part of the current Mining Place benchmark set." />
      ) : (
        <>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="flex items-center gap-4">
              <MiningLogo symbol={item.symbol} name={item.name} color={item.color} size={56} />
              <div>
                <p className="eyebrow">{item.symbol} benchmark</p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-[-.05em]">{item.name}</h1>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="font-mono-ui text-3xl font-medium" data-testid="text-mining-price">{money(item.price, item.currency)}</p>
              <p className={`mt-1 text-sm font-bold ${item.change24h >= 0 ? 'text-[#2db87a]' : 'text-destructive'}`}>{pct(item.change24h)} today</p>
            </div>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-4">
            <Stat label="Unit" value={item.unit ? `Per ${item.unit}` : 'Benchmark'} />
            <Stat label="Category" value={categoryLabels[item.category] ?? item.category} />
            <Stat label="Feed" value={item.status === 'live' ? 'Live quote' : item.status === 'stale' ? 'Stale quote' : 'Fallback quote'} accent={item.status === 'live'} />
            <Stat label="Updated" value={new Date(item.updatedAt).toLocaleTimeString()} />
          </div>
          <div className="surface mt-7 grid gap-6 rounded-2xl p-5 sm:grid-cols-[1fr_.8fr] sm:p-7">
            <div>
              <p className="eyebrow">USDC investment request</p>
              <h2 className="mt-2 text-xl font-extrabold">Invest in {item.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Your request remains pending until an administrator reviews it. USDC is deducted only after approval.</p>
              <p className="mt-4 text-sm font-bold text-primary">Available: {money(investments.data?.availableUsdc ?? 0)} USDC</p>
            </div>
            <form className="grid gap-3" onSubmit={(event) => {
              event.preventDefault();
              const amount = Number(investmentAmount);
              createInvestment.mutate({ data: { symbol: item.symbol as never, amount } }, {
                onSuccess: () => {
                  setInvestmentAmount('');
                  setInvestmentMessage('Investment request submitted for admin review.');
                  queryClient.invalidateQueries({ queryKey: getGetMiningInvestmentsQueryKey() });
                },
                onError: (error) => setInvestmentMessage(error instanceof Error ? error.message : 'Unable to submit request.'),
              });
            }}>
              <Field label="Amount (USDC)" type="number" min="0.01" step="0.01" value={investmentAmount} onChange={event => setInvestmentAmount(event.target.value)} required data-testid="input-mining-investment-amount" />
              <p className="text-xs text-muted-foreground">Estimated units: {investmentAmount && Number(investmentAmount) > 0 ? (Number(investmentAmount) / item.price).toFixed(8) : '0.00000000'}</p>
              {investmentMessage && <p className="text-xs font-semibold text-primary" data-testid="status-mining-investment">{investmentMessage}</p>}
              <Button type="submit" disabled={createInvestment.isPending} data-testid="button-submit-mining-investment">{createInvestment.isPending ? 'Submitting…' : 'Submit for review'}</Button>
            </form>
          </div>
          <div className="surface mt-7 rounded-2xl p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="eyebrow">Movement preview</p>
                <h2 className="mt-1 text-lg font-extrabold tracking-[-.03em]">Benchmark price movement</h2>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Updates every 3 sec</span>
              </div>
            </div>
            <div className="mt-8 h-64">
              <Chart points={chart} />
            </div>
            <div className="mt-3 flex justify-between text-[10px] font-mono-ui text-muted-foreground">
              <span>EARLIER</span><span>NOW</span>
            </div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">Chart preview is anchored to the latest public quote and its reported 24-hour movement. Refreshing quotes update the view automatically.</p>
          </div>
        </>
      )}
    </Shell>
  );
}

function Router() { return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/about" component={About} /><Route path="/sign-in/*?" component={() => <ClerkAuthPage />} /><Route path="/sign-up/*?" component={() => <ClerkAuthPage signUp />} /><Route path="/dashboard" component={Dashboard} /><Route path="/markets" component={Markets} /><Route path="/markets/:symbol" component={MarketDetail} /><Route path="/mining-place/:symbol" component={MiningPlaceDetail} /><Route path="/mining-place" component={MiningPlace} /><Route path="/activity" component={ActivityPage} /><Route path="/trading" component={TradingRoute} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>; }
function SupportChatWidget() {
  const { isSignedIn, isLoaded } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useGetSupportMessages({
    query: { queryKey: getGetSupportMessagesQueryKey(), enabled: !!isSignedIn, refetchInterval: open ? 5000 : false },
  });
  const sendMut = useSendSupportMessage();
  const messages = data?.messages ?? [];

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      await sendMut.mutateAsync({ data: { content: text } });
      qc.invalidateQueries({ queryKey: getGetSupportMessagesQueryKey() });
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_32px_hsl(var(--primary)/.4)] transition-transform hover:scale-105 active:scale-95"
        aria-label="Customer support"
        data-testid="button-support-chat"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[360px] max-h-[calc(100dvh-120px)] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-border bg-[hsl(222_10%_9%)] shadow-[0_24px_80px_rgba(0,0,0,.55)]">
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border bg-[hsl(222_10%_11%)] px-4 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
              <MessageCircle size={17} />
            </div>
            <div>
              <p className="text-sm font-bold">North State Blockchain Support</p>
              <p className="text-[11px] text-muted-foreground">We typically reply within a few hours</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close chat">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {!isLoaded ? null : !isSignedIn ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/12 text-primary">
                  <Lock size={20} />
                </div>
                <p className="text-sm font-bold">Sign in to chat with support</p>
                <p className="text-xs leading-5 text-muted-foreground">Create an account or sign in to get personalised help from our team.</p>
              </div>
            ) : isLoading ? (
              <div className="flex h-full items-center justify-center">
                <span className="text-xs text-muted-foreground">Loading…</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/12 text-primary">
                  <MessageCircle size={20} />
                </div>
                <p className="text-sm font-bold">How can we help?</p>
                <p className="text-xs leading-5 text-muted-foreground">Send us a message and our team will get back to you as soon as possible.</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.senderRole === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.senderRole === 'admin' && (
                    <div className="mr-2 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">N</div>
                  )}
                  <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${msg.senderRole === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-secondary/60 text-foreground'}`}>
                    <p className="text-sm leading-5 whitespace-pre-wrap">{msg.content}</p>
                    <p className={`mt-1 text-[10px] ${msg.senderRole === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {isSignedIn && (
            <div className="shrink-0 border-t border-border p-3">
              <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message…"
                  rows={1}
                  className="min-h-[40px] max-h-[100px] flex-1 resize-none rounded-xl border border-input bg-secondary/40 px-3 py-2.5 text-sm leading-5 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
                  data-testid="input-support-message"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition disabled:opacity-40 hover:scale-105 active:scale-95"
                  aria-label="Send message"
                  data-testid="button-support-send"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    afterSignOutUrl={basePath || '/'}
    localization={{
      signIn: {
        start: {
          title: 'Welcome back',
          subtitle: 'Sign in to access your North State Blockchain account',
        },
      },
      signUp: {
        start: {
          title: 'Open your North State Blockchain account',
          subtitle: 'Create a secure account to begin',
        },
      },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /><SupportChatWidget /></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function App() { return <WouterRouter base={basePath}><ClerkApp /></WouterRouter>; }
export default App;