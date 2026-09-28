import { afterEach, describe, expect, it, vi } from "vitest";

import { customFetch } from "./custom-fetch";

describe("customFetch credentials", () => {
  afterEach(() => {
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
});