import { useState } from 'react';
import { Check, X, Save, Pickaxe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminMiningInvestments,
  useApproveMiningInvestment,
  useRejectMiningInvestment,
  useUpdateMiningInvestment,
} from '@/lib/api';

export default function MiningInvestments() {
  const { data = [], isLoading } = useAdminMiningInvestments();
  const approve = useApproveMiningInvestment();
  const reject = useRejectMiningInvestment();
  const update = useUpdateMiningInvestment();
  const { toast } = useToast();
  const [status, setStatus] = useState('pending');
  const [drafts, setDrafts] = useState<Record<string, { amount?: string; value?: string; note?: string }>>({});
  const rows = data.filter(item => status === 'all' || item.status === status);
  const mutate = (kind: 'approve' | 'reject' | 'update', id: string) => {
    const draft = drafts[id] ?? {};
    const mutation = kind === 'approve' ? approve : kind === 'reject' ? reject : update;
    const item = data.find(entry => entry.id === id);
    const payload = kind === 'update'
      ? item?.status === 'active'
        ? { currentValue: Number(draft.value ?? item.currentValue), adminNote: draft.note ?? item.adminNote }
        : { approvedAmount: Number(draft.amount ?? item?.approvedAmount ?? item?.requestedAmount), adminNote: draft.note ?? item?.adminNote }
      : kind === 'reject' ? { adminNote: draft.note ?? '' } : undefined;
    mutation.mutate({ id, data: payload }, {
      onSuccess: () => toast({ title: `Investment ${kind === 'update' ? 'updated' : `${kind}d`}` }),
      onError: error => toast({ title: 'Unable to update investment', description: error.message, variant: 'destructive' }),
    });
  };
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><h1 className="font-mono text-2xl font-bold">Mining Investments</h1><p className="mt-1 text-sm text-muted-foreground">Review, settle, and manage USDC-funded asset requests.</p></div>
      <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
        <option value="all">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="rejected">Rejected</option>
      </select>
    </div>
    {isLoading ? <p className="text-muted-foreground">Loading investments…</p> : rows.length === 0 ? <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground"><Pickaxe className="mx-auto mb-3" />No investments in this view.</div> :
      <div className="grid gap-4">{rows.map(item => {
        const draft = drafts[item.id] ?? {};
        const set = (values: Partial<typeof draft>) => setDrafts(current => ({ ...current, [item.id]: { ...draft, ...values } }));
        return <div key={item.id} className="rounded-xl border border-border bg-card p-5" data-testid={`mining-investment-${item.id}`}>
          <div className="flex flex-col justify-between gap-3 md:flex-row">
            <div><div className="flex items-center gap-2"><strong>{item.symbol} · {item.assetName}</strong><span className="rounded bg-muted px-2 py-0.5 text-xs capitalize">{item.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.displayName} · {item.email}</p></div>
            <div className="font-mono text-sm md:text-right"><p>Requested: ${item.requestedAmount.toFixed(2)} USDC</p><p className="text-muted-foreground">{item.units?.toFixed(8) ?? '—'} units @ ${item.entryPrice.toFixed(2)}</p></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {item.status === 'pending' && <label className="text-xs text-muted-foreground">Approved amount<input type="number" min="0.01" step="0.01" value={draft.amount ?? String(item.approvedAmount ?? item.requestedAmount)} onChange={e => set({ amount: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground" /></label>}
            {item.status === 'active' && <label className="text-xs text-muted-foreground">Current value<input type="number" min="0" step="0.01" value={draft.value ?? String(item.currentValue)} onChange={e => set({ value: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground" /></label>}
            <label className="text-xs text-muted-foreground md:col-span-2">Admin note<input value={draft.note ?? item.adminNote} onChange={e => set({ note: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground" /></label>
          </div>
          {(item.status === 'pending' || item.status === 'active') && <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => mutate('update', item.id)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"><Save size={15} />Save adjustments</button>
            {item.status === 'pending' && <><button onClick={() => mutate('reject', item.id)} className="inline-flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive"><X size={15} />Reject</button><button onClick={() => mutate('approve', item.id)} className="inline-flex items-center gap-2 rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-500"><Check size={15} />Approve</button></>}
          </div>}
        </div>;
      })}</div>}
  </div>;
}