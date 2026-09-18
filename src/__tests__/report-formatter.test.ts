import { describe, expect, it } from "vitest";
import type { PatchFileCoverage } from "../analyzers/patch-analyzer.js";
import { ReportFormatter } from "../formatters/report-formatter.js";
import type { AggregatedCoverageResults } from "../types/coverage.js";
import type { AggregatedTestResults } from "../types/test-results.js";

describe("ReportFormatter", () => {
  const formatter = new ReportFormatter();

  it("should format results with all passing tests", () => {
    const results: AggregatedTestResults = {
      totalTests: 10,
      passedTests: 10,
      failedTests: 0,
      skippedTests: 0,
      totalTime: 5.5,
      passRate: 100,
      failedTestCases: [],
    };

    const comment = formatter.formatReport(results);

    expect(comment).toContain("✅ **10 passed**");
    expect(comment).toContain("**Total: 10**");
    expect(comment).toContain("**Pass Rate: 100%**");
    expect(comment).toContain("All tests are passing successfully.");
    expect(comment).toContain("5.50s");
    expect(comment).toContain(
      "[Codecov Action](https://github.com/getsentry/coverage-action)",
    );
  });

  it("should format results with failed tests", () => {
    const results: AggregatedTestResults = {
      totalTests: 5,
      passedTests: 3,
      failedTests: 2,
      skippedTests: 0,
      totalTime: 2.5,
      passRate: 60,
      failedTestCases: [
        {
          suiteName: "Test Suite 1",
          testCase: {
            classname: "test/example.test.ts",
            name: "should fail test 1",
            time: 0.5,
            failure: {
              message: "Expected 5 to equal 6",
              type: "AssertionError",
              content: "Error: Expected 5 to equal 6\n    at Object.toBe",
            },
          },
        },
        {
          suiteName: "Test Suite 2",
          testCase: {
            classname: "test/another.test.ts",
            name: "should fail test 2",
            time: 0.3,
            failure: {
              message: "Timeout exceeded",
            },
          },
        },
      ],
    };

    const comment = formatter.formatReport(results);

    expect(comment).toContain("✅ **3 passed**");
    expect(comment).toContain("❌ **2 failed**");
    expect(comment).toContain("**Pass Rate: 60%**");
    expect(comment).toContain("### ❌ Failed Tests");
    expect(comment).toContain("`should fail test 1`");
    expect(comment).toContain("**File:** `test/example.test.ts`");
    expect(comment).toContain("**Error:** Expected 5 to equal 6");
    expect(comment).toContain("<details>");
    expect(comment).toContain("<summary>Stack Trace</summary>");
    expect(comment).toContain("at Object.toBe");
    expect(comment).toContain("`should fail test 2`");
    expect(comment).toContain("**Error:** Timeout exceeded");
  });

  it("should format results with skipped tests", () => {
    const results: AggregatedTestResults = {
      totalTests: 8,
      passedTests: 5,
      failedTests: 1,
      skippedTests: 2,
      totalTime: 3.2,
      passRate: 62.5,
      failedTestCases: [
        {
          suiteName: "Test Suite",
          testCase: {
            classname: "test/example.test.ts",
            name: "failing test",
            time: 0.5,
            failure: {
              message: "Test failed",
            },
          },
        },
      ],
    };

    const comment = formatter.formatReport(results);

    expect(comment).toContain("✅ **5 passed**");
    expect(comment).toContain("❌ **1 failed**");
    expect(comment).toContain("⏭️ **2 skipped**");
    expect(comment).toContain("**Total: 8**");
    expect(comment).toContain("**Pass Rate: 62.5%**");
  });

  it("should format execution time correctly for different durations", () => {
    // Less than 1 second (milliseconds)
    let results: AggregatedTestResults = {
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
      skippedTests: 0,
      totalTime: 0.234,
      passRate: 100,
      failedTestCases: [],
    };

    let comment = formatter.formatReport(results);
    expect(comment).toContain("234ms");

    // Seconds
    results = {
      ...results,
      totalTime: 5.67,
    };
    comment = formatter.formatReport(results);
    expect(comment).toContain("5.67s");

    // Minutes and seconds
    results = {
      ...results,
      totalTime: 125.4,
    };
    comment = formatter.formatReport(results);
    expect(comment).toContain("2m 5s");
  });

  it("reports unchanged test counts without claiming test definitions are unchanged", () => {
    const comment = formatter.formatReport({
      totalTests: 10,
      passedTests: 10,
      failedTests: 0,
      skippedTests: 0,
      totalTime: 1,
      passRate: 100,
      failedTestCases: [],
      comparison: {
        testsAdded: [],
        testsRemoved: [],
        testsBroken: [],
        testsFixed: [],
        deltaTotal: 0,
        deltaPassed: 0,
        deltaFailed: 0,
        deltaSkipped: 0,
      },
    });

    expect(comment).toContain("✨ Test counts unchanged from base.");
    expect(comment).not.toContain("No test changes detected");
  });

  it("should add identifier to comment", () => {
    const comment = "Test comment";
    const withIdentifier = formatter.addIdentifier(comment);

    expect(withIdentifier).toContain(ReportFormatter.getCommentIdentifier());
    expect(withIdentifier).toContain("Test comment");
  });

  it("should return default marker when no comment key is provided", () => {
    expect(ReportFormatter.getCommentIdentifier()).toBe(
      "<!-- codecov-action-results -->",
    );
  });

  it("should return namespaced marker when comment key is provided", () => {
    expect(ReportFormatter.getCommentIdentifier("frontend")).toBe(
      "<!-- codecov-action-results:frontend -->",
    );
    expect(ReportFormatter.getCommentIdentifier("backend")).toBe(
      "<!-- codecov-action-results:backend -->",
    );
  });

  it("should handle tests with no stack trace", () => {
    const results: AggregatedTestResults = {
      totalTests: 1,
      passedTests: 0,
      failedTests: 1,
      skippedTests: 0,
      totalTime: 0.5,
      passRate: 0,
      failedTestCases: [
        {
          suiteName: "Test Suite",
          testCase: {
            classname: "test/example.test.ts",
            name: "test without stack trace",
            time: 0.5,
            failure: {
              message: "Simple failure",
            },
          },
        },
      ],
    };

    const comment = formatter.formatReport(results);

    expect(comment).toContain("**Error:** Simple failure");
    // Should not have details section for stack trace
    expect(comment.split("<details>").length - 1).toBe(0);
  });

  describe("Coverage Section", () => {
    const coverageWithMissingFiles: AggregatedCoverageResults = {
      totalStatements: 120,
      coveredStatements: 100,
      totalConditionals: 12,
      coveredConditionals: 10,
      totalMethods: 6,
      coveredMethods: 5,
      lineRate: 83.33,
      branchRate: 83.33,
      totalMisses: 20,
      patchCoverageRate: 90,
      files: [
        {
          name: "changed-file.ts",
          path: "src/changed-file.ts",
          statements: 10,
          coveredStatements: 8,
          conditionals: 2,
          coveredConditionals: 1,
          methods: 1,
          coveredMethods: 1,
          lineRate: 80,
          branchRate: 50,
          lines: [],
          missingLines: [10, 11],
        },
        {
          name: "unchanged-file.ts",
          path: "src/unchanged-file.ts",
          statements: 8,
          coveredStatements: 7,
          conditionals: 2,
          coveredConditionals: 2,
          methods: 1,
          coveredMethods: 1,
          lineRate: 87.5,
          branchRate: 100,
          lines: [],
          missingLines: [25],
        },
        {
          name: "dot-prefixed.ts",
          path: "./src/dot-prefixed.ts",
          statements: 6,
          coveredStatements: 5,
          conditionals: 2,
          coveredConditionals: 2,
          methods: 1,
          coveredMethods: 1,
          lineRate: 83.33,
          branchRate: 100,
          lines: [],
          partialLines: [40],
        },
      ],
    };

    it("should show checkmark when patch coverage meets configured target", () => {
      const coverageResults: AggregatedCoverageResults = {
        totalStatements: 1000,
        coveredStatements: 775,
        totalConditionals: 100,
        coveredConditionals: 77,
        totalMethods: 50,
        coveredMethods: 38,
        lineRate: 77.56,
        branchRate: 77.56,
        files: [],
        patchCoverageRate: 77.56,
        totalMisses: 1348,
      };

      const comment = formatter.formatReport(undefined, coverageResults, {
        patchTarget: 70,
      });

      // Should show checkmark because patch coverage is >= configured target (70%)
      expect(comment).toContain(
        ":white_check_mark: Patch coverage is **77.56%** (no changed executable lines found; target 70%).",
      );
      expect(comment).not.toContain("Project has **1348** uncovered lines.");
    });

    it("should show resolved pull request commit references", () => {
      const comment = formatter.formatReport(undefined, {
        ...coverageWithMissingFiles,
        comparison: {
          filesAdded: [],
          filesRemoved: [],
          filesChanged: [],
          deltaLineRate: 0,
          deltaBranchRate: 0,
          deltaTotalStatements: 0,
          deltaCoveredStatements: 0,
          deltaTotalConditionals: 0,
          deltaCoveredConditionals: 0,
          deltaTotalMethods: 0,
          deltaCoveredMethods: 0,
          improvement: false,
          baseBranch: "main",
          baseCommit: "0123456789abcdef",
          headCommit: "abcdef0123456789",
        },
      });

      expect(comment).toContain(
        "unchanged from base (`0123456`) to head (`abcdef0`)",
      );
    });

    it("labels the detailed coverage diff with the pull request number", () => {
      const comment = formatter.formatReport(
        undefined,
        {
          ...coverageWithMissingFiles,
          comparison: {
            filesAdded: [],
            filesRemoved: [],
            filesChanged: [],
            deltaLineRate: 0,
            deltaBranchRate: 0,
            deltaTotalStatements: 0,
            deltaCoveredStatements: 0,
            deltaTotalConditionals: 0,
            deltaCoveredConditionals: 0,
            deltaTotalMethods: 0,
            deltaCoveredMethods: 0,
            improvement: false,
          },
        },
        {
          githubContext: {
            owner: "getsentry",
            repo: "coverage-action",
            prNumber: 42,
            serverUrl: "https://github.com",
          },
        },
      );

      expect(comment).toContain("#42");
      expect(comment).not.toContain("#PR");
    });

    it("formats coverage deltas with two decimal places", () => {
      const comment = formatter.formatReport(undefined, {
        ...coverageWithMissingFiles,
        lineRate: 65.63,
        comparison: {
          filesAdded: [],
          filesRemoved: [],
          filesChanged: [],
          deltaLineRate: 1.1,
          deltaBranchRate: 0,
          deltaTotalStatements: 0,
          deltaCoveredStatements: 0,
          deltaTotalConditionals: 0,
          deltaCoveredConditionals: 0,
          deltaTotalMethods: 0,
          deltaCoveredMethods: 0,
          improvement: true,
        },
      });

      expect(comment).toContain("+1.10%");
    });

    it("should show X when patch coverage is below configured target", () => {
      const coverageResults: AggregatedCoverageResults = {
        totalStatements: 1000,
        coveredStatements: 775,
        totalConditionals: 100,
        coveredConditionals: 77,
        totalMethods: 50,
        coveredMethods: 38,
        lineRate: 77.56,
        branchRate: 77.56,
        files: [],
        patchCoverageRate: 77.56,
        totalMisses: 500,
      };

      const comment = formatter.formatReport(undefined, coverageResults, {
        patchTarget: 80,
      });

      // Should show X because patch coverage is below configured target (80%)
      expect(comment).toContain(
        ":x: Patch coverage is **77.56%** (no changed executable lines found; target 80%).",
      );
      expect(comment).not.toContain("Project has **500** uncovered lines.");
    });

    it("should show checkmark with no project misses message when totalMisses is 0", () => {
      const coverageResults: AggregatedCoverageResults = {
        totalStatements: 100,
        coveredStatements: 100,
        totalConditionals: 10,
        coveredConditionals: 10,
        totalMethods: 5,
        coveredMethods: 5,
        lineRate: 100,
        branchRate: 100,
        files: [],
        patchCoverageRate: 100,
        totalMisses: 0,
      };

      const comment = formatter.formatReport(undefined, coverageResults);

      // Should show checkmark
      expect(comment).toContain(
        ":white_check_mark: Patch coverage is **100.00%** (no changed executable lines found; target 80%).",
      );
      // Should NOT mention project uncovered lines
      expect(comment).not.toContain("uncovered lines");
    });

    it("should report patch coverage as unavailable when it was not calculated", () => {
      const coverageResults: AggregatedCoverageResults = {
        totalStatements: 1000,
        coveredStatements: 850,
        totalConditionals: 100,
        coveredConditionals: 85,
        totalMethods: 50,
        coveredMethods: 42,
        lineRate: 85,
        branchRate: 85,
        files: [],
        // patchCoverageRate is undefined
        totalMisses: 150,
      };

      const comment = formatter.formatReport(undefined, coverageResults);

      expect(comment).toContain(
        ":information_source: Patch coverage was not calculated for this run.",
      );
    });

    it("should show all files with missing lines when filesMode is all", () => {
      const comment = formatter.formatReport(
        undefined,
        coverageWithMissingFiles,
        {
          filesMode: "all",
        },
      );

      expect(comment).toContain("Files with missing lines (3)");
      // Full paths should be shown (not just filenames)
      expect(comment).toContain("`src/changed-file.ts`");
      expect(comment).toContain("`src/unchanged-file.ts`");
      expect(comment).toContain("`src/dot-prefixed.ts`");
    });

    it("should only show changed files when filesMode is changed", () => {
      const comment = formatter.formatReport(
        undefined,
        coverageWithMissingFiles,
        {
          filesMode: "changed",
          changedFiles: ["src/changed-file.ts", "/src/dot-prefixed.ts"],
        },
      );

      expect(comment).toContain("Files with missing lines (2)");
      expect(comment).toContain("src/changed-file.ts");
      expect(comment).toContain("src/dot-prefixed.ts");
      expect(comment).not.toContain("unchanged-file.ts");
    });

    it("should match absolute coverage paths when filesMode is changed", () => {
      const coverageWithAbsolutePath: AggregatedCoverageResults = {
        ...coverageWithMissingFiles,
        files: [
          {
            ...coverageWithMissingFiles.files[0],
            path: "/home/runner/work/repo/repo/src/changed-file.ts",
          },
          coverageWithMissingFiles.files[1],
        ],
      };

      const comment = formatter.formatReport(
        undefined,
        coverageWithAbsolutePath,
        {
          filesMode: "changed",
          changedFiles: ["src/changed-file.ts"],
        },
      );

      expect(comment).toContain("Files with missing lines (1)");
      // Absolute paths are normalized — leading / and segments before repo root are stripped
      expect(comment).toContain(
        "home/runner/work/repo/repo/src/changed-file.ts",
      );
      expect(comment).not.toContain("unchanged-file.ts");
    });

    it("should match when diff paths are absolute and coverage paths are relative", () => {
      const comment = formatter.formatReport(
        undefined,
        coverageWithMissingFiles,
        {
          filesMode: "changed",
          changedFiles: ["/home/runner/work/repo/repo/src/changed-file.ts"],
        },
      );

      expect(comment).toContain("Files with missing lines (1)");
      expect(comment).toContain("src/changed-file.ts");
      expect(comment).not.toContain("unchanged-file.ts");
    });

    it("should only show changed files by default (filesMode defaults to changed)", () => {
      const comment = formatter.formatReport(
        undefined,
        coverageWithMissingFiles,
        {
          changedFiles: ["src/changed-file.ts"],
        },
      );

      expect(comment).toContain("Files with missing lines (1)");
      expect(comment).toContain("src/changed-file.ts");
      expect(comment).not.toContain("unchanged-file.ts");
      expect(comment).not.toContain("dot-prefixed.ts");
    });

    it("should hide file table when filesMode is none", () => {
      const comment = formatter.formatReport(
        undefined,
        coverageWithMissingFiles,
        {
          filesMode: "none",
        },
      );

      expect(comment).not.toContain("Files with missing lines");
      expect(comment).not.toContain("changed-file.ts");
    });

    it("should hide file table when filesMode is changed and changedFiles is empty", () => {
      const comment = formatter.formatReport(
        undefined,
        coverageWithMissingFiles,
        {
          filesMode: "changed",
          changedFiles: [],
        },
      );

      expect(comment).not.toContain("Files with missing lines");
    });

    it("should hide file table when filesMode is changed and changedFiles is absent", () => {
      const comment = formatter.formatReport(
        undefined,
        coverageWithMissingFiles,
        {
          filesMode: "changed",
        },
      );

      expect(comment).not.toContain("Files with missing lines");
    });

    describe("Patch file breakdown (PR context)", () => {
      it("separates patch coverage from unchanged project metrics", () => {
        const comment = formatter.formatReport(
          undefined,
          {
            ...coverageWithMissingFiles,
            lineRate: 64.53,
            patchCoverageRate: 50,
            totalHits: 1332,
            totalMisses: 733,
            totalPartials: 139,
            comparison: {
              filesAdded: [],
              filesRemoved: [],
              filesChanged: [],
              deltaLineRate: 0,
              deltaBranchRate: 0,
              deltaTotalStatements: 0,
              deltaCoveredStatements: 0,
              deltaTotalConditionals: 0,
              deltaCoveredConditionals: 0,
              deltaTotalMethods: 0,
              deltaCoveredMethods: 0,
              improvement: false,
              baseBranch: "main",
              baseCommit: "5d43891",
              headCommit: "154924e",
              baseHits: 1332,
              currentHits: 1332,
              baseMisses: 733,
              currentMisses: 733,
              basePartials: 139,
              currentPartials: 139,
            },
          },
          {
            patchTarget: 80,
            patchFileBreakdown: [
              {
                path: "src/covered.ts",
                coveredLines: [10],
                missedLines: [],
                partialLines: [],
                percentage: 100,
              },
              {
                path: "src/missed.ts",
                coveredLines: [],
                missedLines: [20],
                partialLines: [],
                percentage: 0,
              },
            ],
          },
        );

        expect(comment).toContain(
          ":x: Patch coverage is **50.00%** (1 of 2 changed executable lines covered; target 80%).",
        );
        expect(comment).toContain(
          "Project statement coverage is **64.53%** (unchanged from base (`5d43891`) to head (`154924e`)).",
        );
        expect(comment).not.toContain("Project has **733** uncovered lines.");
        expect(comment).toContain("Changed files with executable lines (2)");
        expect(comment).toContain("`src/covered.ts` | 100.00% | 1/1 covered |");
        expect(comment).toContain(
          "`src/missed.ts` | 0.00% | 0/1 covered; missed: 20 |",
        );
        expect(comment).toContain("  Coverage    64.53%    64.53%        —%");
        expect(comment).toContain("  Hits          1332      1332         —");
        expect(comment).toContain("  Misses         733       733         —");
      });

      const patchFileBreakdown: PatchFileCoverage[] = [
        {
          path: "src/args.rs",
          coveredLines: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
          missedLines: [20, 21],
          partialLines: [],
          percentage: 83.33,
        },
        {
          path: "src/types/bytes.rs",
          coveredLines: [5, 6, 7, 8, 9],
          missedLines: [],
          partialLines: [10],
          percentage: 100,
        },
        {
          path: "src/clean-file.rs",
          coveredLines: [1, 2, 3],
          missedLines: [],
          partialLines: [],
          percentage: 100,
        },
      ];

      it("should show patch-specific uncovered lines when patchFileBreakdown is provided", () => {
        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown,
          },
        );

        expect(comment).toContain("Changed files with executable lines (3)");
        expect(comment).toContain("`src/args.rs`");
        expect(comment).toContain("10/12 covered; missed: 20, 21");
        expect(comment).toContain("`src/types/bytes.rs`");
        expect(comment).toContain("5/5 covered; partial branches: 10");
        expect(comment).toContain("`src/clean-file.rs`");
      });

      it("should use patch percentage instead of project lineRate", () => {
        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown,
          },
        );

        // args.rs should show its patch percentage (83.33%), not the project lineRate
        expect(comment).toContain("83.33%");
      });

      it("should show both missing and partial counts for patch files", () => {
        const mixedBreakdown: PatchFileCoverage[] = [
          {
            path: "src/mixed.rs",
            coveredLines: [1, 2, 3],
            missedLines: [4, 5],
            partialLines: [3],
            percentage: 60,
          },
        ];

        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown: mixedBreakdown,
          },
        );

        expect(comment).toContain("Changed files with executable lines (1)");
        expect(comment).toContain(
          "3/5 covered; missed: 4, 5; partial branches: 3",
        );
      });

      it("should show fully covered changed files when patchFileBreakdown is available", () => {
        const cleanBreakdown: PatchFileCoverage[] = [
          {
            path: "src/clean.rs",
            coveredLines: [1, 2, 3],
            missedLines: [],
            partialLines: [],
            percentage: 100,
          },
        ];

        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown: cleanBreakdown,
          },
        );

        expect(comment).toContain("Changed files with executable lines (1)");
        expect(comment).toContain("`src/clean.rs` | 100.00% | 3/3 covered |");
      });

      it("should hide file table when filesMode is none even with patchFileBreakdown", () => {
        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            filesMode: "none",
            patchFileBreakdown,
          },
        );

        expect(comment).not.toContain("Changed files with executable lines");
      });

      it("should sort patch files by total missing + partial lines descending", () => {
        const unsortedBreakdown: PatchFileCoverage[] = [
          {
            path: "src/few-missing.rs",
            coveredLines: [1, 2],
            missedLines: [3],
            partialLines: [],
            percentage: 66.67,
          },
          {
            path: "src/many-missing.rs",
            coveredLines: [1],
            missedLines: [2, 3, 4],
            partialLines: [1],
            percentage: 25,
          },
        ];

        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown: unsortedBreakdown,
          },
        );

        const manyIdx = comment.indexOf("src/many-missing.rs");
        const fewIdx = comment.indexOf("src/few-missing.rs");
        // many-missing.rs (4 total) should appear before few-missing.rs (1 total)
        expect(manyIdx).toBeLessThan(fewIdx);
      });

      it("should fall back to project-wide missing lines when no patchFileBreakdown", () => {
        // This tests the existing behavior is preserved for non-PR contexts
        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            filesMode: "all",
            // No patchFileBreakdown provided
          },
        );

        expect(comment).toContain("Files with missing lines (3)");
        expect(comment).toContain("`src/changed-file.ts`");
        expect(comment).toContain("`src/unchanged-file.ts`");
        expect(comment).toContain("`src/dot-prefixed.ts`");
      });

      it("should not attribute project-wide uncovered lines to the patch summary", () => {
        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown,
          },
        );

        expect(comment).not.toContain("Project has **20** uncovered lines.");
      });
    });

    describe("File links with githubContext", () => {
      const githubContext = {
        owner: "pydantic",
        repo: "monty",
        prNumber: 290,
        serverUrl: "https://github.com",
      };

      it("should render file names as links to PR diff when githubContext is provided", () => {
        const patchBreakdown: PatchFileCoverage[] = [
          {
            path: "src/changed-file.ts",
            coveredLines: [1, 2],
            missedLines: [3],
            partialLines: [],
            percentage: 66.67,
          },
          {
            path: "src/unchanged-file.ts",
            coveredLines: [1],
            missedLines: [2],
            partialLines: [],
            percentage: 50,
          },
        ];

        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown: patchBreakdown,
            githubContext,
          },
        );

        // Should contain markdown links, not backtick-formatted names
        expect(comment).toContain(
          "[src/changed-file.ts](https://github.com/pydantic/monty/pull/290/files#diff-",
        );
        expect(comment).toContain(
          "[src/unchanged-file.ts](https://github.com/pydantic/monty/pull/290/files#diff-",
        );
        // Should NOT contain backtick-only file references in the table
        expect(comment).not.toContain("`src/changed-file.ts`");
      });

      it("should render patch breakdown files as links when githubContext is provided", () => {
        const patchBreakdown: PatchFileCoverage[] = [
          {
            path: "crates/monty/src/types/mod.rs",
            coveredLines: [1, 2],
            missedLines: [3],
            partialLines: [],
            percentage: 66.67,
          },
          {
            path: "crates/monty/src/builtins/mod.rs",
            coveredLines: [1],
            missedLines: [2],
            partialLines: [],
            percentage: 50,
          },
        ];

        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown: patchBreakdown,
            githubContext,
          },
        );

        // Both files should show full paths (disambiguating the two mod.rs files)
        expect(comment).toContain("crates/monty/src/types/mod.rs");
        expect(comment).toContain("crates/monty/src/builtins/mod.rs");
        // Both should be links
        expect(comment).toContain(
          "[crates/monty/src/types/mod.rs](https://github.com/pydantic/monty/pull/290/files#diff-",
        );
        expect(comment).toContain(
          "[crates/monty/src/builtins/mod.rs](https://github.com/pydantic/monty/pull/290/files#diff-",
        );
      });

      it("should use plain backtick paths without githubContext", () => {
        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            filesMode: "all",
            // No githubContext
          },
        );

        // Should use backtick formatting with full paths
        expect(comment).toContain("`src/changed-file.ts`");
        expect(comment).not.toContain("[src/changed-file.ts]");
      });

      it("should use plain backtick paths in fallback even with githubContext", () => {
        // When there's no patchFileBreakdown (fallback path), coverage parser
        // paths may be absolute and won't produce valid GitHub diff anchors.
        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            filesMode: "all",
            githubContext,
            // No patchFileBreakdown — hits fallback path
          },
        );

        // Fallback path should NOT generate links
        expect(comment).toContain("`src/changed-file.ts`");
        expect(comment).not.toContain("[src/changed-file.ts]");
      });

      it("should support custom server URL for GHES", () => {
        const ghesContext = {
          owner: "org",
          repo: "repo",
          prNumber: 42,
          serverUrl: "https://github.example.com",
        };

        const patchBreakdown: PatchFileCoverage[] = [
          {
            path: "src/changed-file.ts",
            coveredLines: [1, 2],
            missedLines: [3],
            partialLines: [],
            percentage: 66.67,
          },
        ];

        const comment = formatter.formatReport(
          undefined,
          coverageWithMissingFiles,
          {
            patchFileBreakdown: patchBreakdown,
            githubContext: ghesContext,
          },
        );

        expect(comment).toContain(
          "[src/changed-file.ts](https://github.example.com/org/repo/pull/42/files#diff-",
        );
      });
    });
  });
});
