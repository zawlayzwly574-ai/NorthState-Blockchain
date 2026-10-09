export type SpotTradeDirection = "long" | "short";
export type SpotTradeOutcome = "win" | "loss";

/**
 * Resolve a fixed-expiry Spot trade only from two valid, observed market prices.
 * An equal entry/exit is intentionally unresolved because the current trade
 * schema has no break-even result and must not manufacture a win/loss.
 */
export function resolveSpotTradeOutcome(
  direction: SpotTradeDirection,
  entryPrice: number,
  exitPrice: number,
): SpotTradeOutcome | null {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0
    || !Number.isFinite(exitPrice) || exitPrice <= 0
    || entryPrice === exitPrice) return null;
  const priceRose = exitPrice > entryPrice;
  return (direction === "long") === priceRose ? "win" : "loss";
}
