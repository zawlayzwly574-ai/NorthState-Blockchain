import { describe, expect, it } from "vitest";
import { createCoinGeckoConfig } from "./marketProvider";

describe("CoinGecko API configuration", () => {
  it("sends Pro keys only to the Pro API host", () => {
    const config = createCoinGeckoConfig("pro-test-key", "pro");

    expect(config.baseUrl).toBe("https://pro-api.coingecko.com/api/v3");
    expect(config.headers).toEqual({
      accept: "application/json",
      "x-cg-pro-api-key": "pro-test-key",
    });
  });

  it("sends Demo keys only to the public API host", () => {
    const config = createCoinGeckoConfig("demo-test-key", "demo");

    expect(config.baseUrl).toBe("https://api.coingecko.com/api/v3");
    expect(config.headers).toEqual({
      accept: "application/json",
      "x-cg-demo-api-key": "demo-test-key",
    });
  });

  it("uses the public API without an authorization header when no key is configured", () => {
    const config = createCoinGeckoConfig();

    expect(config.baseUrl).toBe("https://api.coingecko.com/api/v3");
    expect(config.headers).toEqual({ accept: "application/json" });
  });

  it("rejects an unknown API key type", () => {
    expect(() => createCoinGeckoConfig("test-key", "unknown")).toThrow(
      "MARKET_API_KEY_TYPE must be either 'pro' or 'demo'.",
    );
  });
});