import { useState } from 'react';
import { useAdminTransactions, useApproveTransaction, useRejectTransaction } from '@/lib/api';
import { formatAsset, formatRelativeTime } from '@/lib/utils';
import { Check, X, Filter, Loader2, ArrowUpRight, ArrowDownLeft, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Transactions() {
  const { data: transactions, isLoading } = useAdminTransactions();
  const approveTx = useApproveTransaction();
  const rejectTx = useRejectTransaction();
  const { toast } = useToast();

  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('pending');

  const filtered = transactions?.filter(tx => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (filterStatus !== 'all' && tx.status !== filterStatus) return false;
    return true;
  });

  const handleApprove = (id: string) => {
    approveTx.mutate(id, {
      onSuccess: () => {
        toast({ title: "Transaction Approved", description: "The transaction has been successfully processed." });
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleReject = (id: string) => {
    if (!confirm("Are you sure you want to reject this transaction?")) return;
    rejectTx.mutate(id, {
      onSuccess: () => {
        toast({ title: "Transaction Rejected", description: "The transaction has been rejected." });
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight">Transaction Ledger</h1>
          <p className="text-muted-foreground text-sm mt-1">Review and process user funds.</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select 
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="pl-9 pr-8 py-2 bg-card border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
            >
              <option value="all">All Types</option>
              <option value="deposit">Deposits</option>
              <option value="withdrawal">Withdrawals</option>
              <option value="send">Sends</option>
            </select>
          </div>
          <select 
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 pr-8 py-2 bg-card border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed/Rejected</option>
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/20 uppercase font-mono">
              <tr>
                <th className="px-5 py-4 font-medium">Transaction</th>
                <th className="px-5 py-4 font-medium">User</th>
                <th className="px-5 py-4 font-medium">Amount</th>
                <th className="px-5 py-4 font-medium">Details</th>
                <th className="px-5 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading ledger...
                  </td>
                </tr>
              ) : !filtered || filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    No transactions found matching criteria.
                  </td>
                </tr>
              ) : (
                filtered.map(tx => (
                  <tr key={tx.id} className="hover:bg-muted/5 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg flex-shrink-0
                          ${tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-500' : 
                            tx.type === 'withdrawal' ? 'bg-amber-500/10 text-amber-500' : 
                            'bg-blue-500/10 text-blue-500'}`}
                        >
                          {tx.type === 'deposit' && <ArrowDownLeft className="w-4 h-4" />}
                          {tx.type === 'withdrawal' && <ArrowUpRight className="w-4 h-4" />}
                          {tx.type === 'send' && <Send className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-mono font-medium uppercase tracking-wider text-xs flex items-center space-x-2">
                            <span>{tx.type}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] 
                              ${tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20' : 
                                tx.status === 'completed' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/20' : 
                                'bg-red-500/20 text-red-500 border border-red-500/20'}`}>
                              {tx.status}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 font-mono" title={new Date(tx.createdAt).toLocaleString()}>
                            {formatRelativeTime(tx.createdAt)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-foreground">{tx.displayName}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={tx.email}>{tx.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-mono text-foreground font-semibold">
                        {formatAsset(tx.amount, tx.asset)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-muted-foreground">
                      {tx.txHash && (
                        <div className="flex items-center space-x-1 truncate max-w-[200px]" title={tx.txHash}>
                          <span className="opacity-50">Hash:</span> <span>{tx.txHash}</span>
                        </div>
                      )}
                      {tx.destination && (
                        <div className="flex items-center space-x-1 truncate max-w-[200px]" title={tx.destination}>
                          <span className="opacity-50">To:</span> <span>{tx.destination}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {tx.status === 'pending' ? (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleReject(tx.id)}
                            disabled={rejectTx.isPending || approveTx.isPending}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            title="Reject"
                            data-testid={`btn-reject-${tx.id}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApprove(tx.id)}
                            disabled={rejectTx.isPending || approveTx.isPending}
                            className="p-1.5 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md transition-colors"
                            title="Approve"
                            data-testid={`btn-approve-${tx.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                          Processed
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
