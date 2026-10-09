export type SpotTradeDirection = "long" | "short";
export type SpotTradeOutcome = "win" | "loss";

/**
 * Resolve a fixed-expiry Spot trade only from two valid, observed market prices.
 * The current schema supports only win/loss. A flat exit follows the existing
 * directional rule (not-up): Long loses, Short wins, so expiry cannot leave a
 * reserved trade open indefinitely waiting for a price move.
 */
export function resolveSpotTradeOutcome(
  direction: SpotTradeDirection,
  entryPrice: number,
  exitPrice: number,
): SpotTradeOutcome | null {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0
    || !Number.isFinite(exitPrice) || exitPrice <= 0) return null;
  // Match the existing binary direction rule on a flat close: it is not an up move.
  const priceRose = exitPrice > entryPrice;
  return (direction === "long") === priceRose ? "win" : "loss";
}
