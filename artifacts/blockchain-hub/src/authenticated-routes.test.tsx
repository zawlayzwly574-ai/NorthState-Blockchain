import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const authState = vi.hoisted(() => ({
  isLoaded: false,
  isSignedIn: false,
  session: { id: "session_test", reload: vi.fn(async () => undefined) },
}));

vi.mock("@clerk/react", async () => {
  const actual = await vi.importActual<typeof import("@clerk/react")>("@clerk/react");
  return {
    ...actual,
    useAuth: () => authState,
    useSession: () => ({ session: authState.session }),
    useUser: () => ({ ...authState, user: null }),
    useClerk: () => ({ signOut: vi.fn(), addListener: vi.fn(() => vi.fn()) }),
  };
});

import { ActivityPage, Dashboard, ProtectedRoute, Settings } from "./App";

const protectedPaths = [
  "/api/portfolio",
  "/api/activity",
  "/api/profile",
  "/api/notifications",
  "/api/referral",
];

function jsonFor(url: string) {
  if (url.includes("/portfolio")) {
    return { totalValue: 0, dayChange: 0, dayChangePercent: 0, holdings: [], history: [] };
  }
  if (url.includes("/activity") || url.includes("/notifications")) return [];
  if (url.includes("/fx-rates")) return { base: "USD", rates: {} };
  if (url.includes("/referral")) return { code: "TEST", totalReferrals: 0, rewardsEarned: 0, referrals: [] };
  if (url.includes("/profile")) return { name: "Test Member", initials: "TM", verificationStatus: "verified" };
  return {};
}

function renderRoute(ui: ReactElement, path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { hook } = memoryLocation({ path });
  return render(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>,
  );
}

function GuardedTestPage({ name }: { name: string }) {
  return <ProtectedRoute><div>{name} account content</div></ProtectedRoute>;
}

describe("authenticated portfolio routes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authState.isLoaded = false;
    authState.isSignedIn = false;
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

  it("shows a recoverable account message instead of a blank body when profile loading fails", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/profile")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(jsonFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderRoute(<Dashboard />, "/dashboard");

    expect(await screen.findByText("We could not load your account")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.getByText("Sign in again")).toBeInTheDocument();
  });

  it("refreshes a valid Clerk session once and loads the account without requiring sign-in again", async () => {
    authState.isLoaded = true;
    authState.isSignedIn = true;
    authState.session.reload.mockClear();
    let profileCalls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/profile") && profileCalls++ === 0) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(jsonFor(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderRoute(<Dashboard />, "/dashboard");

    expect(await screen.findByText("Your portfolio")).toBeInTheDocument();
    expect(authState.session.reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("We could not load your account")).not.toBeInTheDocument();
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