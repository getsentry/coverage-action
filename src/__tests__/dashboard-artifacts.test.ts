import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArtifacts } from "../../website/src/hooks/useArtifacts";
import { githubService } from "../../website/src/services/githubAPI";

vi.mock("../../website/src/services/tokenStorage", () => ({
  tokenStorage: { get: () => null },
}));
vi.mock("../../website/src/services/artifactParser", () => ({
  parseArtifact: async () => ({
    tests: {
      totalTests: 10,
      passedTests: 9,
      failedTests: 1,
      skippedTests: 0,
      passRate: 90,
      totalTime: 1,
    },
  }),
}));

const run = (id: number) => ({
  id,
  created_at: new Date().toISOString(),
  head_sha: `sha-${id}`,
  run_number: id,
});
const artifact = {
  id: 100,
  name: "codecov-test-results-main-unit",
  expired: false,
};

beforeEach(() => vi.restoreAllMocks());

describe("dashboard artifact loading", () => {
  it("makes older pages reachable when the first page has no artifacts", async () => {
    vi.spyOn(githubService, "getWorkflowRuns").mockImplementation(
      async (_owner, _repo, _branch, page) =>
        (page === 2
          ? [run(100)]
          : Array.from({ length: 50 }, (_, i) => run(i))) as never,
    );
    vi.spyOn(githubService, "getRunArtifacts").mockImplementation(
      async (_owner, _repo, id) => (id === 100 ? [artifact] : []) as never,
    );
    vi.spyOn(githubService, "downloadArtifact").mockResolvedValue(
      new ArrayBuffer(0),
    );
    const first = await fetchArtifacts("getsentry", "cli", "main", 90);
    expect(first).toMatchObject({ data: [], nextPage: 2, runsChecked: 50 });
    const second = await fetchArtifacts(
      "getsentry",
      "cli",
      "main",
      90,
      first.nextPage,
    );
    expect(second.data).toEqual([expect.objectContaining({ runId: 100 })]);
    expect(second.nextPage).toBeUndefined();
  });

  it("explains a structured authentication failure", async () => {
    vi.spyOn(githubService, "getWorkflowRuns").mockResolvedValue([
      run(1),
    ] as never);
    vi.spyOn(githubService, "getRunArtifacts").mockResolvedValue([
      artifact,
    ] as never);
    vi.spyOn(githubService, "downloadArtifact").mockRejectedValue(
      Object.assign(new Error("Requires authentication"), { status: 401 }),
    );
    const result = await fetchArtifacts("getsentry", "cli", "main", 7);
    expect(result.errors).toEqual([
      expect.stringContaining("Personal Access Token"),
    ]);
  });

  it("ignores expired artifacts and runs outside the selected date range", async () => {
    vi.spyOn(githubService, "getWorkflowRuns").mockResolvedValue([
      run(1),
      { ...run(2), created_at: "2020-01-01T00:00:00Z" },
    ] as never);
    vi.spyOn(githubService, "getRunArtifacts").mockImplementation(
      async (_owner, _repo, id) => {
        if (id === 2)
          throw new Error("Out-of-range runs must not be requested");
        return [{ ...artifact, expired: true }] as never;
      },
    );
    const result = await fetchArtifacts("getsentry", "cli", "main", 7);
    expect(result.data).toEqual([]);
  });

  it("finds coverage after twenty unrelated successful runs", async () => {
    vi.spyOn(githubService, "getWorkflowRuns").mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => run(i)) as never,
    );
    vi.spyOn(githubService, "getRunArtifacts").mockImplementation(
      async (_owner, _repo, id) => (id === 24 ? [artifact] : []) as never,
    );
    vi.spyOn(githubService, "downloadArtifact").mockResolvedValue(
      new ArrayBuffer(0),
    );
    const result = await fetchArtifacts("getsentry", "cli", "main", 90);
    expect(result.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ runId: 24 })]),
    );
  });

  it("does not turn artifact-list failures into an empty dashboard", async () => {
    vi.spyOn(githubService, "getWorkflowRuns").mockResolvedValue([
      run(1),
    ] as never);
    vi.spyOn(githubService, "getRunArtifacts").mockRejectedValue(
      new Error("API rate limit exceeded"),
    );
    const result = await fetchArtifacts("getsentry", "cli", "main", 7);
    expect(result.errors).toEqual(["API rate limit exceeded"]);
  });

  it("does not hide network failures while downloading known artifacts", async () => {
    vi.spyOn(githubService, "getWorkflowRuns").mockResolvedValue([
      run(1),
    ] as never);
    vi.spyOn(githubService, "getRunArtifacts").mockResolvedValue([
      artifact,
    ] as never);
    vi.spyOn(githubService, "downloadArtifact").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    const result = await fetchArtifacts("getsentry", "cli", "main", 7);
    expect(result.errors).toEqual(["Failed to fetch"]);
  });
});
