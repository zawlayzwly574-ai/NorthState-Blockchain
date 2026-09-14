import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function getAdminKey() {
  return localStorage.getItem('admin_key') ?? sessionStorage.getItem('admin_key');
}

export function setAdminKey(key: string) {
  localStorage.setItem('admin_key', key);
  sessionStorage.removeItem('admin_key');
}

export function clearAdminKey() {
  localStorage.removeItem('admin_key');
  sessionStorage.removeItem('admin_key');
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '';
  window.location.href = `${base}/login`;
}

async function apiClient(endpoint: string, options: RequestInit = {}) {
  const key = getAdminKey();
  const headers = new Headers(options.headers);
  if (key) {
    headers.set('X-Admin-Key', key);
  }
  headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api/admin${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `API Error: ${res.statusText}`);
  }

  return res.json();
}

// Data Shapes
export interface AdminStats {
  totalUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  pendingKyc: number;
  pendingInvestments: number;
  totalTransactions: number;
}

export interface MiningInvestment {
  id: string;
  clerkUserId: string;
  displayName: string;
  email: string;
  symbol: string;
  assetName: string;
  requestedAmount: number;
  approvedAmount: number | null;
  units: number | null;
  entryPrice: number;
  currentValue: number;
  gainLoss: number;
  status: 'pending' | 'active' | 'rejected';
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export function useAdminMiningInvestments() {
  return useQuery<MiningInvestment[]>({
    queryKey: ['admin', 'mining-investments'],
    queryFn: () => apiClient('/mining-investments'),
    refetchInterval: 5000,
  });
}

function useMiningInvestmentMutation(action: 'approve' | 'reject' | 'update') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: Record<string, unknown> }) =>
      apiClient(action === 'update' ? `/mining-investments/${id}` : `/mining-investments/${id}/${action}`, {
        method: action === 'update' ? 'PATCH' : 'POST',
        body: JSON.stringify(data ?? {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'mining-investments'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useApproveMiningInvestment() { return useMiningInvestmentMutation('approve'); }
export function useRejectMiningInvestment() { return useMiningInvestmentMutation('reject'); }
export function useUpdateMiningInvestment() { return useMiningInvestmentMutation('update'); }

export interface User {
  id: string;
  clerkUserId: string;
  displayName: string;
  email: string;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  referralCode: string | null;
  totalHoldings: number;
  createdAt: string;
  accountStatus: 'active' | 'suspended' | 'frozen' | 'deleted';
}

export interface Transaction {
  id: string;
  clerkUserId: string;
  displayName: string;
  email: string;
  type: 'deposit' | 'withdrawal' | 'send';
  asset: string;
  amount: number;
  destination: string | null;
  txHash: string | null;
  proofPath: string | null;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface KycSubmission {
  id: string;
  clerkUserId: string;
  displayName: string;
  email: string;
  fullName: string;
  country: string;
  city: string;
  occupation: string;
  ssn: string;
  documentType: string;
  documentImageBase64?: string;
  status: 'pending' | 'verified' | 'rejected';
  submittedAt: string;
}

// Hooks

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiClient('/stats'),
    refetchInterval: 10000, // Real-time feel
  });
}

export function useAdminUsers() {
  return useQuery<User[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient('/users'),
  });
}

export interface UserDetail {
  id: string;
  clerkUserId: string;
  displayName: string;
  email: string;
  verificationStatus: string;
  totalHoldings: number;
  createdAt: string;
  holdings: Array<{
    symbol: string; name: string; amount: number; value: number;
    allocation: number; change24h: number; color: string;
  }>;
  transactions: Array<{
    id: string; type: string; asset: string; amount: number; status: string; createdAt: string;
  }>;
  kyc: KycSubmission | null;
}

export function useAdminUserDetail(userId: string) {
  return useQuery<UserDetail>({
    queryKey: ['admin', 'users', userId],
    queryFn: () => apiClient(`/users/${userId}`),
    enabled: !!userId,
  });
}

export function useUpdateAdminUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status }: {
      userId: string;
      status: 'active' | 'suspended' | 'frozen';
    }) => apiClient(`/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', variables.userId] });
    },
  });
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient(`/users/${userId}`, { method: 'DELETE' }),
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.removeQueries({ queryKey: ['admin', 'users', userId] });
    },
  });
}

export function useAdjustAdminUserBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, direction, amount, reason }: {
      userId: string;
      direction: 'credit' | 'debit';
      amount: string;
      reason: string;
    }) => apiClient(`/users/${userId}/balance-adjustment`, {
      method: 'POST',
      body: JSON.stringify({ direction, amount, reason }),
    }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', variables.userId] });
    },
  });
}

export function useAdminTransactions() {
  return useQuery<Transaction[]>({
    queryKey: ['admin', 'transactions'],
    queryFn: () => apiClient('/transactions'),
  });
}

export function useAdminKyc() {
  return useQuery<KycSubmission[]>({
    queryKey: ['admin', 'kyc'],
    queryFn: () => apiClient('/kyc'),
  });
}

// Trading
export interface AdminTrade {
  id: number;
  clerkUserId: string;
  displayName: string;
  email: string;
  asset: string;
  direction: 'long' | 'short';
  amount: number;
  timeframeSecs: number;
  status: 'active' | 'completed';
  result: 'win' | 'loss' | null;
  adminOverride: 'win' | 'loss' | null;
  entryPrice: number;
  exitPrice: number | null;
  payout: number | null;
  payoutRate: number;
  createdAt: string;
  expiresAt: string;
  settledAt: string | null;
}

export interface AdminTradingStats {
  totalTrades: number;
  activeTrades: number;
  wins: number;
  losses: number;
  totalVolume: number;
}

export function useAdminTrades() {
  return useQuery<AdminTrade[]>({
    queryKey: ['admin', 'trading', 'trades'],
    queryFn: () => apiClient('/trading/trades'),
    refetchInterval: 5000,
  });
}

export function useAdminTradingStats() {
  return useQuery<AdminTradingStats>({
    queryKey: ['admin', 'trading', 'stats'],
    queryFn: () => apiClient('/trading/stats'),
    refetchInterval: 5000,
  });
}

export function useSetTradeOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outcome }: { id: number; outcome: 'win' | 'loss' }) =>
      apiClient(`/trading/trades/${id}/outcome`, { method: 'PATCH', body: JSON.stringify({ outcome }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'trading'] });
    },
  });
}

// Support chat
export interface SupportMessage {
  id: number;
  threadId: number;
  senderRole: 'user' | 'admin';
  content: string;
  createdAt: string;
}

export interface SupportThreadItem {
  userId: string;
  displayName: string;
  email: string;
  threadId: number;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface SupportThreadDetail {
  userId: string;
  displayName: string;
  email: string;
  threadId: number;
  messages: SupportMessage[];
}

export function useAdminSupportThreads() {
  return useQuery<SupportThreadItem[]>({
    queryKey: ['admin', 'support'],
    queryFn: () => apiClient('/support').then((d: { threads: SupportThreadItem[] }) => d.threads),
    refetchInterval: 5000,
  });
}

export function useAdminSupportThread(userId: string) {
  return useQuery<SupportThreadDetail>({
    queryKey: ['admin', 'support', userId],
    queryFn: () => apiClient(`/support/${userId}`),
    enabled: !!userId,
    refetchInterval: 3000,
  });
}

export function useAdminSupportReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, content }: { userId: string; content: string }) =>
      apiClient(`/support/${userId}/reply`, { method: 'POST', body: JSON.stringify({ content }) }),
    onSuccess: (_data: unknown, variables: { userId: string; content: string }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'support', variables.userId] });
    },
  });
}

// Mutations

export function useApproveTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/transactions/${id}/approve`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useRejectTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/transactions/${id}/reject`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useApproveKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/kyc/${id}/approve`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useRejectKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/kyc/${id}/reject`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}
