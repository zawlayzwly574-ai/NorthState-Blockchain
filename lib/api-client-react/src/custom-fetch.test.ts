import { afterEach, describe, expect, it, vi } from "vitest";

import { customFetch, setAuthTokenGetter, setBaseUrl } from "./custom-fetch";

describe("customFetch credentials", () => {
  afterEach(() => {
    setBaseUrl(null);
    setAuthTokenGetter(null);
    vi.unstubAllGlobals();
  });

  it("includes browser credentials by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/api/member/profile");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/member/profile",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("preserves an explicit credentials override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/api/public/markets", { credentials: "omit" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/markets",
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("sends configured Railway API requests with the active Clerk bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    setBaseUrl("https://api.example.invalid/");
    setAuthTokenGetter(async () => "session-token");

    await customFetch("/api/profile");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.invalid/api/profile");
    expect(options.credentials).toBe("include");
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer session-token");
  });
});