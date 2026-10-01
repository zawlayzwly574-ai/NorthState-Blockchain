const COINGECKO_PUBLIC_API = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_API = "https://pro-api.coingecko.com/api/v3";

export function createCoinGeckoConfig(apiKey = "", keyType = "pro") {
  const normalizedKeyType = keyType.trim().toLowerCase();
  if (apiKey && !["pro", "demo", "public"].includes(normalizedKeyType)) {
    throw new Error("MARKET_API_KEY_TYPE must be 'pro', 'demo', or 'public'.");
  }

  const isProKey = Boolean(apiKey) && normalizedKeyType === "pro";
  const isDemoKey = Boolean(apiKey) && normalizedKeyType === "demo";
  return {
    baseUrl: isProKey ? COINGECKO_PRO_API : COINGECKO_PUBLIC_API,
    headers: {
      accept: "application/json",
      ...(isProKey ? { "x-cg-pro-api-key": apiKey } : {}),
      ...(isDemoKey ? { "x-cg-demo-api-key": apiKey } : {}),
    },
  };
}

const coinGeckoConfig = createCoinGeckoConfig(
  process.env.MARKET_API_KEY?.trim(),
  process.env.MARKET_API_KEY_TYPE ?? "pro",
);

export const coinGeckoApiBaseUrl = coinGeckoConfig.baseUrl;
export const marketHeaders = coinGeckoConfig.headers;