// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import AdmZip from "adm-zip";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "../src/pages/DashboardPage";

const requests = vi.fn<typeof fetch>();
const run = (id: number) => ({
  id,
  created_at: new Date(Date.now() - 60_000).toISOString(),
  head_sha: `commit-${id}`,
  run_number: id,
});
const coverageRun = run(51);

/** Line 11 is missed and line 12 partially covered in the fixture below. */
const PARTIAL_SOURCE = `import { readFile } from "node:fs/promises";

export async function readReport(path: string) {
  const raw = await readFile(path, "utf8");
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}

export function neverCovered() {
  throw new Error("not covered");
}
`;

const FULLY_COVERED_FILE = {
  name: "fully-covered.ts",
  path: "src/fully-covered.ts",
  statements: 60,
  coveredStatements: 60,
  conditionals: 4,
  coveredConditionals: 4,
  methods: 6,
  coveredMethods: 6,
  lineRate: 100,
  branchRate: 100,
  lines: [
    { lineNumber: 1, count: 3, type: "stmt" },
    { lineNumber: 2, count: 1, type: "cond", trueCount: 1, falseCount: 1 },
  ],
  missingLines: [],
  partialLines: [],
};

const PARTIALLY_COVERED_FILE = {
  name: "partially-covered.ts",
  path: "src/partially-covered.ts",
  statements: 40,
  coveredStatements: 22,
  conditionals: 4,
  coveredConditionals: 2,
  methods: 5,
  coveredMethods: 3,
  lineRate: 55,
  branchRate: 50,
  lines: [
    { lineNumber: 10, count: 5, type: "stmt" },
    { lineNumber: 11, count: 0, type: "stmt" },
    { lineNumber: 12, count: 2, type: "cond", trueCount: 2, falseCount: 0 },
  ],
  missingLines: [11],
  partialLines: [12],
};

/** A second merged report measured the same file differently. */
const PARTIALLY_COVERED_RERUN = {
  ...PARTIALLY_COVERED_FILE,
  statements: 8,
  coveredStatements: 1,
  lineRate: 12.5,
  branchRate: 0,
  lines: [{ lineNumber: 1, count: 0, type: "stmt" }],
  missingLines: [1],
  partialLines: [],
};

/** Merge of two reports: the same file is listed twice. */
const MERGED_REPORT_FILES = [
  FULLY_COVERED_FILE,
  PARTIALLY_COVERED_FILE,
  PARTIALLY_COVERED_RERUN,
];

/** The C# report records the path without the src/ source root. */
const CSHARP_REPORTED_PATH =
  "Core/Authentication/KeyStore/UserCorrelationIdentifier.cs";
const CSHARP_REPO_PATH = `src/${CSHARP_REPORTED_PATH}`;
const CI_REPORTED_PATH =
  "/home/runner/work/project/project/src/partially-covered.ts";

const CSHARP_FILE = {
  name: "UserCorrelationIdentifier.cs",
  path: CSHARP_REPORTED_PATH,
  statements: 12,
  coveredStatements: 9,
  conditionals: 2,
  coveredConditionals: 1,
  methods: 3,
  coveredMethods: 2,
  lineRate: 75,
  branchRate: 50,
  lines: [
    { lineNumber: 1, count: 2, type: "stmt" },
    { lineNumber: 5, count: 0, type: "stmt" },
  ],
  missingLines: [5],
  partialLines: [],
};

const CSHARP_SOURCE = `namespace Core.Authentication.KeyStore;

public sealed class UserCorrelationIdentifier
{
    private readonly string value;

    public UserCorrelationIdentifier(string value)
    {
        this.value = value;
    }

    public bool IsEmpty()
    {
        return string.IsNullOrEmpty(value);
    }
}
`;

const CI_REPORTED_FILE = {
  ...PARTIALLY_COVERED_FILE,
  path: CI_REPORTED_PATH,
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** One GitHub fixture: the report, the repository contents, and the commit tree. */
interface Fixture {
  /** Latest run id, whose commit the source viewer reads from. */
  runId: number;
  /** Per-file coverage entries written into coverage-results.json. */
  files: Array<{ statements: number; coveredStatements: number }>;
  /** Source served by the Contents API, keyed by repository path. */
  sources: Record<string, string>;
  /** Blob paths present in the commit's tree. */
  treePaths: string[];
}

/**
 * The top-level rate comes from the report, not from the per-file entries, so
 * the overview and the file tree intentionally disagree.
 */
function coverageReport(files: Fixture["files"]) {
  return {
    lineRate: 81.83,
    branchRate: 73.88,
    totalStatements: files.reduce((sum, file) => sum + file.statements, 0),
    coveredStatements: files.reduce(
      (sum, file) => sum + file.coveredStatements,
      0,
    ),
    files,
  };
}

// Exercise the real HTTP client, ZIP parser, query hooks, and dashboard together.
function fixtureResponse(fixture: Fixture) {
  const latestRun = run(fixture.runId);
  const commit = `commit-${fixture.runId}`;
  const contentsPrefix = "/repos/example/project/contents/";

  return async function respond(input: Parameters<typeof fetch>[0]) {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/branches")) {
      return json(
        ["main", "empty"].map((name) => ({
          name,
          commit: { sha: name, url: "" },
        })),
      );
    }
    if (url.pathname.endsWith("/runs")) {
      if (url.searchParams.get("branch") === "empty")
        return json({ workflow_runs: [], total_count: 0 });
      return json({
        workflow_runs:
          url.searchParams.get("page") === "2"
            ? [latestRun]
            : Array.from({ length: 50 }, (_, i) => run(i + 1)),
        total_count: 51,
      });
    }
    if (url.pathname.endsWith("/artifacts")) {
      const artifacts = url.pathname.includes(`/runs/${fixture.runId}/`)
        ? [
            {
              id: 100,
              name: "codecov-coverage-results-main-unit",
              expired: false,
            },
          ]
        : [];
      return json({ artifacts, total_count: artifacts.length });
    }
    if (url.pathname.endsWith("/zip")) {
      const zip = new AdmZip();
      zip.addFile(
        "coverage-results.json",
        Buffer.from(JSON.stringify(coverageReport(fixture.files))),
      );
      return new Response(Uint8Array.from(zip.toBuffer()).buffer, {
        headers: { "content-type": "application/zip" },
      });
    }
    if (url.pathname === `/repos/example/project/git/trees/${commit}`) {
      return json({
        sha: "tree-sha",
        truncated: false,
        tree: fixture.treePaths.map((path) => ({
          path,
          mode: "100644",
          type: "blob",
          sha: "blob-sha",
          size: 1,
          url: "",
        })),
      });
    }
    // Octokit encodes the whole path, so the file's slashes arrive as %2F.
    const requested = decodeURIComponent(url.pathname);
    if (requested.startsWith(contentsPrefix)) {
      const path = requested.slice(contentsPrefix.length);
      const source =
        url.searchParams.get("ref") === commit ? fixture.sources[path] : null;
      if (source == null) return json({ message: "Not Found" }, 404);
      return json({
        type: "file",
        name: path.split("/").pop(),
        path,
        encoding: "base64",
        content: Buffer.from(source).toString("base64"),
      });
    }
    if (url.pathname === "/repos/example/project")
      return json({ default_branch: "main" });
    throw new Error(`Unexpected GitHub request: ${url.pathname}`);
  };
}

const DEFAULT_FIXTURE: Fixture = {
  runId: coverageRun.id,
  files: MERGED_REPORT_FILES,
  sources: { "src/partially-covered.ts": PARTIAL_SOURCE },
  treePaths: ["src/fully-covered.ts", "src/partially-covered.ts"],
};

const githubResponse = fixtureResponse(DEFAULT_FIXTURE);

const disposers: Array<() => void> = [];
function openDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [{ path: "/:org/:repo", element: <DashboardPage /> }],
    {
      initialEntries: ["/example/project?days=90"],
    },
  );
  disposers.push(() => {
    client.clear();
    router.dispose();
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  localStorage.clear();
  requests.mockReset().mockImplementation(githubResponse);
  vi.stubGlobal("fetch", requests);
  // jsdom has no layout engine. Supply chart container measurements, not a chart mock.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800,
    height: 300,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 300,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dashboard regression coverage", () => {
  it("loads older reports from the empty state and renders their metrics", async () => {
    openDashboard();
    const older = await screen.findByRole("button", {
      name: "Load older runs",
    });
    expect(screen.getByText("No Data Available")).toBeTruthy();
    fireEvent.click(older);
    expect(await screen.findAllByText("81.8%")).toHaveLength(2);
    expect(screen.getAllByText("73.9%")).toHaveLength(2);
    expect(
      within(screen.getByRole("table", { name: "Recent runs" })).getByText(
        "51",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Coverage Over Time")).toBeTruthy();
    expect(screen.getByText("Coverage %")).toBeTruthy();
    expect(screen.queryByText("No Data Available")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Load older runs" }),
    ).toBeNull();
  });

  it("browses the latest run's file tree and colors line coverage", async () => {
    openDashboard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Load older runs" }),
    );

    await screen.findByRole("table", { name: "Recent runs" });
    expect(screen.queryByText("File Coverage")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    const tree = await screen.findByRole("table", {
      name: "File coverage tree",
    });
    // The tree nests source files under their directory, which aggregates them.
    const directoryRow = within(tree).getByTitle("src").closest("tr");
    expect(directoryRow?.textContent).toContain("108");
    expect(directoryRow?.textContent).toContain("76.9%");
    expect(within(tree).getByTitle("src/fully-covered.ts")).toBeTruthy();
    // The report lists src/partially-covered.ts twice and it renders once,
    // with all report entries merged into its displayed metrics.
    expect(within(tree).getAllByTitle("src/partially-covered.ts")).toHaveLength(
      1,
    );
    expect(
      within(tree).getByTitle("src/partially-covered.ts").closest("tr")
        ?.textContent,
    ).toContain("47.9%");
    // The Files stat counts unique files, not report entries.
    const filesStats = screen.getByText("Covered").parentElement;
    expect(filesStats?.textContent?.replace(/\s+/g, "")).toContain("Files2");
    // Overview sections are replaced, not stacked.
    expect(screen.queryByText("Coverage Over Time")).toBeNull();
    expect(screen.queryByText("Latest Run File Coverage")).toBeNull();

    const filter = screen.getByLabelText("Filter files");
    fireEvent.change(filter, { target: { value: "partial" } });
    expect(within(tree).queryByTitle("src/fully-covered.ts")).toBeNull();
    expect(within(tree).getByTitle("src/partially-covered.ts")).toBeTruthy();

    fireEvent.change(filter, { target: { value: "" } });
    fireEvent.click(within(tree).getByTitle("src/partially-covered.ts"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("src/partially-covered.ts")).toBeTruthy();
    expect(dialog.textContent).toContain("47.9%");

    // Source comes from the GitHub Contents API at the run's commit, highlighted.
    await waitFor(() =>
      expect(dialog.textContent).toContain("export function neverCovered"),
    );

    const missedLine = Array.from(
      dialog.querySelectorAll('[data-state="missed"]'),
    ).find((line) => line.textContent?.includes("neverCovered"));
    expect(missedLine?.className).toContain("bg-red-500/15");
    expect(missedLine?.querySelector(".token.keyword")?.textContent).toBe(
      "export",
    );
    expect(missedLine?.textContent).toContain("neverCovered");
    expect(dialog.querySelector('[data-state="partial"]')?.className).toContain(
      "bg-amber-500/15",
    );
    expect(dialog.querySelector('[data-state="covered"]')?.className).toContain(
      "bg-emerald-500/15",
    );
  });

  it("shows CI paths relative to the repository and loads their source", async () => {
    const fixture: Fixture = {
      runId: 54,
      files: [CI_REPORTED_FILE],
      sources: { "src/partially-covered.ts": PARTIAL_SOURCE },
      treePaths: ["src/partially-covered.ts"],
    };
    requests.mockImplementation(fixtureResponse(fixture));

    openDashboard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Load older runs" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Files" }));

    const tree = await screen.findByRole("table", {
      name: "File coverage tree",
    });
    expect(within(tree).getByTitle("src/partially-covered.ts")).toBeTruthy();
    expect(within(tree).queryByTitle(CI_REPORTED_PATH)).toBeNull();

    fireEvent.click(within(tree).getByTitle("src/partially-covered.ts"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.textContent).toContain("export function neverCovered"),
    );
  });

  it("resolves a coverage path that omits the source root", async () => {
    const fixture: Fixture = {
      runId: 52,
      files: [CSHARP_FILE],
      sources: { [CSHARP_REPO_PATH]: CSHARP_SOURCE },
      treePaths: ["src/index.ts", CSHARP_REPO_PATH],
    };
    requests.mockImplementation(fixtureResponse(fixture));

    openDashboard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Load older runs" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Files" }));
    const tree = await screen.findByRole("table", {
      name: "File coverage tree",
    });
    fireEvent.click(within(tree).getByTitle(CSHARP_REPORTED_PATH));

    // The report's path 404s, so the commit's tree supplies the real one.
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.textContent).toContain(
        "public sealed class UserCorrelationIdentifier",
      ),
    );
    expect(dialog.textContent).toContain(
      "This file was loaded from a different path than the coverage report",
    );
    expect(dialog.textContent).toContain(CSHARP_REPO_PATH);
  });

  it("loads a path entered by hand when the report's path is unknown", async () => {
    const stalePath =
      "legacy/Core/Authentication/KeyStore/UserCorrelationIdentifier.cs";
    const fixture: Fixture = {
      runId: 53,
      files: [CSHARP_FILE],
      sources: { [CSHARP_REPO_PATH]: CSHARP_SOURCE },
      treePaths: [stalePath],
    };
    requests.mockImplementation(fixtureResponse(fixture));

    openDashboard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Load older runs" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Files" }));
    const tree = await screen.findByRole("table", {
      name: "File coverage tree",
    });
    fireEvent.click(within(tree).getByTitle(CSHARP_REPORTED_PATH));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.textContent).toContain("Could not load source"),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit path" }));
    fireEvent.change(within(dialog).getByLabelText("File path"), {
      target: { value: CSHARP_REPO_PATH },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Load source" }),
    );

    await waitFor(() =>
      expect(dialog.textContent).toContain(
        "public sealed class UserCorrelationIdentifier",
      ),
    );
    expect(dialog.textContent).not.toContain("Could not load source");
  });

  it("clears the previous branch's metrics while the new branch is loading", async () => {
    const router = openDashboard();
    fireEvent.click(
      await screen.findByRole("button", { name: "Load older runs" }),
    );
    await screen.findAllByText("81.8%");
    let resolveEmpty!: (response: Response) => void;
    requests.mockImplementation((input) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith("/runs") &&
        url.searchParams.get("branch") === "empty"
      ) {
        return new Promise((resolve) => {
          resolveEmpty = resolve;
        });
      }
      return githubResponse(input);
    });
    await act(() => router.navigate("/example/project?days=90&branch=empty"));
    await waitFor(() => expect(resolveEmpty).toBeTypeOf("function"));
    expect(screen.queryAllByText("81.8%")).toHaveLength(0);
    await act(async () =>
      resolveEmpty(json({ workflow_runs: [], total_count: 0 })),
    );
    expect(await screen.findByText("No Data Available")).toBeTruthy();
  });

  it("displays repository rate limits without redirecting to a 404", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    requests.mockImplementation((input) =>
      new URL(String(input)).pathname === "/repos/example/project"
        ? Promise.resolve(json({ message: "API rate limit exceeded" }, 403))
        : githubResponse(input),
    );
    const router = openDashboard();
    expect(await screen.findByText("Error Loading Repository")).toBeTruthy();
    expect(screen.getByText("API rate limit exceeded")).toBeTruthy();
    expect(screen.queryByText("Repository Not Found")).toBeNull();
    expect(router.state.location.pathname).toBe("/example/project");
  });

  it("displays artifact failures instead of claiming there is no data", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    requests.mockImplementation((input) =>
      new URL(String(input)).pathname.endsWith("/artifacts")
        ? Promise.resolve(
            json({ message: "Artifact service unavailable" }, 503),
          )
        : githubResponse(input),
    );
    openDashboard();
    expect(await screen.findByText("Error Loading Data")).toBeTruthy();
    expect(screen.getByText("Artifact service unavailable")).toBeTruthy();
    expect(screen.queryByText("No Data Available")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Load older runs" }),
    ).toBeTruthy();
    requests.mockImplementation(githubResponse);
    fireEvent.click(screen.getByRole("button", { name: "Retry failed loads" }));
    expect(await screen.findByText("No Data Available")).toBeTruthy();
    expect(screen.queryByText("Error Loading Data")).toBeNull();
  });

  it("keeps valid reports and older pages when another run fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    requests.mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/runs/1/artifacts")) {
        return Promise.resolve(
          json({ message: "Artifact service unavailable" }, 503),
        );
      }
      if (url.pathname.endsWith("/runs/2/artifacts")) {
        return Promise.resolve(
          json({
            artifacts: [
              {
                id: 100,
                name: "codecov-coverage-results-main-unit",
                expired: false,
              },
            ],
          }),
        );
      }
      return githubResponse(input);
    });
    openDashboard();
    expect(await screen.findAllByText("81.8%")).toHaveLength(2);
    expect(screen.getByText("Some Reports Could Not Be Loaded")).toBeTruthy();
    expect(screen.getByText(/Artifact service unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load older runs" }));
    const runsTable = () => screen.getByRole("table", { name: "Recent runs" });
    expect(await within(runsTable()).findByText("51")).toBeTruthy();
    expect(within(runsTable()).getByText("2")).toBeTruthy();
  });

  it("keeps coverage when the test report in the same run is malformed", async () => {
    requests.mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/runs")) {
        return Promise.resolve(
          json({ workflow_runs: [coverageRun], total_count: 1 }),
        );
      }
      if (url.pathname.endsWith("/runs/51/artifacts")) {
        return Promise.resolve(
          json({
            artifacts: [
              {
                id: 100,
                name: "codecov-coverage-results-main-unit",
                expired: false,
              },
              {
                id: 101,
                name: "codecov-test-results-main-unit",
                expired: false,
              },
            ],
          }),
        );
      }
      if (url.pathname.endsWith("/artifacts/101/zip")) {
        const zip = new AdmZip();
        zip.addFile("test-results.json", Buffer.from("{"));
        return Promise.resolve(
          new Response(Uint8Array.from(zip.toBuffer()).buffer, {
            headers: { "content-type": "application/zip" },
          }),
        );
      }
      return githubResponse(input);
    });
    openDashboard();
    expect(await screen.findAllByText("81.8%")).toHaveLength(2);
    expect(screen.getByText("Some Reports Could Not Be Loaded")).toBeTruthy();
    expect(screen.getByText(/Invalid test-results.json report/)).toBeTruthy();
    expect(screen.queryByText("No Data Available")).toBeNull();
  });
});
