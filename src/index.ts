import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as glob from "@actions/glob";
import type { PatchCoverageResults } from "./analyzers/patch-analyzer.js";
import { PatchAnalyzer } from "./analyzers/patch-analyzer.js";
import { ThresholdChecker } from "./analyzers/threshold-checker.js";
import { ConfigLoader } from "./config/config-loader.js";
import { ReportFormatter } from "./formatters/report-formatter.js";
import { JUnitParser } from "./parsers/junit-parser.js";
import {
  type CoverageFormat,
  CoverageParserFactory,
} from "./parsers/parser-factory.js";
import { StatusReporter } from "./reporters/status-check.js";
import type { NormalizedConfig } from "./types/config.js";
import type { CoverageResults } from "./types/coverage.js";
import type { TestResults } from "./types/test-results.js";
import { ArtifactManager } from "./utils/artifact-manager.js";
import { TestResultsComparator } from "./utils/comparison.js";
import { CoverageComparator } from "./utils/coverage-comparison.js";
import { FileFinder } from "./utils/file-finder.js";
import { GitHubClient } from "./utils/github-client.js";

/**
 * Coverage input configuration
 */
interface CoverageConfig {
  files: string[];
  directory: string;
  exclude: string[];
  format: CoverageFormat | "auto";
  disableSearch: boolean;
  failCiIfError: boolean;
  handleNoReportsFound: boolean;
  verbose: boolean;
  flags: string[];
  name: string;
  // Config from .github/coverage.yml
  status?: NormalizedConfig["status"];
  comment: NormalizedConfig["comment"];
  config: NormalizedConfig["config"];
  // Threshold overrides from inputs
  failOnError: boolean;
  targetProject?: number | "auto";
  thresholdProject?: number;
  targetPatch?: number;
  informationalProject?: boolean;
  informationalPatch?: boolean;
}

/**
 * Parse coverage configuration from action inputs and YAML config
 */
async function getCoverageConfig(): Promise<CoverageConfig> {
  // Load YAML config first
  const configLoader = new ConfigLoader();
  const yamlConfig = await configLoader.loadConfig();

  // Get files input (comma-separated)
  const filesInput = core.getInput("files");
  const files = filesInput
    ? filesInput
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

  // Get directory
  const directory = core.getInput("directory") || ".";

  // Get exclude patterns (comma-separated) and merge with YAML ignore
  const excludeInput = core.getInput("exclude");
  const exclude = excludeInput
    ? excludeInput
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
    : [];

  // Merge YAML ignore patterns
  if (yamlConfig.ignore && yamlConfig.ignore.length > 0) {
    exclude.push(...yamlConfig.ignore);
  }

  // Get format
  const formatInput = core.getInput("coverage-format") || "auto";
  const format = formatInput as CoverageFormat | "auto";

  // Get boolean flags
  const disableSearch = core.getBooleanInput("disable-search") === true;
  const failCiIfError = core.getBooleanInput("fail-ci-if-error") === true;
  const handleNoReportsFound =
    core.getBooleanInput("handle-no-reports-found") === true;
  const verbose = core.getBooleanInput("verbose") === true;

  // Get flags (comma-separated)
  const flagsInput = core.getInput("flags");
  const flags = flagsInput
    ? flagsInput
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

  // Get name
  const name = core.getInput("name") || "";

  // Get threshold inputs
  const failOnError = core.getBooleanInput("fail-on-error") === true;
  const targetProjectInput = core.getInput("target-project");
  const thresholdProjectInput = core.getInput("threshold-project");
  const targetPatchInput = core.getInput("target-patch");

  // Parse threshold values
  let targetProject: number | "auto" | undefined;
  if (targetProjectInput) {
    targetProject =
      targetProjectInput === "auto" ? "auto" : Number(targetProjectInput);
  }

  const thresholdProject = thresholdProjectInput
    ? Number(thresholdProjectInput)
    : undefined;
  const targetPatch = targetPatchInput ? Number(targetPatchInput) : undefined;

  // Parse informational inputs (true/false → override, unset → defer to YAML config)
  const informationalProjectInput = core.getInput("informational-project");
  const informationalProject =
    informationalProjectInput === "true"
      ? true
      : informationalProjectInput === "false"
        ? false
        : undefined;
  const informationalPatchInput = core.getInput("informational-patch");
  const informationalPatch =
    informationalPatchInput === "true"
      ? true
      : informationalPatchInput === "false"
        ? false
        : undefined;

  return {
    files,
    directory,
    exclude,
    format,
    disableSearch,
    failCiIfError,
    handleNoReportsFound,
    verbose,
    flags,
    name,
    status: yamlConfig.status,
    comment: yamlConfig.comment,
    config: yamlConfig.config,
    failOnError,
    targetProject,
    thresholdProject,
    targetPatch,
    informationalProject,
    informationalPatch,
  };
}

/**
 * Log message if verbose mode is enabled
 */
function verboseLog(message: string, verbose: boolean): void {
  if (verbose) {
    core.info(`[verbose] ${message}`);
  }
}

async function run() {
  try {
    // Get inputs
    const junitPatternInput =
      core.getInput("junit-xml-pattern") || "**/*.junit.xml";
    const token = core.getInput("token");
    const baseBranchInput = core.getInput("base-branch");
    const enableTests = core.getBooleanInput("enable-tests") !== false;
    const enableCoverage = core.getBooleanInput("enable-coverage") !== false;
    const postPrComment = core.getBooleanInput("post-pr-comment") === true;
    const commentKey = core.getInput("comment-key") || undefined;
    const title = core.getInput("title") || undefined;

    // Get coverage config
    const coverageConfig = await getCoverageConfig();

    if (!token) {
      throw new Error(
        "GitHub token is required. Please provide 'token' input.",
      );
    }

    if (coverageConfig.verbose) {
      core.info("🔍 Verbose mode enabled");
      core.info(`Coverage config: ${JSON.stringify(coverageConfig, null, 2)}`);
    }

    // Initialize GitHub client
    const githubClient = new GitHubClient(token);
    const contextInfo = githubClient.getContextInfo();
    core.info(
      `Context: ${contextInfo.eventName} in ${contextInfo.owner}/${contextInfo.repo}`,
    );

    // Determine base branch: use explicit input, or auto-detect the repo's default branch
    let baseBranch: string;
    if (baseBranchInput) {
      baseBranch = baseBranchInput;
    } else {
      baseBranch = await githubClient.getDefaultBranch();
      core.info(`Auto-detected default branch: ${baseBranch}`);
    }

    core.info(`Base branch for comparison: ${baseBranch}`);

    // Log context info
    core.info(`Post PR comment: ${postPrComment}`);

    // Initialize artifact manager
    const artifactManager = new ArtifactManager(token);
    const currentBranch = ArtifactManager.getCurrentBranch();
    core.info(`Current branch: ${currentBranch}`);

    // Process test results if enabled
    let aggregatedTestResults = null;
    if (enableTests) {
      const junitPattern = path.join(
        coverageConfig.directory,
        junitPatternInput,
      );
      aggregatedTestResults = await processTestResults(
        junitPattern,
        artifactManager,
        currentBranch,
        baseBranch,
        coverageConfig.name || undefined,
      );
    }

    // Process coverage if enabled
    let aggregatedCoverageResults = null;
    let patchCoverage: PatchCoverageResults | null = null;
    let coverageChecksFailed = false;
    const patchTargetForFormatter =
      coverageConfig.targetPatch ?? coverageConfig.status?.patch.target ?? 80;

    if (enableCoverage) {
      aggregatedCoverageResults = await processCoverage(
        coverageConfig,
        artifactManager,
        currentBranch,
        baseBranch,
        githubClient.getPullRequestCommitRefs(),
      );

      // Run threshold checks if coverage results are available
      if (aggregatedCoverageResults) {
        // Initialize status reporter
        const statusReporter = new StatusReporter(token);

        // Calculate patch coverage if in PR context
        if (githubClient.isPullRequest()) {
          try {
            core.info("🔍 Calculating patch coverage...");
            const diffContent = await githubClient.getPrDiff();
            patchCoverage = PatchAnalyzer.analyzePatchCoverage(
              diffContent,
              aggregatedCoverageResults,
            );

            // Set patch coverage output
            core.setOutput(
              "patch-coverage",
              patchCoverage.percentage.toString(),
            );

            // Enrich aggregated results with patch coverage for the formatter
            aggregatedCoverageResults.patchCoverageRate =
              patchCoverage.percentage;
          } catch (error) {
            core.warning(`Failed to calculate patch coverage: ${error}`);
          }
        }

        // Determine project config (inputs override YAML)
        const projectConfig = {
          target:
            coverageConfig.targetProject ??
            coverageConfig.status?.project.target ??
            "auto",
          threshold:
            coverageConfig.thresholdProject ??
            coverageConfig.status?.project.threshold ??
            null,
          informational:
            coverageConfig.informationalProject ??
            coverageConfig.status?.project.informational ??
            false,
        };

        // Check project status
        core.info("🔍 Checking project coverage thresholds...");
        const projectStatus = ThresholdChecker.checkProjectStatus(
          aggregatedCoverageResults,
          projectConfig,
        );

        // Report project status
        if (coverageConfig.status?.project.enabled !== false) {
          const reportedProjectStatus =
            projectConfig.informational && projectStatus.status === "failure"
              ? "success"
              : projectStatus.status;
          const reportedProjectDesc =
            projectConfig.informational && projectStatus.status === "failure"
              ? `(informational) ${projectStatus.description}`
              : projectStatus.description;
          await statusReporter.reportStatus(
            "codecov/project",
            reportedProjectStatus,
            reportedProjectDesc,
          );
        }

        if (projectStatus.status === "failure") {
          if (projectStatus.informational) {
            core.info(
              `ℹ️ Project coverage check failed (informational): ${projectStatus.description}`,
            );
          } else {
            core.warning(
              `❌ Project coverage check failed: ${projectStatus.description}`,
            );
            coverageChecksFailed = true;
          }
        } else {
          core.info(
            `✅ Project coverage check passed: ${projectStatus.description}`,
          );
        }

        // Check patch status
        const patchConfig = {
          target: patchTargetForFormatter,
          threshold: coverageConfig.status?.patch.threshold ?? null,
          informational:
            coverageConfig.informationalPatch ??
            coverageConfig.status?.patch.informational ??
            false,
        };

        const patchStatus = ThresholdChecker.checkPatchStatus(
          patchCoverage,
          patchConfig,
        );

        // Report patch status
        if (coverageConfig.status?.patch.enabled !== false) {
          const reportedPatchStatus =
            patchConfig.informational && patchStatus.status === "failure"
              ? "success"
              : patchStatus.status;
          const reportedPatchDesc =
            patchConfig.informational && patchStatus.status === "failure"
              ? `(informational) ${patchStatus.description}`
              : patchStatus.description;
          await statusReporter.reportStatus(
            "codecov/patch",
            reportedPatchStatus,
            reportedPatchDesc,
          );
        }

        // Check if patch status should fail the build
        if (patchStatus.status === "failure") {
          if (patchStatus.informational) {
            core.info(
              `ℹ️ Patch coverage check failed (informational): ${patchStatus.description}`,
            );
          } else {
            core.warning(
              `❌ Patch coverage check failed: ${patchStatus.description}`,
            );
            coverageChecksFailed = true;
          }
        } else {
          core.info(
            `✅ Patch coverage check passed: ${patchStatus.description}`,
          );
        }
      }
    }

    // Generate report using the formatter
    const formatter = new ReportFormatter();
    // Fall back to "all" when there is no PR context (push events), since
    // there is no diff to filter by. This applies to pushes on any branch
    // (main, feature branches, etc.), not just the base branch.
    const effectiveFilesMode =
      coverageConfig.config.files !== "none" && !githubClient.isPullRequest()
        ? "all"
        : coverageConfig.config.files;

    // Build GitHub context for linking files to PR diff view
    const prNumber = githubClient.getPullRequestNumber();
    const githubContext = prNumber
      ? {
          owner: contextInfo.owner,
          repo: contextInfo.repo,
          prNumber,
          serverUrl: process.env.GITHUB_SERVER_URL || "https://github.com",
        }
      : undefined;

    const reportOptions: import("./formatters/report-formatter.js").ReportFormatOptions =
      {
        filesMode: effectiveFilesMode,
        changedFiles:
          effectiveFilesMode === "changed"
            ? patchCoverage?.changedFiles || []
            : undefined,
        patchTarget: patchTargetForFormatter,
        patchFileBreakdown: patchCoverage?.fileBreakdown,
        githubContext,
        title,
      };

    const summaryReportBody = formatter.formatReport(
      aggregatedTestResults || undefined,
      aggregatedCoverageResults || undefined,
      reportOptions,
    );

    // Write Job Summary (always)
    core.info("📝 Writing Job Summary...");
    await core.summary.addRaw(summaryReportBody).write();

    // Optionally post PR comment if enabled (via config file or action input) and in PR context
    const shouldPostPrComment = coverageConfig.comment.enabled || postPrComment;
    if (shouldPostPrComment && githubClient.isPullRequest()) {
      const prCommentBody = formatter.formatReport(
        aggregatedTestResults || undefined,
        aggregatedCoverageResults || undefined,
        reportOptions,
      );
      core.info("📝 Posting results to PR comment...");
      await githubClient.postOrUpdateComment(prCommentBody, commentKey);
    }

    core.info("✅ Coverage Action completed successfully!");

    // Fail if thresholds met and fail-on-error is true
    if (coverageChecksFailed && coverageConfig.failOnError) {
      throw new Error("Coverage thresholds were not met.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    core.setFailed(`Action failed: ${message}`);
  }
}

/**
 * Process test results
 */
async function processTestResults(
  junitPattern: string,
  artifactManager: ArtifactManager,
  currentBranch: string,
  baseBranch: string,
  name?: string,
) {
  core.info("📊 Processing test results...");

  // Find JUnit XML files
  const fileFinder = new FileFinder();
  const files = await fileFinder.findFiles(junitPattern);

  if (files.length === 0) {
    core.warning(`No JUnit XML files found matching pattern: ${junitPattern}`);
    core.warning(
      "Please ensure your test framework is generating JUnit XML output.",
    );
    core.setOutput("total-tests", "0");
    core.setOutput("passed-tests", "0");
    core.setOutput("failed-tests", "0");
    core.setOutput("test-pass-rate", "0");
    core.setOutput("tests-added", "0");
    core.setOutput("tests-removed", "0");
    core.setOutput("tests-fixed", "0");
    core.setOutput("tests-broken", "0");
    return null;
  }

  // Validate files
  const validFiles = fileFinder.validateFiles(files);
  if (validFiles.length === 0) {
    throw new Error("No valid JUnit XML files found");
  }

  core.info(`Processing ${validFiles.length} JUnit XML file(s)`);

  // Parse all JUnit XML files
  const parser = new JUnitParser();
  const allResults: TestResults[] = [];

  for (const file of validFiles) {
    try {
      core.info(`Parsing: ${file}`);
      const result = parser.parseFile(file);
      allResults.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      core.error(`Failed to parse ${file}: ${message}`);
      // Continue with other files
    }
  }

  if (allResults.length === 0) {
    throw new Error("Failed to parse any JUnit XML files");
  }

  // Aggregate results
  const aggregatedResults = JUnitParser.aggregateResults(allResults);

  core.info("📊 Test Results Summary:");
  core.info(`  Total Tests: ${aggregatedResults.totalTests}`);
  core.info(`  Passed: ${aggregatedResults.passedTests}`);
  core.info(`  Failed: ${aggregatedResults.failedTests}`);
  core.info(`  Skipped: ${aggregatedResults.skippedTests}`);
  core.info(`  Pass Rate: ${aggregatedResults.passRate}%`);

  // Upload current results as artifact
  await artifactManager.uploadResults(aggregatedResults, currentBranch, name);

  // Download and compare with base branch results
  const baseResults = await artifactManager.downloadBaseResults(
    baseBranch,
    name,
  );
  if (baseResults) {
    core.info("🔍 Comparing with base branch test results...");
    const comparison = TestResultsComparator.compareResults(
      baseResults,
      aggregatedResults,
    );
    aggregatedResults.comparison = comparison;

    // Log comparison summary
    core.info("📈 Test Comparison Summary:");
    core.info(
      `  Total Tests: ${comparison.deltaTotal >= 0 ? "+" : ""}${
        comparison.deltaTotal
      }`,
    );
    core.info(
      `  Passed Tests: ${comparison.deltaPassed >= 0 ? "+" : ""}${
        comparison.deltaPassed
      }`,
    );
    core.info(
      `  Failed Tests: ${comparison.deltaFailed >= 0 ? "+" : ""}${
        comparison.deltaFailed
      }`,
    );
    core.info(`  Tests Added: ${comparison.testsAdded.length}`);
    core.info(`  Tests Removed: ${comparison.testsRemoved.length}`);
    core.info(`  Tests Fixed: ${comparison.testsFixed.length}`);
    core.info(`  Tests Broken: ${comparison.testsBroken.length}`);

    // Set comparison outputs
    core.setOutput("tests-added", comparison.testsAdded.length.toString());
    core.setOutput("tests-removed", comparison.testsRemoved.length.toString());
    core.setOutput("tests-fixed", comparison.testsFixed.length.toString());
    core.setOutput("tests-broken", comparison.testsBroken.length.toString());
  } else {
    core.info("ℹ️ No base test results available for comparison");
    // Set comparison outputs to 0
    core.setOutput("tests-added", "0");
    core.setOutput("tests-removed", "0");
    core.setOutput("tests-fixed", "0");
    core.setOutput("tests-broken", "0");
  }

  // Set outputs
  core.setOutput("total-tests", aggregatedResults.totalTests.toString());
  core.setOutput("passed-tests", aggregatedResults.passedTests.toString());
  core.setOutput("failed-tests", aggregatedResults.failedTests.toString());
  core.setOutput("test-pass-rate", aggregatedResults.passRate.toString());

  return aggregatedResults;
}

/**
 * Find coverage files based on configuration
 */
async function findCoverageFiles(config: CoverageConfig): Promise<string[]> {
  const { files, directory, exclude, disableSearch, verbose } = config;

  // If explicit files are provided
  if (files.length > 0) {
    verboseLog(`Using explicit files: ${files.join(", ")}`, verbose);
    return files;
  }

  // If search is disabled but no files provided
  if (disableSearch) {
    return [];
  }

  // Auto-discover coverage files
  verboseLog(
    `Searching for coverage files in directory: ${directory}`,
    verbose,
  );

  // Default patterns for common coverage files
  const defaultPatterns = [
    "**/clover.xml",
    "**/cobertura.xml",
    "**/coverage.cobertura.xml",
    "**/coverage.xml",
    "**/jacoco.xml",
    "**/lcov.info",
    "**/*.lcov",
    "**/coverage-final.json",
    "**/coverage.out",
    "**/cover.out",
    "**/codecov.json",
  ];

  // Check for legacy coverage-xml-pattern input
  const legacyPattern = core.getInput("coverage-xml-pattern");
  if (legacyPattern) {
    core.warning(
      "The 'coverage-xml-pattern' input is deprecated. Please use 'files' or 'directory' instead.",
    );
    verboseLog(`Using legacy coverage-xml-pattern: ${legacyPattern}`, verbose);
    const globber = await glob.create(legacyPattern, {
      followSymbolicLinks: false,
    });
    return globber.glob();
  }

  // Build glob patterns
  const patterns = defaultPatterns.map((p) => path.join(directory, p));

  // Add exclude patterns
  const excludePatterns = exclude.map((e) => `!${path.join(directory, e)}`);
  const allPatterns = [...patterns, ...excludePatterns];

  verboseLog(`Search patterns: ${allPatterns.join(", ")}`, verbose);

  const globber = await glob.create(allPatterns.join("\n"), {
    followSymbolicLinks: false,
  });

  const foundFiles = await globber.glob();
  verboseLog(`Found ${foundFiles.length} coverage file(s)`, verbose);

  return foundFiles;
}

/**
 * Process coverage results with multi-format support
 */
async function processCoverage(
  config: CoverageConfig,
  artifactManager: ArtifactManager,
  currentBranch: string,
  baseBranch: string,
  pullRequestCommitRefs: {
    baseCommit?: string;
    headCommit?: string;
  },
) {
  const { format, failCiIfError, handleNoReportsFound, verbose, flags, name } =
    config;

  core.info("🎯 Processing coverage results...");
  if (name) {
    core.info(`Coverage upload name: ${name}`);
    core.setOutput("coverage-name", name);
  }
  if (flags.length > 0) {
    const flagsValue = flags.join(",");
    core.info(`Coverage flags: ${flags.join(", ")}`);
    core.setOutput("coverage-flags", flagsValue);
  }

  // Find coverage files
  const files = await findCoverageFiles(config);

  if (files.length === 0) {
    const message = "No coverage files found";
    if (failCiIfError && !handleNoReportsFound) {
      throw new Error(message);
    }
    core.warning(message);
    if (!handleNoReportsFound) {
      core.warning(
        `Supported formats: ${CoverageParserFactory.getSupportedFormats().join(
          ", ",
        )}`,
      );
    }
    // Set default outputs for no reports case
    core.setOutput("line-coverage", "0");
    core.setOutput("branch-coverage", "0");
    core.setOutput("coverage-change", "0");
    core.setOutput("coverage-format", "none");
    return null;
  }

  // Validate files exist
  const fileFinder = new FileFinder();
  const validFiles = fileFinder.validateFiles(files);
  if (validFiles.length === 0) {
    const message = "No valid coverage files found";
    if (failCiIfError) {
      throw new Error(message);
    }
    core.warning(message);
    return null;
  }

  core.info(`Processing ${validFiles.length} coverage file(s)`);
  core.info(`Format: ${format === "auto" ? "auto-detect" : format}`);

  // Parse all coverage files
  const allResults: CoverageResults[] = [];
  let detectedFormat: CoverageFormat | null = null;

  for (const file of validFiles) {
    try {
      verboseLog(`Parsing coverage: ${file}`, verbose);

      // Read file once and use for both parsing and format detection
      const content = fs.readFileSync(file, "utf-8");

      // Determine the format to use and log
      let fileFormat: CoverageFormat | "auto" = format;
      if (format === "auto") {
        const parser = CoverageParserFactory.detectParser(content, file);
        if (parser) {
          fileFormat = parser.format;
          if (detectedFormat === null) {
            detectedFormat = parser.format;
          }
        }
      } else {
        // When explicit format is provided, use it for tracking
        if (detectedFormat === null) {
          detectedFormat = format;
        }
      }

      const result = await CoverageParserFactory.parseContent(
        content,
        file,
        format,
      );
      allResults.push(result);

      core.info(`✓ Parsed ${file} (${fileFormat})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (failCiIfError) {
        throw new Error(`Failed to parse ${file}: ${message}`);
      }
      core.error(`Failed to parse ${file}: ${message}`);
      // Continue with other files
    }
  }

  if (allResults.length === 0) {
    const message = "Failed to parse any coverage files";
    if (failCiIfError) {
      throw new Error(message);
    }
    core.warning(message);
    return null;
  }

  // Aggregate results
  const aggregatedResults = CoverageParserFactory.aggregateResults(allResults);

  // Add flags and name metadata to the results
  if (flags.length > 0) {
    aggregatedResults.flags = flags;
  }
  if (name) {
    aggregatedResults.name = name;
  }

  core.info("🎯 Coverage Summary:");
  core.info(`  Format: ${detectedFormat ?? "unknown"}`);
  if (flags.length > 0) {
    core.info(`  Flags: ${flags.join(", ")}`);
  }
  if (name) {
    core.info(`  Name: ${name}`);
  }
  core.info(`  Line Coverage: ${aggregatedResults.lineRate}%`);
  core.info(`  Branch Coverage: ${aggregatedResults.branchRate}%`);
  core.info(
    `  Statements: ${aggregatedResults.coveredStatements}/${aggregatedResults.totalStatements}`,
  );
  core.info(
    `  Conditionals: ${aggregatedResults.coveredConditionals}/${aggregatedResults.totalConditionals}`,
  );
  core.info(
    `  Methods: ${aggregatedResults.coveredMethods}/${aggregatedResults.totalMethods}`,
  );

  // Upload current coverage as artifact (with flags/name for separate storage)
  await artifactManager.uploadCoverageResults(
    aggregatedResults,
    currentBranch,
    flags.length > 0 ? flags : undefined,
    name || undefined,
  );

  // Download and compare with base branch coverage (flag/name-aware)
  const baseCoverage = await artifactManager.downloadBaseCoverageResults(
    baseBranch,
    flags.length > 0 ? flags : undefined,
    name || undefined,
  );
  if (baseCoverage) {
    core.info("🔍 Comparing with base branch coverage...");
    const comparison = CoverageComparator.compareResults(
      baseCoverage,
      aggregatedResults,
      {
        baseBranch,
        ...pullRequestCommitRefs,
      },
    );
    aggregatedResults.comparison = comparison;

    // Log comparison summary
    core.info("📈 Coverage Comparison Summary:");
    core.info(
      `  Line Coverage: ${comparison.deltaLineRate >= 0 ? "+" : ""}${
        comparison.deltaLineRate
      }%`,
    );
    core.info(
      `  Branch Coverage: ${comparison.deltaBranchRate >= 0 ? "+" : ""}${
        comparison.deltaBranchRate
      }%`,
    );
    core.info(`  Files Added: ${comparison.filesAdded.length}`);
    core.info(`  Files Removed: ${comparison.filesRemoved.length}`);
    core.info(`  Files Changed: ${comparison.filesChanged.length}`);
    core.info(
      `  Overall Improvement: ${comparison.improvement ? "Yes" : "No"}`,
    );

    // Set comparison outputs
    core.setOutput("coverage-change", comparison.deltaLineRate.toString());
    core.setOutput(
      "branch-coverage-change",
      comparison.deltaBranchRate.toString(),
    );
    core.setOutput("coverage-improved", comparison.improvement.toString());
  } else {
    core.info("ℹ️ No base coverage available for comparison");
    core.setOutput("coverage-change", "0");
    core.setOutput("branch-coverage-change", "0");
    core.setOutput("coverage-improved", "false");
  }

  // Set outputs
  core.setOutput("line-coverage", aggregatedResults.lineRate.toString());
  core.setOutput("branch-coverage", aggregatedResults.branchRate.toString());
  core.setOutput("coverage-format", detectedFormat ?? "unknown");

  return aggregatedResults;
}

run();
