import React from 'react';

export const SecurityBadges: React.FC = () => {
  return (
    <div className="my-8 flex flex-wrap items-center justify-center gap-6 border-y border-border/60 py-6">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        🛡️ <span>Audited Smart Contract</span>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        🔒 <span>256-Bit SSL Encrypted</span>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        ⚡ <span>Automated Security Monitoring</span>
      </div>
    </div>
  );
};
