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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Exercise the real HTTP client, ZIP parser, query hooks, and dashboard together.
async function githubResponse(input: Parameters<typeof fetch>[0]) {
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
          ? [coverageRun]
          : Array.from({ length: 50 }, (_, i) => run(i + 1)),
      total_count: 51,
    });
  }
  if (url.pathname.endsWith("/artifacts")) {
    const artifacts = url.pathname.includes("/runs/51/")
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
      Buffer.from(
        JSON.stringify({
          lineRate: 81.83,
          branchRate: 73.88,
          totalStatements: 100,
          coveredStatements: 82,
        }),
      ),
    );
    return new Response(Uint8Array.from(zip.toBuffer()).buffer, {
      headers: { "content-type": "application/zip" },
    });
  }
  if (url.pathname === "/repos/example/project")
    return json({ default_branch: "main" });
  throw new Error(`Unexpected GitHub request: ${url.pathname}`);
}

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
    expect(within(screen.getByRole("table")).getByText("51")).toBeTruthy();
    expect(screen.getByText("Coverage Over Time")).toBeTruthy();
    expect(screen.getByText("Coverage %")).toBeTruthy();
    expect(screen.queryByText("No Data Available")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Load older runs" }),
    ).toBeNull();
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
  });
});
