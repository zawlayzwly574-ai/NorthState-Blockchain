---
name: Swap and FX features
description: Instant crypto swap route, Frankfurter FX rates, multi-currency balance display, market auto-refresh, MARKET_API_KEY for CoinGecko.
---

## Instant Swap (`POST /api/transactions/swap`)
- Settles immediately — no admin approval. Debits fromAsset holding, credits toAsset holding, inserts two `convert` activity records.
- Uses current CoinGecko price to compute rate: `toAmount = fromAmount * fromPrice / toPrice`.
- Returns `{ fromAsset, toAsset, fromAmount, toAmount, rate, executedAt }`.
- Activity `type` is `'convert'` — DB column is plain `text()` so no migration needed.

**Why:** Swaps are internal; they don't touch the blockchain, so no admin gate needed.

## FX Rates (`GET /api/markets/fx-rates`)
- Uses Frankfurter API (ECB data, free, no key). 5-minute in-memory cache (`fxCache`).
- Adds `MMK: 2100` and `USD: 1` manually since they're not in ECB data.
- Returns `{ base: "USD", rates: { EUR: ..., SGD: ..., ... } }`.
- Route must be registered BEFORE `/markets/:symbol` in Express order.

**Why:** Frankfurter is free and reliable; MMK not in ECB dataset so static rate.

## MARKET_API_KEY
- Stored as shared env var `MARKET_API_KEY` (value: the key provided by user).
- Applied to all CoinGecko fetches via `marketHeaders` (module-scope constant, not inside `fetchMarketAssets`).
- Headers sent: `x-cg-pro-api-key` and `x-cg-demo-api-key` — covers both Paid and Demo tiers.

**Why:** `marketHeaders` must be module-scope, not inside `fetchMarketAssets`, because the chart fetch in the `/markets/:symbol` route handler also uses it.

## Multi-currency display
- `currencies` constant expanded from 3 to 31 (USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY, HKD, SGD, SEK, NOK, DKK, NZD, MXN, INR, BRL, KRW, ZAR, THB, MYR, IDR, PHP, AED, SAR, TRY, PLN, CZK, HUF, RON, MMK).
- `money()` wrapped in try-catch for Intl.NumberFormat failures (fallback: `CURRENCY N,NNN`).
- Dashboard fetches FX rates via `useGetFxRates`; `cx(usdValue)` multiplies by `fxRate` before passing to `money()`.

## Market auto-refresh
- `useGetMarketSummary`: `refetchInterval: 30_000` (30 s).
- `useGetMarketDetail`: `refetchInterval: 15_000` (15 s).
- Portfolio/activity: `refetchInterval: 60_000`.
- FX rates: `refetchInterval: 5 * 60_000`, `staleTime: 5 * 60_000`.

## OpenAPI/codegen
- Added `/markets/fx-rates` GET → `FxRates` schema.
- Added `/transactions/swap` POST → `SwapInput` / `SwapResult` schemas.
- Added `convert` to `Activity.type` enum.
- Run codegen: `cd lib/api-spec && pnpm run codegen`.
