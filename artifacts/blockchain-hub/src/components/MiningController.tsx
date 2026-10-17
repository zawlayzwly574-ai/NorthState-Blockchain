import React from 'react';

interface MiningControllerProps {
  currentMined: number;
  maxLimit: number;
  onStart?: () => void;
}

function formatTokens(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export const MiningController: React.FC<MiningControllerProps> = ({ currentMined, maxLimit, onStart }) => {
  const isLimitReached = currentMined >= maxLimit;

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-foreground">
      <h3 className="text-lg font-bold">Mining Dashboard</h3>
      <p className="text-sm text-muted-foreground">
        Reward Limit Status: {formatTokens(currentMined)} / {formatTokens(maxLimit)} Tokens
      </p>

      {isLimitReached ? (
        <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/15 p-3 text-sm text-destructive" role="status">
          ⚠️ <strong>Mining Limit Reached:</strong> The reward pool limit for this phase has been reached. Mining is currently paused.
        </div>
      ) : (
        <button
          type="button"
          disabled={isLimitReached}
          onClick={onStart}
          className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start Mining
        </button>
      )}
    </div>
  );
};
