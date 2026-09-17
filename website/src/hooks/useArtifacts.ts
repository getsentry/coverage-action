import { skipToken, useInfiniteQuery } from "@tanstack/react-query";
import { parseArtifact } from "../services/artifactParser";
import { githubService, WORKFLOW_RUNS_PAGE_SIZE } from "../services/githubAPI";
import type { TimeSeriesDataPoint } from "../types";

interface ArtifactPage {
  data: TimeSeriesDataPoint[];
  nextPage: number | undefined;
  runsChecked: number;
}

/** Load bounded pages so older coverage remains reachable without exhausting the API. */
export function useArtifacts(
  owner: string | undefined,
  repo: string | undefined,
  branch: string | null,
  days: number,
) {
  const query = useInfiniteQuery({
    queryKey: ["artifacts", owner, repo, branch, days],
    initialPageParam: 1,
    queryFn:
      owner && repo && branch
        ? ({ pageParam }) =>
            fetchArtifacts(owner, repo, branch, days, pageParam)
        : skipToken,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!owner && !!repo && !!branch,
  });

  const points = new Map<string, TimeSeriesDataPoint>();
  for (const page of query.data?.pages ?? []) {
    for (const point of page.data) {
      // Pages are newest-first. Preserve the newest run for each commit.
      if (!points.has(point.commitSha)) points.set(point.commitSha, point);
    }
  }

  return {
    data: [...points.values()].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    ),
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error?.message ?? null,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    runsChecked:
      query.data?.pages.reduce((sum, page) => sum + page.runsChecked, 0) ?? 0,
  };
}

export async function fetchArtifacts(
  owner: string,
  repo: string,
  branch: string,
  days: number,
  page = 1,
): Promise<ArtifactPage> {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // 1. Fetch workflow runs for branch
  const runs = await githubService.getWorkflowRuns(
    owner,
    repo,
    branch,
    page,
    start.toISOString(),
  );

  // 2. Filter by time range
  const filteredRuns = runs.filter((run) => {
    const runDate = new Date(run.created_at);
    return runDate >= start && runDate <= now;
  });

  // 3. For each run, fetch and parse artifacts
  const dataPoints: TimeSeriesDataPoint[] = [];
  const processedRunIds = new Set<number>();

  // Process runs in parallel batches of 5 for speed
  const BATCH_SIZE = 5;
  for (let i = 0; i < filteredRuns.length; i += BATCH_SIZE) {
    const batch = filteredRuns.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((run) => processRun(owner, repo, run, processedRunIds)),
    );

    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      if (result.value.authError) {
        throw new Error(
          "Authentication required to download artifacts. " +
            "GitHub requires a Personal Access Token with Actions read access, even for public repositories. " +
            "Please set up or update your token using the button in the header.",
        );
      }
      if (result.value.dataPoint) dataPoints.push(result.value.dataPoint);
    }
  }

  // Remove duplicates - keep only the most recent run per commit SHA
  const uniqueDataPoints = new Map<string, TimeSeriesDataPoint>();
  dataPoints.sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const point of dataPoints) {
    if (!uniqueDataPoints.has(point.commitSha)) {
      uniqueDataPoints.set(point.commitSha, point);
    }
  }

  // Sort oldest-first for chart display
  return {
    data: Array.from(uniqueDataPoints.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    ),
    nextPage: runs.length === WORKFLOW_RUNS_PAGE_SIZE ? page + 1 : undefined,
    runsChecked: runs.length,
  };
}

interface ProcessRunResult {
  dataPoint?: TimeSeriesDataPoint;
  authError?: boolean;
}

async function processRun(
  owner: string,
  repo: string,
  run: { id: number; created_at: string; head_sha: string; run_number: number },
  processedRunIds: Set<number>,
): Promise<ProcessRunResult> {
  if (processedRunIds.has(run.id)) return {};
  processedRunIds.add(run.id);

  let authError = false;

  const artifacts = await githubService.getRunArtifacts(owner, repo, run.id);

  const testArtifact = artifacts.find(
    (a) => a.name.startsWith("codecov-test-results") && !a.expired,
  );
  const coverageArtifact = artifacts.find(
    (a) => a.name.startsWith("codecov-coverage-results") && !a.expired,
  );

  if (!testArtifact && !coverageArtifact) return {};

  const dataPoint: TimeSeriesDataPoint = {
    date: new Date(run.created_at),
    commitSha: run.head_sha,
    runId: run.id,
    runNumber: run.run_number || 0,
  };

  // Download test and coverage artifacts in parallel
  const [testResult, coverageResult] = await Promise.allSettled([
    testArtifact
      ? githubService
          .downloadArtifact(owner, repo, testArtifact.id)
          .then(parseArtifact)
      : Promise.resolve(null),
    coverageArtifact
      ? githubService
          .downloadArtifact(owner, repo, coverageArtifact.id)
          .then(parseArtifact)
      : Promise.resolve(null),
  ]);

  if (testResult.status === "fulfilled" && testResult.value?.tests) {
    const t = testResult.value.tests;
    dataPoint.tests = {
      total: t.totalTests,
      passed: t.passedTests,
      failed: t.failedTests,
      skipped: t.skippedTests,
      passRate: t.passRate,
      totalTime: t.totalTime,
    };
  } else if (testResult.status === "rejected") {
    if (isAuthError(testResult.reason)) authError = true;
    else throw testResult.reason;
  }

  if (coverageResult.status === "fulfilled" && coverageResult.value?.coverage) {
    dataPoint.coverage = coverageResult.value.coverage;
  } else if (coverageResult.status === "rejected") {
    if (isAuthError(coverageResult.reason)) authError = true;
    else throw coverageResult.reason;
  }

  if (dataPoint.tests || dataPoint.coverage) {
    return { dataPoint, authError };
  }

  return { authError };
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error && /rate limit/i.test(err.message)) return false;
  if (typeof err === "object" && err !== null && "status" in err) {
    if (err.status === 401 || err.status === 403) return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("authentication") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden")
    );
  }
  return false;
}
