import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getGetFxRatesQueryKey } from "@workspace/api-client-react";

const authState = vi.hoisted(() => ({
  isLoaded: false,
  isSignedIn: false,
  verificationStatus: "verified",
}));

vi.mock("@clerk/react", async () => {
  const actual = await vi.importActual<typeof import("@clerk/react")>("@clerk/react");
  return {
    ...actual,
    useAuth: () => authState,
    useUser: () => ({ ...authState, user: null }),
    useClerk: () => ({ signOut: vi.fn(), addListener: vi.fn(() => vi.fn()) }),
  };
});

import { ActivityPage, Dashboard, MiningPlace, ProtectedRoute, Settings } from "./App";
import { TradingPage } from "./Trading";

const protectedPaths = [
  "/api/portfolio",
  "/api/activity",
  "/api/profile",
  "/api/notifications",
  "/api/referral",
];

function jsonFor(url: string) {
  if (url.includes("/portfolio")) {
    return { totalValue: 0, cashBalance: 123.45, dayChange: 0, dayChangePercent: 0, holdings: [] };
  }
  if (url.includes("/fx-rates")) return { base: "USD", rates: {} };
  if (url.includes("/markets")) return [];
  if (url.includes("/trading/account")) return { balance: 100_000, futuresBalance: 0, wins: 0, totalTrades: 0 };
  if (url.includes("/trading/trades")) return [];
  if (url.includes("/trading/futures/positions")) return [];
  if (url.includes("/trading/futures/quote/")) return { asset: "GOLD", price: 9_999, updatedAt: new Date().toISOString() };
  if (url.includes("/activity") || url.includes("/notifications")) return [];
  if (url.includes("/mining-place")) return { assets: [], updatedAt: new Date().toISOString() };
  if (url.includes("/mining-investments")) return { availableUsdc: 0, investments: [] };
  if (url.includes("/referral")) return { code: "TEST", totalReferrals: 0, rewardsEarned: 0, referrals: [] };
  if (url.includes("/profile")) return { name: "Test Member", initials: "TM", verificationStatus: authState.verificationStatus };
  return {};
}

function renderRoute(ui: ReactElement, path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

function GuardedTestPage({ name }: { name: string }) {
  return <ProtectedRoute><div>{name} account content</div></ProtectedRoute>;
}

describe("authenticated portfolio routes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const configureTradingFetch = (goldAsset?: Record<string, unknown>) => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/mining-place")) {
        return new Response(JSON.stringify({
          assets: goldAsset ? [goldAsset] : [],
          updatedAt: new Date().toISOString(),
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/api/trading/futures/quote/GOLD")) {
        return new Response(JSON.stringify({ asset: "GOLD", price: 9_999, updatedAt: new Date().toISOString() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/trading/chart/GOLD")) {
        return new Response(JSON.stringify([{ t: Date.now(), price: 9_999 }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(jsonFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
  };

  beforeEach(() => {
    authState.isLoaded = false;
    authState.isSignedIn = false;
    authState.verificationStatus = "verified";
    localStorage.clear();
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      return new Response(JSON.stringify(jsonFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["Overview", <Dashboard />, "/dashboard", ["/api/portfolio", "/api/activity"]],
    ["Activity", <ActivityPage />, "/activity", ["/api/activity"]],
    ["Settings", <Settings />, "/settings", ["/api/profile", "/api/referral"]],
  ])("waits for Clerk before %s requests member data", async (_name, ui, path, expectedPaths) => {
    const view = renderRoute(ui, path);

    expect(fetchMock.mock.calls.some(([input]) =>
      protectedPaths.some((protectedPath) => String(input).includes(protectedPath)),
    )).toBe(false);

    authState.isLoaded = true;
    authState.isSignedIn = true;
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Router hook={memoryLocation({ path }).hook}>{ui}</Router>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      for (const expectedPath of expectedPaths) {
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes(expectedPath))).toBe(true);
      }
    });
  });

  it("does not retry protected requests for a signed-out visit", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = false;

    renderRoute(<Dashboard />, "/dashboard");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const protectedCalls = fetchMock.mock.calls.filter(([input]) =>
      protectedPaths.some((protectedPath) => String(input).includes(protectedPath)),
    );
    expect(protectedCalls).toHaveLength(0);
  });

  it("loads the read-only Overview for an unverified member without a crash state", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    authState.verificationStatus = "unverified";

    renderRoute(<Dashboard />, "/dashboard");

    expect(await screen.findByText("Overview is available in read-only mode. Complete KYC in Settings to enable deposits, withdrawals, and trading.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/portfolio"))).toBe(true);
    expect(screen.queryByText("We could not load this view")).not.toBeInTheDocument();
  });

  it("shows the original USD balance when the selected currency rate is unavailable", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = true;

    renderRoute(<Dashboard />, "/dashboard");

    fireEvent.change(await screen.findByTestId("select-balance-currency"), {
      target: { value: "EUR" },
    });

    expect(screen.getByTestId("text-cash-balance")).toHaveTextContent("$123.45");
    expect(screen.getByTestId("text-cash-balance")).toHaveTextContent("USD");
    expect(screen.getByText("EUR conversion is unavailable; amounts are shown in USD.")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("falls back to the real USD amount after a cached FX rate expires and refresh fails", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    let now = Date.now();
    let refreshFails = false;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/markets/fx-rates")) {
        return new Response(JSON.stringify(refreshFails ? { error: "FX unavailable" } : { base: "USD", rates: { EUR: 0.9 } }), {
          status: refreshFails ? 503 : 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(jsonFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const view = renderRoute(<Dashboard />, "/dashboard");
    const currencySelect = await screen.findByTestId("select-balance-currency");
    fireEvent.change(currencySelect, { target: { value: "EUR" } });
    await waitFor(() => expect(screen.getByTestId("text-cash-balance")).not.toHaveTextContent("$123.45"));

    refreshFails = true;
    now += 6 * 60_000;
    await view.queryClient.refetchQueries({ queryKey: getGetFxRatesQueryKey() });

    expect(now - (view.queryClient.getQueryState(getGetFxRatesQueryKey())?.dataUpdatedAt ?? now)).toBeGreaterThan(5 * 60_000);
    await waitFor(() => expect(screen.getByTestId("text-cash-balance")).toHaveTextContent("$123.45"));
    expect(screen.getByTestId("text-cash-balance")).toHaveTextContent("USD");
    expect(screen.getByText("The latest EUR rate refresh failed; amounts are shown in USD.")).toBeInTheDocument();
  });

  it("keeps persisted Mining Place investments visible when market quotes are offline", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    authState.verificationStatus = "verified";
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/mining-place")) {
        return new Response(JSON.stringify({ error: "Quote service unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/mining-investments")) {
        return new Response(JSON.stringify({
          availableUsdc: 57.42,
          investments: [{
            id: "investment-1",
            symbol: "GOLD",
            assetName: "Gold",
            category: "gold",
            requestedAmount: 100,
            approvedAmount: 100,
            units: 0.05,
            entryPrice: 2000,
            currentValue: 100,
            gainLoss: 0,
            status: "active",
            adminNote: "",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(jsonFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderRoute(<MiningPlace />, "/mining-place");

    expect(await screen.findByText("Available: $57.42 USDC")).toBeInTheDocument();
    expect(screen.getByText("GOLD")).toBeInTheDocument();
    expect(screen.getByText(/could not load this view/i)).toBeInTheDocument();
  });

  it("pauses GOLD orders and hides XAUT quote/history when no live GC=F quote is available", async () => {
    configureTradingFetch();
    renderRoute(<TradingPage />, "/trading");

    fireEvent.click(screen.getByRole("button", { name: /GOLD/ }));

    expect(await screen.findByTestId("status-gold-quote-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("button-buy-long")).toBeDisabled();
    expect(screen.getByTestId("button-sell-short")).toBeDisabled();
    expect(screen.queryByText("$9,999")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/trading/chart/GOLD"))).toBe(false);
  });

  it("rejects a GC=F provider quote older than two minutes even when marked live", async () => {
    configureTradingFetch({
      symbol: "GOLD",
      name: "Gold",
      category: "gold",
      price: 2375.5,
      change24h: 0,
      currency: "USD",
      unit: "oz",
      status: "live",
      updatedAt: new Date(Date.now() - 121_000).toISOString(),
      color: "#d6ad3b",
    });
    renderRoute(<TradingPage />, "/trading");

    fireEvent.click(screen.getByRole("button", { name: /GOLD/ }));

    expect(await screen.findByTestId("status-gold-quote-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("button-buy-long")).toBeDisabled();
    expect(screen.queryByTestId("text-gold-benchmark-price")).not.toBeInTheDocument();
  });

  it("shows only the fresh live GC=F benchmark quote for GOLD", async () => {
    configureTradingFetch({
      symbol: "GOLD",
      name: "Gold",
      category: "gold",
      price: 2375.5,
      change24h: 0,
      currency: "USD",
      unit: "oz",
      status: "live",
      updatedAt: new Date().toISOString(),
      color: "#d6ad3b",
    });
    renderRoute(<TradingPage />, "/trading");

    fireEvent.click(screen.getByRole("button", { name: /GOLD/ }));

    expect(await screen.findByTestId("text-gold-benchmark-price")).toHaveTextContent("$2,375.50");
    expect(screen.queryByText("$9,999")).not.toBeInTheDocument();
    expect(screen.getByText(/trading history feed maps GOLD to XAUT/i)).toBeInTheDocument();
    expect(screen.getByTestId("button-buy-long")).toBeEnabled();
  });

  it("hides legacy close prices for policy-settled trades while retaining outcome and provider prices", async () => {
    configureTradingFetch();
    const settledAt = new Date().toISOString();
    const trades = [
      {
        id: 101,
        asset: "BTC",
        direction: "long",
        amount: 5_000,
        timeframeSecs: 60,
        status: "completed",
        result: "win",
        adminOverride: "win",
        entryPrice: 50_000,
        exitPrice: 51_234.56,
        payout: 1_500,
        payoutRate: 0.3,
        createdAt: settledAt,
        expiresAt: settledAt,
        settledAt,
      },
      {
        id: 102,
        asset: "ETH",
        direction: "short",
        amount: 1_000,
        timeframeSecs: 60,
        status: "completed",
        result: "loss",
        adminOverride: null,
        entryPrice: 3_000,
        exitPrice: 2_987.65,
        payout: -1_000,
        payoutRate: 0.2,
        createdAt: settledAt,
        expiresAt: settledAt,
        settledAt,
      },
    ];
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      return new Response(JSON.stringify(url.includes("/api/trading/trades") ? trades : jsonFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderRoute(<TradingPage />, "/trading");

    fireEvent.click(await screen.findByTestId("button-trade-history-101"));
    expect(await screen.findByTestId("text-policy-settlement")).toHaveTextContent(
      "Policy-settled result — no market close price",
    );
    expect(screen.getByText("Policy-controlled result")).toBeInTheDocument();
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(screen.getByText("Net Profit / Loss").parentElement).toHaveTextContent("+$1500.00");
    expect(screen.queryByText("Close Price")).not.toBeInTheDocument();
    expect(screen.queryByText("$51,234.56")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-close-trade-details"));
    fireEvent.click(screen.getByTestId("button-trade-history-102"));
    expect(await screen.findByText("Close Price")).toBeInTheDocument();
    expect(screen.getByText("$2,987.65")).toBeInTheDocument();
  });

  it("keeps the KYC form available when profile loading fails", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/profile")) {
        return new Response(JSON.stringify({ error: "Temporarily unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(jsonFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderRoute(<Settings />, "/settings");
    fireEvent.click(await screen.findByTestId("button-settings-verification"));

    expect(await screen.findByTestId("select-kyc-document")).toBeInTheDocument();
    expect(screen.getByTestId("input-kyc-id-front")).toBeInTheDocument();
    expect(screen.getByTestId("input-kyc-id-back")).toBeInTheDocument();
    expect(screen.queryByText("We could not load this view")).not.toBeInTheDocument();
  });

  it("shows a profile error instead of an endless email placeholder and recovers on retry", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    let profileAvailable = false;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/profile") && !profileAvailable) {
        return new Response(JSON.stringify({ error: "Temporarily unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      const body = url.includes("/api/profile")
        ? { ...jsonFor(url), email: "alex@example.com" }
        : jsonFor(url);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderRoute(<Settings />, "/settings");
    expect(await screen.findByTestId("alert-profile-unavailable")).toBeInTheDocument();
    expect(screen.getByText("Profile unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Loading profile…")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();

    profileAvailable = true;
    fireEvent.click(screen.getByRole("button", { name: "Retry profile" }));
    expect(await screen.findAllByText("alex@example.com")).toHaveLength(2);
    await waitFor(() => expect(screen.queryByTestId("alert-profile-unavailable")).not.toBeInTheDocument());
  });

  it.each([
    ["Overview", "/dashboard"],
    ["Activity", "/activity"],
    ["Trading", "/trading"],
    ["Mining Place", "/mining-place"],
    ["Settings", "/settings"],
  ])("redirects signed-out visitors from %s to sign in without flashing account content", async (name, path) => {
    const memory = memoryLocation({ path, record: true });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const view = render(
      <QueryClientProvider client={queryClient}>
        <Router hook={memory.hook}>
          <Switch>
            <Route path="/sign-in"><div>Sign in page</div></Route>
            <Route><GuardedTestPage name={name} /></Route>
          </Switch>
        </Router>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("protected-route-loading")).toBeInTheDocument();
    expect(screen.queryByText(`${name} account content`)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) =>
      protectedPaths.some((protectedPath) => String(input).includes(protectedPath)),
    )).toBe(false);

    authState.isLoaded = true;
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Router hook={memory.hook}>
          <Switch>
            <Route path="/sign-in"><div>Sign in page</div></Route>
            <Route><GuardedTestPage name={name} /></Route>
          </Switch>
        </Router>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(memory.history?.at(-1)).toBe(`/sign-in?redirect_url=${encodeURIComponent(path)}`);
    });
    expect(screen.getByText("Sign in page")).toBeInTheDocument();
    expect(screen.queryByText(`${name} account content`)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) =>
      protectedPaths.some((protectedPath) => String(input).includes(protectedPath)),
    )).toBe(false);
  });
});