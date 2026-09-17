import { skipToken, useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BranchSelector } from "../components/BranchSelector";
import { CoverageChart } from "../components/CoverageChart";
import { DashboardContentSkeleton } from "../components/DashboardSkeleton";
import { RunsTable } from "../components/RunsTable";
import { StatCard } from "../components/StatCard";
import { TestResultsChart } from "../components/TestResultsChart";
import { TimeRangeFilter } from "../components/TimeRangeFilter";
import { useArtifacts } from "../hooks/useArtifacts";
import { useBranches } from "../hooks/useBranches";
import { githubService, type RepoInfo } from "../services/githubAPI";

const VALID_DAYS = new Set([7, 30, 90, 365]);
const DEFAULT_DAYS = 7;

function parseDays(value: string | null): number {
  if (!value) return DEFAULT_DAYS;
  const n = Number.parseInt(value, 10);
  return VALID_DAYS.has(n) ? n : DEFAULT_DAYS;
}

export default function DashboardPage() {
  const { org, repo } = useParams<{ org: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read state from URL search params
  const branchParam = searchParams.get("branch");
  const days = parseDays(searchParams.get("days"));

  // Helpers to update URL params without losing the other param
  const setBranch = useCallback(
    (branch: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("branch", branch);
        return next;
      });
    },
    [setSearchParams],
  );

  const setDays = useCallback(
    (d: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("days", d.toString());
        return next;
      });
    },
    [setSearchParams],
  );

  // Fetch repository info (existence + default branch)
  const {
    data: repoInfo,
    isLoading: repoLoading,
    error: repoError,
  } = useQuery<RepoInfo | null>({
    queryKey: ["repoInfo", org, repo],
    queryFn:
      org && repo ? () => githubService.getRepoInfo(org, repo) : skipToken,
    enabled: !!org && !!repo,
  });

  const {
    branches,
    loading: branchesLoading,
    error: branchesError,
  } = useBranches(org, repo);

  // Derive the effective branch:
  //  1. URL ?branch= param if present and valid
  //  2. Repo's default branch from the API
  //  3. First branch in the list as last resort
  const effectiveBranch = useMemo(() => {
    if (!repoInfo) return null;
    if (branchParam && branches.length > 0) {
      if (branches.some((b) => b.name === branchParam)) {
        return branchParam;
      }
    }
    if (branches.length === 0) return null;
    if (repoInfo?.defaultBranch) {
      const defaultMatch = branches.find(
        (b) => b.name === repoInfo.defaultBranch,
      );
      if (defaultMatch) return defaultMatch.name;
    }
    return branches[0].name;
  }, [branchParam, branches, repoInfo]);

  const {
    data,
    loading: dataLoading,
    fetching: dataFetching,
    error: dataError,
    hasMore,
    loadMore,
    runsChecked,
  } = useArtifacts(org, repo, effectiveBranch, days);

  // Calculate stats from latest data point
  const latestData = data.length > 0 ? data[data.length - 1] : null;
  const previousData = data.length > 1 ? data[data.length - 2] : null;

  const getStatTrend = (
    current: number | undefined,
    previous: number | undefined,
  ) => {
    if (!current || !previous) return undefined;
    const diff = current - previous;
    return diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
  };

  // Keep the repository URL available for retrying with a different token.
  if (repoInfo === null && !repoLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Repository Not Found</AlertTitle>
          <AlertDescription>
            The repository {org}/{repo} doesn't exist or is not accessible.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Full-page skeleton while branches / repo check are loading
  if (branchesLoading || repoLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <DashboardContentSkeleton />
      </div>
    );
  }

  if (repoError || branchesError) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Repository</AlertTitle>
          <AlertDescription>
            {repoError?.message ?? branchesError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Whether we have stale data being shown while a refetch is in progress
  const showingStaleData = dataFetching && data.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            {org}/{repo}
          </h1>
          <div className="flex items-center gap-3">
            <BranchSelector
              branches={branches}
              value={effectiveBranch ?? ""}
              onChange={setBranch}
            />
            <TimeRangeFilter value={days} onChange={setDays} />
          </div>
        </div>
      </header>

      {/* Subtle refetching indicator -- shown when cached data is visible */}
      {showingStaleData && (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-3.5 w-3.5 animate-spin" />
          Updating data...
        </div>
      )}

      {/* Error State */}
      {dataError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton on first load (no cached data yet) */}
      {dataLoading && <DashboardContentSkeleton />}

      {/* Empty State (only when not loading and no error) */}
      {!dataLoading && !dataError && data.length === 0 && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No Data Available</AlertTitle>
          <AlertDescription>
            No coverage or test artifacts found in the {runsChecked} workflow
            runs checked for branch "{effectiveBranch}" in the selected time
            range.
            {hasMore && (
              <span className="block mt-2">
                Older runs are available. Load more runs below to continue
                searching.
              </span>
            )}
            {!githubService.hasToken() && (
              <span className="block mt-2">
                Downloading artifacts requires authentication. Try adding a
                GitHub token using the button in the header.
              </span>
            )}
            <span className="block mt-2">
              Check the coverage-action logs for missing report files or failed
              artifact uploads.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {hasMore && (
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="outline"
            disabled={dataFetching}
            onClick={() => void loadMore()}
          >
            {dataFetching ? "Loading runs..." : "Load older runs"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {runsChecked} workflow runs checked
          </span>
        </div>
      )}

      {/* Stats Overview */}
      {latestData && (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 transition-opacity duration-200 ${showingStaleData ? "opacity-60" : ""}`}
        >
          <StatCard
            title="Line Coverage"
            value={
              latestData.coverage
                ? `${latestData.coverage.lineRate.toFixed(1)}%`
                : "N/A"
            }
            trend={getStatTrend(
              latestData.coverage?.lineRate,
              previousData?.coverage?.lineRate,
            )}
          />
          <StatCard
            title="Branch Coverage"
            value={
              latestData.coverage
                ? `${latestData.coverage.branchRate.toFixed(1)}%`
                : "N/A"
            }
            trend={getStatTrend(
              latestData.coverage?.branchRate,
              previousData?.coverage?.branchRate,
            )}
          />
          <StatCard
            title="Tests Passed"
            value={
              latestData.tests
                ? `${latestData.tests.passed}/${latestData.tests.total}`
                : "N/A"
            }
            trend={getStatTrend(
              latestData.tests?.passed,
              previousData?.tests?.passed,
            )}
          />
          <StatCard
            title="Pass Rate"
            value={
              latestData.tests
                ? `${latestData.tests.passRate.toFixed(1)}%`
                : "N/A"
            }
            trend={getStatTrend(
              latestData.tests?.passRate,
              previousData?.tests?.passRate,
            )}
          />
        </div>
      )}

      {/* Charts */}
      {data.length > 0 && (
        <div
          className={`grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 transition-opacity duration-200 ${showingStaleData ? "opacity-60" : ""}`}
        >
          <Card>
            <CardHeader>
              <CardTitle>Coverage Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <CoverageChart data={data} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
            </CardHeader>
            <CardContent>
              <TestResultsChart data={data} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Runs */}
      {data.length > 0 && (
        <div
          className={`transition-opacity duration-200 ${showingStaleData ? "opacity-60" : ""}`}
        >
          <Card>
            <CardHeader>
              <CardTitle>Recent Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <RunsTable data={data} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
