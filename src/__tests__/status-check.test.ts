import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusReporter } from "../reporters/status-check.js";

const createCommitStatus = vi.fn();

vi.mock("@actions/github", () => ({
  getOctokit: () => ({
    rest: {
      repos: { createCommitStatus },
    },
  }),
  context: {
    eventName: "pull_request",
    sha: "mergecommitsha",
    repo: { owner: "owner", repo: "repo" },
    payload: {
      pull_request: {
        number: 1,
        base: { sha: "0123456789abcdef" },
        head: { sha: "abcdef0123456789" },
      },
    },
  },
}));

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

describe("StatusReporter.reportStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("without status-key: reports the plain context", async () => {
    const reporter = new StatusReporter("token");
    await reporter.reportStatus("codecov/project", "success", "desc");

    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ context: "codecov/project" }),
    );
  });

  it("with status-key set: suffixes the context with the key", async () => {
    const reporter = new StatusReporter("token", "frontend");
    await reporter.reportStatus("codecov/project", "success", "desc");
    await reporter.reportStatus("codecov/patch", "failure", "desc");

    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "codecov/project (frontend)",
        state: "success",
      }),
    );
    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "codecov/patch (frontend)",
        state: "failure",
      }),
    );
  });

  it("steps with different keys report separate statuses", async () => {
    await new StatusReporter("token", "frontend").reportStatus(
      "codecov/patch",
      "success",
      "desc",
    );
    await new StatusReporter("token", "backend").reportStatus(
      "codecov/patch",
      "failure",
      "desc",
    );

    const contexts = createCommitStatus.mock.calls.map(
      ([params]) => params.context,
    );
    expect(contexts).toEqual([
      "codecov/patch (frontend)",
      "codecov/patch (backend)",
    ]);
  });
});
