import { useState } from 'react';
import { useAdminKyc, useApproveKyc, useRejectKyc } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { Check, X, FileCheck, Loader2, ChevronDown, ChevronUp, Eye, User, MapPin, Briefcase, Shield, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/20',
    verified: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/20',
  };
  return (
    <span className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider border ${styles[status] ?? 'bg-muted/20 text-muted-foreground border-border'}`}>
      {status}
    </span>
  );
}

function DetailRow({ label, value, mono = false, sensitive = false }: { label: string; value?: string; mono?: boolean; sensitive?: boolean }) {
  const [revealed, setRevealed] = useState(!sensitive);
  if (!value) return null;
  return (
    <div className="grid gap-0.5">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm text-foreground ${mono ? 'font-mono' : 'font-medium'} ${!revealed ? 'blur-sm select-none' : ''}`}>
          {revealed ? value : value.replace(/./g, '•')}
        </p>
        {sensitive && (
          <button onClick={() => setRevealed(r => !r)} className="p-0.5 text-muted-foreground hover:text-foreground transition" title={revealed ? 'Hide' : 'Reveal'}>
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Kyc() {
  const { data: kycList, isLoading } = useAdminKyc();
  const approveKyc = useApproveKyc();
  const rejectKyc = useRejectKyc();
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = kycList?.filter(k => filterStatus === 'all' || k.status === filterStatus);

  const handleApprove = (id: string) => {
    approveKyc.mutate(id, {
      onSuccess: () => {
        toast({ title: 'KYC Approved', description: 'Identity verified successfully.' });
        setExpandedId(null);
      },
      onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });
  };

  const handleReject = (id: string) => {
    if (!confirm('Are you sure you want to reject this KYC submission?')) return;
    rejectKyc.mutate(id, {
      onSuccess: () => {
        toast({ title: 'KYC Rejected', description: 'The submission has been rejected.' });
        setExpandedId(null);
      },
      onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });
  };

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight">Identity Verification</h1>
          <p className="text-muted-foreground text-sm mt-1">Review KYC compliance submissions.</p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 pr-8 py-2 bg-card border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
          >
            <option value="all">All Submissions</option>
            <option value="pending">Pending Review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
            Loading queue…
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-muted-foreground">
            No KYC submissions found.
          </div>
        ) : (
          filtered.map(k => {
            const isExpanded = expandedId === k.id;
            const isPending = k.status === 'pending';
            return (
              <div key={k.id} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm transition-all">
                {/* Row header */}
                <div
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/5 transition-colors"
                  onClick={() => toggleExpand(k.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 grid place-items-center text-primary">
                      <FileCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{k.fullName}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{k.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <div className="text-xs text-muted-foreground font-mono hidden sm:block">
                      {formatRelativeTime(k.submittedAt)}
                    </div>
                    <StatusBadge status={k.status} />
                    {isPending && (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleReject(k.id)}
                          disabled={rejectKyc.isPending || approveKyc.isPending}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          title="Reject"
                          data-testid={`btn-reject-kyc-${k.id}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleApprove(k.id)}
                          disabled={rejectKyc.isPending || approveKyc.isPending}
                          className="p-1.5 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md transition-colors"
                          title="Approve"
                          data-testid={`btn-approve-kyc-${k.id}`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <button className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Expand details">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/5 px-5 py-5 space-y-5">
                    {/* Personal info */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <User className="w-3.5 h-3.5 text-primary" />
                        <p className="text-xs font-mono font-bold uppercase tracking-wider text-primary">Personal Information</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <DetailRow label="Full Name" value={k.fullName} />
                        <DetailRow label="Email" value={k.email} mono />
                        <DetailRow label="Account ID" value={k.clerkUserId} mono />
                      </div>
                    </div>

                    {/* Address & employment */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <p className="text-xs font-mono font-bold uppercase tracking-wider text-primary">Location & Employment</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <DetailRow label="Country" value={k.country} />
                        <DetailRow label="City / State" value={k.city} />
                        <DetailRow label="Occupation" value={k.occupation} />
                      </div>
                    </div>

                    {/* Sensitive identity */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="w-3.5 h-3.5 text-amber-400" />
                        <p className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">Sensitive Identity Data</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <DetailRow label="SSN" value={k.ssn} mono sensitive />
                      </div>
                    </div>

                    {/* Document info */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <p className="text-xs font-mono font-bold uppercase tracking-wider text-primary">Identity Document</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Document Type</p>
                          <p className="text-sm font-mono uppercase font-medium tracking-wider text-foreground">
                            {k.documentType?.replace(/_/g, ' ')}
                          </p>
                        </div>
                        {k.documentImageBase64 ? (
                          <div>
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Document Image</p>
                            {k.documentImageBase64.startsWith('data:image') ? (
                              <a href={k.documentImageBase64} target="_blank" rel="noopener noreferrer" className="block">
                                <img
                                  src={k.documentImageBase64}
                                  alt="Submitted ID document"
                                  className="max-h-64 w-full object-contain rounded-lg border border-border bg-secondary/30 cursor-zoom-in"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">Click to open full size</p>
                              </a>
                            ) : (
                              <p className="text-xs text-muted-foreground font-mono">Non-image document attached (PDF)</p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Document Image</p>
                            <p className="text-xs text-muted-foreground italic">No image uploaded</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submission meta */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground font-mono">
                        Submitted: {new Date(k.submittedAt).toLocaleString()}
                      </p>
                      {isPending && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReject(k.id)}
                            disabled={rejectKyc.isPending || approveKyc.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />Reject
                          </button>
                          <button
                            onClick={() => handleApprove(k.id)}
                            disabled={rejectKyc.isPending || approveKyc.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
                          >
                            <Check className="w-4 h-4" />Approve & Unlock Access
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
