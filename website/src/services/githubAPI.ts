import { Octokit } from "@octokit/rest";
import { tokenStorage } from "./tokenStorage";

export const WORKFLOW_RUNS_PAGE_SIZE = 50;

export interface RepoInfo {
  exists: true;
  defaultBranch: string;
}

export interface FileContent {
  content: string;
  encoding: string;
  /** Repository path the source came from, when it differs from the request. */
  resolvedPath?: string;
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const { status } = error;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/**
 * Coverage reports record the path their own tool saw. Cobertura and lcov emit
 * repo-relative paths, but istanbul and JaCoCo often emit absolute CI paths
 * such as /home/runner/work/<repo>/<repo>/src/foo.ts. The Contents API only
 * accepts repo-relative paths, so peel a known CI prefix off.
 */
export function toRepoRelativePath(path: string, repo: string): string {
  const cleaned = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!cleaned.startsWith("/")) return cleaned;
  const marker = `/${repo}/`;
  const index = cleaned.lastIndexOf(marker);
  return index === -1
    ? cleaned.replace(/^\/+/, "")
    : cleaned.slice(index + marker.length);
}

function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Coverage reports and repository paths drift apart: a report may drop the
 * source root (`Core/Authentication` for `src/Core/Authentication`) or change
 * the case of a path. One recursive listing per commit is enough to repair
 * every path the viewer opens from that commit.
 */
const blobPathsByCommit = new Map<string, Map<string, string>>();

/** Fewer path segments wins; the shorter path breaks ties deterministically. */
function isShallower(candidate: string, current: string): boolean {
  const candidateSegments = candidate.split("/").length;
  const currentSegments = current.split("/").length;
  if (candidateSegments !== currentSegments) {
    return candidateSegments < currentSegments;
  }
  if (candidate.length !== current.length)
    return candidate.length < current.length;
  return candidate < current;
}

class GitHubService {
  private octokit: Octokit;

  constructor() {
    const token = tokenStorage.get();
    this.octokit = new Octokit({
      auth: token || undefined,
    });
  }

  private updateOctokit() {
    const token = tokenStorage.get();
    this.octokit = new Octokit({
      auth: token || undefined,
    });
  }

  public setToken(token: string) {
    tokenStorage.set(token);
    this.updateOctokit();
  }

  public removeToken() {
    tokenStorage.remove();
    this.updateOctokit();
  }

  public hasToken(): boolean {
    return tokenStorage.exists();
  }

  // Fetch all branches (paginated)
  async getBranches(owner: string, repo: string) {
    try {
      const branches = await this.octokit.paginate(
        this.octokit.rest.repos.listBranches,
        { owner, repo, per_page: 100 },
      );
      return branches;
    } catch (error) {
      console.error("Error fetching branches:", error);
      throw error;
    }
  }

  // Fetch workflow runs for a specific branch
  async getWorkflowRuns(
    owner: string,
    repo: string,
    branch: string,
    page = 1,
    since?: string,
  ) {
    try {
      const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch,
        status: "completed",
        created: since ? `>=${since}` : undefined,
        per_page: WORKFLOW_RUNS_PAGE_SIZE,
        page,
      });
      return data.workflow_runs;
    } catch (error) {
      console.error("Error fetching workflow runs:", error);
      throw error;
    }
  }

  // Fetch artifacts for a specific workflow run
  async getRunArtifacts(owner: string, repo: string, runId: number) {
    try {
      const { data } = await this.octokit.rest.actions.listWorkflowRunArtifacts(
        {
          owner,
          repo,
          run_id: runId,
          per_page: 100,
        },
      );
      return data.artifacts;
    } catch (error) {
      console.error("Error fetching artifacts:", error);
      throw error;
    }
  }

  // Download artifact (returns ArrayBuffer)
  async downloadArtifact(
    owner: string,
    repo: string,
    artifactId: number,
  ): Promise<ArrayBuffer> {
    try {
      const { data } = await this.octokit.rest.actions.downloadArtifact({
        owner,
        repo,
        artifact_id: artifactId,
        archive_format: "zip",
      });
      return data as ArrayBuffer;
    } catch (error) {
      console.error("Error downloading artifact:", error);
      throw error;
    }
  }

  // Fetch one file's text at a specific commit, for the source viewer.
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<FileContent> {
    const relativePath = toRepoRelativePath(path, repo);

    try {
      return await this.readFileAt(owner, repo, relativePath, ref);
    } catch (error) {
      if (errorStatus(error) !== 404) throw this.fileError(error);
    }

    // The report's path is not in the repository as written; the commit's tree
    // knows the real spelling.
    const resolved = await this.resolveBlobPath(owner, repo, ref, relativePath);
    if (!resolved) throw new Error("File not found at this commit");

    try {
      const file = await this.readFileAt(owner, repo, resolved, ref);
      return resolved === relativePath
        ? file
        : { ...file, resolvedPath: resolved };
    } catch (error) {
      throw this.fileError(error);
    }
  }

  /**
   * Fetch the repository root .gitignore at a commit. A missing or unreachable
   * file means no exclusions are applied, so callers can keep rendering every
   * report file.
   */
  public async getGitignore(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: ".gitignore",
        ref,
      });
      if (
        Array.isArray(data) ||
        data.type !== "file" ||
        typeof data.content !== "string" ||
        data.encoding !== "base64"
      ) {
        return null;
      }
      return decodeBase64(data.content);
    } catch (error) {
      // A repository without a .gitignore is expected, not an error.
      if (errorStatus(error) !== 404) {
        console.error("Error fetching .gitignore:", error);
      }
      return null;
    }
  }

  private async readFileAt(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<FileContent> {
    const { data } = await this.octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    if (
      Array.isArray(data) ||
      data.type !== "file" ||
      typeof data.content !== "string" ||
      typeof data.encoding !== "string"
    ) {
      throw new Error(`${path} is not a file at this commit`);
    }
    if (data.encoding !== "base64") {
      throw new Error(`${path} is too large to display`);
    }
    return { content: decodeBase64(data.content), encoding: data.encoding };
  }

  private fileError(error: unknown): Error {
    console.error("Error fetching file content:", error);
    const status = errorStatus(error);
    if (status === 404) return new Error("File not found at this commit");
    if (status === 401 || status === 403) {
      return new Error("Authentication required to view this file");
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Find the repository path for a coverage path. Case-insensitive equality
   * first, then a suffix match, because reports regularly omit a source root.
   */
  private async resolveBlobPath(
    owner: string,
    repo: string,
    ref: string,
    requestedPath: string,
  ): Promise<string | null> {
    const commitKey = `${owner}/${repo}@${ref}`;
    let blobs = blobPathsByCommit.get(commitKey);

    if (!blobs) {
      try {
        const { data } = await this.octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: ref,
          recursive: "1",
        });
        blobs = new Map<string, string>();
        for (const entry of data.tree) {
          if (entry.type === "blob") {
            blobs.set(entry.path.toLowerCase(), entry.path);
          }
        }
        blobPathsByCommit.set(commitKey, blobs);
      } catch (error) {
        console.error("Error fetching repository tree:", error);
        return null;
      }
    }

    const wanted = requestedPath.toLowerCase();
    const exact = blobs.get(wanted);
    if (exact) return exact;

    const suffix = `/${wanted}`;
    let best: string | null = null;
    for (const [candidate, actual] of blobs) {
      if (!candidate.endsWith(suffix)) continue;
      if (best === null || isShallower(actual, best)) best = actual;
    }
    return best;
  }

  // Get repository info (default branch, existence check)
  async getRepoInfo(owner: string, repo: string): Promise<RepoInfo | null> {
    try {
      const { data } = await this.octokit.rest.repos.get({ owner, repo });
      return {
        exists: true,
        defaultBranch: data.default_branch,
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 404
      ) {
        return null;
      }
      throw error;
    }
  }
}

export const githubService = new GitHubService();
