import JSZip from "jszip";
import type { ParsedArtifact } from "../types";

export async function parseArtifact(
  zipData: ArrayBuffer,
): Promise<ParsedArtifact> {
  const zip = await JSZip.loadAsync(zipData);

  // Find test-results.json or coverage-results.json
  const testFile = zip.file("test-results.json");
  const coverageFile = zip.file("coverage-results.json");

  if (!testFile && !coverageFile) {
    throw new Error(
      "Artifact contains no test-results.json or coverage-results.json.",
    );
  }

  const results: ParsedArtifact = {};

  if (testFile) {
    try {
      const content = await testFile.async("string");
      const testData = JSON.parse(content);
      results.tests = {
        totalTests: metric(testData, "totalTests"),
        passedTests: metric(testData, "passedTests"),
        failedTests: metric(testData, "failedTests"),
        skippedTests: metric(testData, "skippedTests"),
        passRate: metric(testData, "passRate"),
        totalTime: metric(testData, "totalTime"),
      };
    } catch (error) {
      throw new Error("Invalid test-results.json report.", { cause: error });
    }
  }

  if (coverageFile) {
    try {
      const content = await coverageFile.async("string");
      const coverageData = JSON.parse(content);
      results.coverage = {
        lineRate: metric(coverageData, "lineRate"),
        branchRate: metric(coverageData, "branchRate"),
        totalStatements: metric(coverageData, "totalStatements"),
        coveredStatements: metric(coverageData, "coveredStatements"),
        totalConditionals: metric(coverageData, "totalConditionals"),
        coveredConditionals: metric(coverageData, "coveredConditionals"),
        totalMethods: metric(coverageData, "totalMethods"),
        coveredMethods: metric(coverageData, "coveredMethods"),
      };
    } catch (error) {
      throw new Error("Invalid coverage-results.json report.", {
        cause: error,
      });
    }
  }

  return results;
}

function metric(data: unknown, key: string): number {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Expected a metrics object.");
  }
  const value = (data as Record<string, unknown>)[key] ?? 0;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid numeric metric: ${key}`);
  }
  return value;
}
