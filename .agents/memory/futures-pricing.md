---
name: Futures pricing trust boundary
description: Why internal Futures positions must use timestamped provider trades and explicit product limitations.
---

Futures here settle internally against USDT collateral using market reference prices; they are not orders on an external exchange. Do not present simulated chart movements or the public market-summary cache as executable Futures marks. Require a timestamp supplied by the price provider, and fail closed on open/close when the underlying trade is too old or missing.

**Why:** A successful HTTP response can contain a stale last trade. An earlier design treated local response time as quote freshness while a simulated chart displayed a “LIVE” badge; together those could mislead a member about the execution price.

**How to apply:** Keep funding, automatic liquidation, USDC settlement, and quarterly expiry explicitly unavailable until each is genuinely implemented. Closing must preserve the position when fresh pricing fails, and displays should show unavailable instead of a made-up mark or zero PnL. Preserve the original trading chart and its placement; if chart data was simulated, replace the source with real history and timestamped quotes rather than replacing the chart with a warning.