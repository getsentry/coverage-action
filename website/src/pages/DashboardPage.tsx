import { skipToken, useQuery } from "@tanstack/react-query";
import ignore from "ignore";
import { Activity, AlertCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BranchSelector } from "../components/BranchSelector";
import { CoverageChart } from "../components/CoverageChart";
import { DashboardContentSkeleton } from "../components/DashboardSkeleton";
import { FileCoverageTree, mergeFiles } from "../components/FileCoverageTree";
import { FileSourceDialog } from "../components/FileSourceDialog";
import { RunsTable } from "../components/RunsTable";
import { StatCard } from "../components/StatCard";
import { TestResultsChart } from "../components/TestResultsChart";
import { TimeRangeFilter } from "../components/TimeRangeFilter";
import { useArtifacts } from "../hooks/useArtifacts";
import { useBranches } from "../hooks/useBranches";
import { githubService, type RepoInfo } from "../services/githubAPI";
import type { FileCoverage } from "../types";

const VALID_DAYS = new Set([7, 30, 90, 365]);
const DEFAULT_DAYS = 7;

function parseDays(value: string | null): number {
  if (!value) return DEFAULT_DAYS;
  const n = Number.parseInt(value, 10);
  return VALID_DAYS.has(n) ? n : DEFAULT_DAYS;
}

/**
 * Coverage reports emit paths the way their tool saw them, including `./` and
 * `../` prefixes. The `ignore` matcher rejects both, so resolve those segments
 * against the repository root: `..` clamps at the root and empty results mean
 * the report's path carried no repository location.
 */
function toIgnorePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
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
    retry,
    hasMore,
    loadMore,
    runsChecked,
  } = useArtifacts(org, repo, effectiveBranch, days);

  // Calculate stats from latest data point
  const latestData = data.length > 0 ? data[data.length - 1] : null;
  const previousData = data.length > 1 ? data[data.length - 2] : null;

  // Drill-down state: the file whose source is open in the Files tab.
  const [activeTab, setActiveTab] = useState<"overview" | "files">("overview");
  const [selectedFile, setSelectedFile] = useState<FileCoverage | null>(null);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);

  // Artifacts written before per-file coverage report no files at all.
  const latestFiles = latestData?.coverage?.files ?? [];
  // Merged reports can repeat a file; aggregate them before rendering so the
  // tree, source dialog, and headline describe the same coverage data.
  const displayFiles = useMemo(
    () => mergeFiles(latestFiles, repo ?? ""),
    [latestFiles, repo],
  );
  // The repository's root .gitignore at the displayed commit. A missing file
  // yields null, so no exclusions are applied.
  const { data: gitignoreContent } = useQuery<string | null>({
    queryKey: ["gitignore", org, repo, latestData?.commitSha],
    queryFn:
      org && repo && latestData?.commitSha
        ? () => githubService.getGitignore(org, repo, latestData.commitSha)
        : skipToken,
    enabled: !!org && !!repo && !!latestData?.commitSha,
  });
  // Coverage tools still report files the repository ignores; keep them out of
  // the browser tree while the headline totals keep describing the whole report.
  // The exclusion is a pure derivation over the already-fetched gitignore, so a
  // future per-view toggle can disable it by returning displayFiles unchanged.
  const filteredFiles = useMemo(() => {
    if (!gitignoreContent || displayFiles.length === 0) return displayFiles;
    const ig = ignore().add(gitignoreContent);
    return displayFiles.filter((file) => {
      const path = toIgnorePath(file.path);
      return path === "" || !ig.ignores(path);
    });
  }, [displayFiles, gitignoreContent]);
  // Distinguishes an excluded-everything report from one with no per-file data.
  const allFilesExcluded =
    displayFiles.length > 0 && filteredFiles.length === 0;
  // Reports without files have nothing to show in the Files tab, so it is hidden.
  const tab = displayFiles.length > 0 ? activeTab : "overview";

  const getStatTrend = (
    current: number | undefined,
    previous: number | undefined,
  ) => {
    if (current === undefined || previous === undefined) return undefined;
    const diff = current - previous;
    if (diff === 0) return undefined;
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
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
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
          <AlertTitle>
            {data.length > 0
              ? "Some Reports Could Not Be Loaded"
              : "Error Loading Data"}
          </AlertTitle>
          <AlertDescription>
            {data.length > 0 && (
              <span>Showing reports that loaded successfully.</span>
            )}
            <span>{dataError}</span>
            <Button
              variant="outline"
              disabled={dataFetching}
              onClick={() => void retry()}
            >
              Retry failed loads
            </Button>
          </AlertDescription>
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

      {/* View tabs -- Files only exists when the latest report has per-file data */}
      {displayFiles.length > 0 && (
        <div className="mb-6 flex items-center gap-2">
          <Button
            variant={tab === "overview" ? "default" : "outline"}
            size="sm"
            aria-pressed={tab === "overview"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </Button>
          <Button
            variant={tab === "files" ? "default" : "outline"}
            size="sm"
            aria-pressed={tab === "files"}
            onClick={() => setActiveTab("files")}
          >
            Files
          </Button>
        </div>
      )}

      {/* Stats Overview */}
      {tab === "overview" && latestData && (
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
      {tab === "overview" && data.length > 0 && (
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

      {/* Files tab: octocov-style coverage tree for the latest run */}
      {tab === "files" && latestData?.coverage && (
        <div
          className={`mb-8 transition-opacity duration-200 ${showingStaleData ? "opacity-60" : ""}`}
        >
          <Card>
            <CardHeader>
              <CardTitle>File Coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    Overall line coverage
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {latestData.coverage.lineRate.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      latestData.coverage.lineRate >= 80
                        ? "bg-emerald-500"
                        : latestData.coverage.lineRate >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${latestData.coverage.lineRate}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    Covered{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {latestData.coverage.coveredStatements}/
                      {latestData.coverage.totalStatements}
                    </span>
                  </span>
                  <span>
                    Branch{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {latestData.coverage.branchRate.toFixed(1)}%
                    </span>
                  </span>
                  <span>
                    Files{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {displayFiles.length}
                    </span>
                  </span>
                </div>
              </div>

              <FileCoverageTree
                files={filteredFiles}
                allFilesExcluded={allFilesExcluded}
                onFileSelect={(file) => {
                  setSelectedFile(file);
                  setSourceDialogOpen(true);
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Runs */}
      {tab === "overview" && data.length > 0 && (
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

      <FileSourceDialog
        key={`${selectedFile?.path ?? ""}@${latestData?.commitSha ?? ""}`}
        file={selectedFile}
        open={sourceDialogOpen}
        onOpenChange={setSourceDialogOpen}
        owner={org ?? ""}
        repo={repo ?? ""}
        ref={latestData?.commitSha ?? ""}
      />
    </div>
  );
}
