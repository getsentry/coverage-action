import { Octokit } from "@octokit/rest";
import { tokenStorage } from "./tokenStorage";

export const WORKFLOW_RUNS_PAGE_SIZE = 50;

export interface RepoInfo {
  exists: true;
  defaultBranch: string;
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
