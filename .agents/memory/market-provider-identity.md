---
name: Market provider identity checks
description: Rules for validating that market symbols map to the same asset across CoinGecko and Binance.
---

Treat CoinGecko IDs, display symbols, and Binance base assets as separate identities that must be verified independently. Never infer that similarly named tickers represent the same asset.

**Why:** A valid Binance ticker can belong to a distinct asset, and a plausible CoinGecko slug can be nonexistent. Either mistake silently produces mislabeled or synthetic market data.

**How to apply:** For every new market asset, verify that its CoinGecko ID resolves to the intended project and that the Binance pair's base asset is the same token. Keep the asset CoinGecko-only when no matching Binance pair exists.