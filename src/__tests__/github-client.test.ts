import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportFormatter } from "../formatters/report-formatter.js";
import { GitHubClient } from "../utils/github-client.js";

const listComments = vi.fn();
const updateComment = vi.fn();
const createComment = vi.fn();
const createCommitStatus = vi.fn();
const getCommit = vi.fn();
const compareCommitsWithBasehead = vi.fn();
const pullsGet = vi.fn();

vi.mock("@actions/github", () => ({
  getOctokit: () => ({
    rest: {
      issues: { listComments, updateComment, createComment },
      repos: { createCommitStatus, getCommit, compareCommitsWithBasehead },
      pulls: { get: pullsGet },
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

describe("GitHubClient.postOrUpdateComment", () => {
  let client: GitHubClient;
  const legacy = ReportFormatter.getLegacyCommentIdentifier();

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitHubClient("token");
  });

  it("with comment-key set: does not match legacy comment", async () => {
    listComments.mockResolvedValue({
      data: [{ id: 99, body: `${legacy}\nold content` }],
    });

    await client.postOrUpdateComment("new content", "backend");

    expect(updateComment).not.toHaveBeenCalled();
    expect(createComment).toHaveBeenCalledOnce();
  });

  it("without comment-key: matches and updates legacy comment", async () => {
    listComments.mockResolvedValue({
      data: [{ id: 99, body: `${legacy}\nold content` }],
    });

    await client.postOrUpdateComment("new content");

    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 99 }),
    );
    expect(createComment).not.toHaveBeenCalled();
  });

  it("with comment-key set: matches keyed comment", async () => {
    const keyed = ReportFormatter.getCommentIdentifier("backend");
    listComments.mockResolvedValue({
      data: [{ id: 42, body: `${keyed}\nold content` }],
    });

    await client.postOrUpdateComment("new content", "backend");

    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 42 }),
    );
    expect(createComment).not.toHaveBeenCalled();
  });

  it("returns the base and head commit SHAs from the pull request", () => {
    expect(client.getPullRequestCommitRefs()).toEqual({
      baseCommit: "0123456789abcdef",
      headCommit: "abcdef0123456789",
    });
  });
});

describe("GitHubClient.createCommitStatus", () => {
  let client: GitHubClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitHubClient("token");
  });

  it("reports the status on the PR head commit, not the merge commit", async () => {
    await client.createCommitStatus("codecov/patch", "failure", "desc");

    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        sha: "abcdef0123456789",
        context: "codecov/patch",
        state: "failure",
      }),
    );
  });
});

describe("GitHubClient.getPrDiff", () => {
  let client: GitHubClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitHubClient("token");
  });

  it("diffs the merge commit against its first parent when it has two parents", async () => {
    getCommit.mockResolvedValue({
      data: {
        parents: [{ sha: "baseparentsha" }, { sha: "headparentsha" }],
      },
    });
    compareCommitsWithBasehead.mockResolvedValue({ data: "MERGE_DIFF" });

    const diff = await client.getPrDiff();

    expect(compareCommitsWithBasehead).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        basehead: "baseparentsha...mergecommitsha",
      }),
    );
    expect(pullsGet).not.toHaveBeenCalled();
    expect(diff).toBe("MERGE_DIFF");
  });

  it("falls back to the PR diff when the head commit is not a merge commit", async () => {
    getCommit.mockResolvedValue({
      data: { parents: [{ sha: "singleparentsha" }] },
    });
    pullsGet.mockResolvedValue({ data: "PR_DIFF" });

    const diff = await client.getPrDiff();

    expect(compareCommitsWithBasehead).not.toHaveBeenCalled();
    expect(pullsGet).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 1 }),
    );
    expect(diff).toBe("PR_DIFF");
  });

  it("falls back to the PR diff when fetching the merge commit fails", async () => {
    getCommit.mockRejectedValue(new Error("boom"));
    pullsGet.mockResolvedValue({ data: "PR_DIFF" });

    const diff = await client.getPrDiff();

    expect(pullsGet).toHaveBeenCalled();
    expect(diff).toBe("PR_DIFF");
  });
});
