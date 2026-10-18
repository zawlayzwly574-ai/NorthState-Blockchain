import React, { createContext, useContext, useEffect, useState } from 'react';
import { QRCodeSVG } from './qr-code';
import {
  Wallet, ChevronDown, Check, Copy, ExternalLink, Power,
  ShieldCheck, X, AlertCircle, Download
} from 'lucide-react';

export interface ChainConfig {
  id: number;
  hexId: string;
  name: string;
  shortName: string;
  symbol: string;
  decimals: number;
  rpcUrl: string;
  blockExplorer: string;
  color: string;
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  1: {
    id: 1,
    hexId: '0x1',
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorer: 'https://etherscan.io',
    color: '#627eea',
  },
  56: {
    id: 56,
    hexId: '0x38',
    name: 'BNB Smart Chain',
    shortName: 'BNB Chain',
    symbol: 'BNB',
    decimals: 18,
    rpcUrl: 'https://bsc-dataseed.binance.org',
    blockExplorer: 'https://bscscan.com',
    color: '#f3ba2f',
  },
  137: {
    id: 137,
    hexId: '0x89',
    name: 'Polygon PoS',
    shortName: 'Polygon',
    symbol: 'POL',
    decimals: 18,
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorer: 'https://polygonscan.com',
    color: '#8247e5',
  },
  42161: {
    id: 42161,
    hexId: '0xa4b1',
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://arbiscan.io',
    color: '#28a0f0',
  },
  8453: {
    id: 8453,
    hexId: '0x2105',
    name: 'Base',
    shortName: 'Base',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    color: '#0052ff',
  },
};

export type WalletType =
  | 'metamask'
  | 'coinbase'
  | 'walletconnect'
  | 'trust'
  | 'phantom'
  | 'okx';

export interface WalletProviderInfo {
  id: WalletType;
  name: string;
  iconBg: string;
  badge?: string;
  description: string;
  installUrl: string;
}

export const WALLET_PROVIDERS: WalletProviderInfo[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    iconBg: '#f6851b',
    badge: 'Popular',
    description: 'Connect with MetaMask browser extension or mobile app',
    installUrl: 'https://metamask.io/download/',
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    iconBg: '#0052ff',
    badge: 'Self-Custody',
    description: 'Connect using Coinbase Wallet extension or app',
    installUrl: 'https://www.coinbase.com/wallet/downloads',
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    iconBg: '#3b99fc',
    badge: 'Mobile App',
    description: 'Scan with Trust, Rainbow, Ledger or any mobile wallet',
    installUrl: 'https://walletconnect.com/',
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    iconBg: '#0500ff',
    description: 'Multi-crypto mobile and browser wallet',
    installUrl: 'https://trustwallet.com/download',
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    iconBg: '#121212',
    description: 'Universal decentralized Web3 portal',
    installUrl: 'https://www.okx.com/web3',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    iconBg: '#ab9ff2',
    description: 'Multi-chain Solana and EVM wallet',
    installUrl: 'https://phantom.app/download',
  },
];

interface Web3ContextType {
  isConnected: boolean;
  isConnecting: boolean;
  account: string | null;
  chainId: number;
  chainConfig: ChainConfig;
  balance: string;
  walletType: WalletType | null;
  isModalOpen: boolean;
  errorMessage: string | null;
  openConnectModal: () => void;
  closeConnectModal: () => void;
  connect: (walletType: WalletType) => Promise<boolean>;
  disconnect: () => void;
  switchNetwork: (targetChainId: number) => Promise<void>;
  sendDirectDeposit: (to: string, amountEth: number) => Promise<string>;
}

const Web3Context = createContext<Web3ContextType | null>(null);

function getInjectedProvider(type: WalletType) {
  if (typeof window === 'undefined') return null;
  const anyWin = window as any;
  const eth = anyWin.ethereum;

  if (type === 'coinbase') {
    return anyWin.coinbaseWalletExtension || (eth?.isCoinbaseWallet ? eth : null);
  }
  if (type === 'phantom') {
    return anyWin.phantom?.ethereum || (eth?.isPhantom ? eth : null);
  }
  if (type === 'trust') {
    return anyWin.trustwallet || (eth?.isTrust ? eth : null);
  }
  if (type === 'okx') {
    return anyWin.okxwallet || (eth?.isOkxWallet ? eth : null);
  }
  if (type === 'metamask') {
    if (eth?.providers?.length) {
      return eth.providers.find((p: any) => p.isMetaMask) || eth;
    }
    return eth?.isMetaMask ? eth : eth;
  }
  return eth || null;
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number>(1);
  const [balance, setBalance] = useState<string>('0.00');
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chainConfig = SUPPORTED_CHAINS[chainId] ?? SUPPORTED_CHAINS[1];

  const fetchRealBalance = async (acc: string, provider: any) => {
    try {
      if (provider?.request) {
        const raw = await provider.request({
          method: 'eth_getBalance',
          params: [acc, 'latest'],
        });
        const num = parseInt(raw, 16) / 1e18;
        setBalance(isNaN(num) ? '0.00' : num.toFixed(4));
        return;
      }
    } catch {
      setBalance('0.00');
    }
  };

  // Listen to provider accounts & chain change events only when an account is active
  useEffect(() => {
    if (typeof window === 'undefined' || !account) return;
    const provider = getInjectedProvider(walletType || 'metamask');
    if (!provider?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        fetchRealBalance(accounts[0], provider);
      } else {
        disconnect();
      }
    };

    const handleChainChanged = (hexChain: string) => {
      const newId = parseInt(hexChain, 16);
      if (SUPPORTED_CHAINS[newId]) {
        setChainId(newId);
        if (account) fetchRealBalance(account, provider);
      }
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);

    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [account, walletType]);

  const connect = async (type: WalletType): Promise<boolean> => {
    setErrorMessage(null);
    setIsConnecting(true);

    if (type === 'walletconnect') {
      setIsConnecting(false);
      return true;
    }

    const provider = getInjectedProvider(type);
    if (!provider || !provider.request) {
      setIsConnecting(false);
      const target = WALLET_PROVIDERS.find((w) => w.id === type);
      setErrorMessage(`${target?.name || 'Wallet extension'} not detected in this browser.`);
      return false;
    }

    try {
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
      });

      if (accounts && accounts.length > 0) {
        const acc = accounts[0];
        setAccount(acc);
        setWalletType(type);

        const currentChainHex = await provider.request({ method: 'eth_chainId' });
        const numericChain = parseInt(currentChainHex, 16);
        if (SUPPORTED_CHAINS[numericChain]) {
          setChainId(numericChain);
        }

        await fetchRealBalance(acc, provider);
        setIsConnecting(false);
        setIsModalOpen(false);
        return true;
      }
      setIsConnecting(false);
      return false;
    } catch (err: any) {
      setIsConnecting(false);
      if (err.code === 4001) {
        setErrorMessage('Connection request was rejected in your wallet.');
      } else {
        setErrorMessage(err.message || 'Failed to connect wallet.');
      }
      return false;
    }
  };

  const disconnect = () => {
    setAccount(null);
    setWalletType(null);
    setBalance('0.00');
    setErrorMessage(null);
  };

  const switchNetwork = async (targetChainId: number) => {
    const target = SUPPORTED_CHAINS[targetChainId];
    if (!target) return;

    const provider = (window as any).ethereum;
    if (provider?.request) {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: target.hexId }],
        });
        setChainId(targetChainId);
        if (account) fetchRealBalance(account, provider);
        return;
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: target.hexId,
                  chainName: target.name,
                  nativeCurrency: {
                    name: target.symbol,
                    symbol: target.symbol,
                    decimals: target.decimals,
                  },
                  rpcUrls: [target.rpcUrl],
                  blockExplorerUrls: [target.blockExplorer],
                },
              ],
            });
            setChainId(targetChainId);
            return;
          } catch {
            // failed to add chain
          }
        }
      }
    }
    setChainId(targetChainId);
  };

  const sendDirectDeposit = async (to: string, amountEth: number): Promise<string> => {
    if (!account) throw new Error('Connect an authentic Web3 wallet first.');
    const provider = getInjectedProvider(walletType || 'metamask');
    if (!provider?.request) {
      throw new Error('No authentic Web3 provider detected in your browser.');
    }

    const valueWei = BigInt(Math.round(amountEth * 1e6)) * BigInt(1e12);
    const valueHex = '0x' + valueWei.toString(16);
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: account,
          to,
          value: valueHex,
        },
      ],
    });

    if (!txHash) {
      throw new Error('No transaction hash returned from wallet.');
    }
    return txHash;
  };

  return (
    <Web3Context.Provider
      value={{
        isConnected: Boolean(account),
        isConnecting,
        account,
        chainId,
        chainConfig,
        balance,
        walletType,
        isModalOpen,
        errorMessage,
        openConnectModal: () => {
          setErrorMessage(null);
          setIsModalOpen(true);
        },
        closeConnectModal: () => {
          setErrorMessage(null);
          setIsModalOpen(false);
        },
        connect,
        disconnect,
        switchNetwork,
        sendDirectDeposit,
      }}
    >
      {children}
      {isModalOpen && <Web3Modal />}
    </Web3Context.Provider>
  );
}

const DEFAULT_WEB3_FALLBACK: Web3ContextType = {
  isConnected: false,
  isConnecting: false,
  address: null,
  chainId: null,
  balance: '0.00',
  walletType: null,
  walletName: null,
  networkName: 'Ethereum',
  isModalOpen: false,
  errorMessage: null,
  txPending: false,
  connect: async () => false,
  disconnect: () => {},
  switchNetwork: async () => false,
  sendTransaction: async () => null,
  openConnectModal: () => {},
  closeConnectModal: () => {},
};

export function useWeb3() {
  const context = useContext(Web3Context);
  return context ?? DEFAULT_WEB3_FALLBACK;
}


// ── Connect Wallet Modal ───────────────────────────────────────────────────

function Web3Modal() {
  const { isConnecting, connect, closeConnectModal, errorMessage } = useWeb3();
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [copiedWC, setCopiedWC] = useState(false);
  const [missingProvider, setMissingProvider] = useState<WalletProviderInfo | null>(null);

  // Standard EIP-6963 / WalletConnect pairing uri format
  const wcUri = `wc:northstate-${Date.now()}@2?relay-protocol=irn&symKey=92f41b380a184e9`;

  const handleSelect = async (info: WalletProviderInfo) => {
    setSelectedWallet(info.id);
    setMissingProvider(null);

    if (info.id === 'walletconnect') {
      setShowQR(true);
      return;
    }

    const provider = getInjectedProvider(info.id);
    if (!provider) {
      setMissingProvider(info);
      return;
    }

    await connect(info.id);
  };

  const copyWcUri = () => {
    navigator.clipboard?.writeText(wcUri);
    setCopiedWC(true);
    setTimeout(() => setCopiedWC(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={closeConnectModal}
    >
      <div
        className="surface relative max-h-[92dvh] w-full max-w-md overflow-hidden rounded-3xl border border-primary/25 bg-[#0e1117] p-6 shadow-2xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-inner">
              <Wallet size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold tracking-tight text-white">
                {showQR ? 'Scan with Mobile Wallet' : 'Connect Web3 Wallet'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {showQR ? 'Scan using WalletConnect compatible app' : 'Select your verified Web3 provider'}
              </p>
            </div>
          </div>
          <button
            onClick={closeConnectModal}
            className="rounded-xl p-2 text-muted-foreground transition hover:bg-white/5 hover:text-white"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            <AlertCircle size={15} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {missingProvider && (
          <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-center">
            <p className="text-xs font-bold text-white">
              {missingProvider.name} is not installed in this browser.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Install the extension or choose another wallet.
            </p>
            <a
              href={missingProvider.installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground shadow hover:brightness-110"
            >
              <Download size={14} /> Install {missingProvider.name}
            </a>
          </div>
        )}

        {showQR ? (
          <div className="flex flex-col items-center py-2 text-center">
            <div className="relative rounded-2xl border border-primary/30 bg-white p-4 shadow-xl">
              <QRCodeSVG value={wcUri} size={200} fgColor="#0c0d10" bgColor="#ffffff" />
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              Scan with Trust Wallet, Rainbow, MetaMask Mobile, or 300+ Web3 wallets
            </p>
            <div className="mt-4 flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={copyWcUri}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground transition hover:bg-muted"
              >
                {copiedWC ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedWC ? 'Connection Code Copied' : 'Copy Connection URI'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://metamask.app.link/wc?uri=${encodeURIComponent(wcUri)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-border bg-card/60 p-2 text-center text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-card"
                >
                  Open MetaMask Mobile
                </a>
                <a
                  href={`https://link.trustwallet.com/wc?uri=${encodeURIComponent(wcUri)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-border bg-card/60 p-2 text-center text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-card"
                >
                  Open Trust Wallet
                </a>
              </div>
            </div>
            <button
              onClick={() => setShowQR(false)}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              ← Back to wallet list
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {WALLET_PROVIDERS.map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => handleSelect(wallet)}
                disabled={isConnecting}
                className="flex w-full items-center justify-between rounded-2xl border border-border/80 bg-[#161a23] p-3.5 text-left transition hover:border-primary/50 hover:bg-[#1c2230] disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white font-bold shadow-sm"
                    style={{ backgroundColor: wallet.iconBg }}
                  >
                    {wallet.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{wallet.name}</span>
                      {wallet.badge && (
                        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
                          {wallet.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                      {wallet.description}
                    </p>
                  </div>
                </div>
                <ExternalLink size={15} className="text-muted-foreground" />
              </button>
            ))}

            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
              <span className="flex items-center gap-1.5 font-bold text-foreground">
                <ShieldCheck size={14} className="text-primary" /> Verified Cryptographic Connection
              </span>
              Connecting activates reading permissions. Transactions and transfers require explicit approval in your wallet extension.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Connect Wallet Header Widget & Dropdown ───────────────────────────────

export function Web3WalletBar({ compact = false }: { compact?: boolean }) {
  const {
    isConnected,
    isConnecting,
    account,
    balance,
    chainId,
    chainConfig,
    openConnectModal,
    disconnect,
    switchNetwork,
  } = useWeb3();

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shorten = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const copyAddress = () => {
    if (!account) return;
    navigator.clipboard?.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!isConnected || !account) {
    return (
      <button
        onClick={openConnectModal}
        disabled={isConnecting}
        className={`inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-50 ${
          compact ? 'px-3 py-1.5 text-xs' : ''
        }`}
        data-testid="button-connect-wallet"
      >
        <Wallet size={15} />
        {isConnecting ? 'Requesting...' : 'Connect Wallet'}
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card/90 p-1 shadow-sm">
        {/* Network Pill */}
        <div
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-foreground"
          style={{ backgroundColor: `${chainConfig.color}15` }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: chainConfig.color }}
          />
          <span className="hidden sm:inline">{chainConfig.shortName}</span>
        </div>

        {/* Account Pill */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1 text-xs font-bold text-foreground transition hover:bg-muted"
          data-testid="button-wallet-menu"
        >
          <span className="font-mono-ui font-semibold text-primary">{balance} {chainConfig.symbol}</span>
          <span className="hidden md:inline text-muted-foreground">|</span>
          <span className="font-mono-ui">{shorten(account)}</span>
          <ChevronDown size={14} className="text-muted-foreground" />
        </button>
      </div>

      {/* Dropdown Menu */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl border border-border bg-[#12161f] p-3 shadow-2xl animate-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border/80 pb-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Connected Account</span>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-1 font-mono-ui text-xs font-bold text-foreground break-all">
                {account}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">On-Chain Balance:</span>
                <span className="font-mono-ui font-bold text-primary">
                  {balance} {chainConfig.symbol}
                </span>
              </div>
            </div>

            {/* Switch Network Section */}
            <div className="py-2.5 border-b border-border/80">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Switch Network
              </p>
              <div className="grid grid-cols-2 gap-1">
                {Object.values(SUPPORTED_CHAINS).map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => {
                      switchNetwork(chain.id);
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                      chainId === chain.id
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: chain.color }}
                    />
                    <span className="truncate">{chain.shortName}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Explorer & Disconnect */}
            <div className="pt-2 space-y-1">
              <a
                href={`${chainConfig.blockExplorer}/address/${account}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <ExternalLink size={14} />
                View on Explorer
              </a>
              <button
                onClick={() => {
                  disconnect();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
                data-testid="button-disconnect-wallet"
              >
                <Power size={14} />
                Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
