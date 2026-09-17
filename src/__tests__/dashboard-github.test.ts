import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubService } from "../../website/src/services/githubAPI";

vi.mock("../../website/src/services/tokenStorage", () => ({
  tokenStorage: { get: () => null },
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("dashboard GitHub requests", () => {
  it("requests completed runs in the chosen date range and page", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ workflow_runs: [] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await githubService.getWorkflowRuns(
      "getsentry",
      "cli",
      "main",
      2,
      "2026-07-01T00:00:00Z",
    );
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("status")).toBe("completed");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("created")).toBe(">=2026-07-01T00:00:00Z");
  });

  it("does not turn rate limits into repository-not-found", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(githubService.getRepoInfo("getsentry", "cli")).rejects.toThrow(
      "rate limit",
    );
  });

  it("returns not-found only for an inaccessible repository", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      githubService.getRepoInfo("getsentry", "missing"),
    ).resolves.toBeNull();
  });
});
