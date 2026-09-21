import JSZip from "jszip";
import type { FileCoverage, LineCoverage, ParsedArtifact } from "../types";

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
        files: fileCoverageList(coverageData),
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

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} object.`);
  }
  return value as Record<string, unknown>;
}

function text(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`Invalid text field: ${key}`);
  }
  return value;
}

/** Older artifacts predate per-file coverage, so a missing list is not an error. */
function fileCoverageList(data: unknown): FileCoverage[] {
  const files = object(data, "coverage metrics").files;
  if (files === undefined || files === null) return [];
  if (!Array.isArray(files)) {
    throw new Error("Invalid coverage metrics field: files");
  }
  return files.map((entry) => {
    const file = object(entry, "file coverage");
    return {
      name: text(file, "name"),
      path: text(file, "path"),
      statements: metric(file, "statements"),
      coveredStatements: metric(file, "coveredStatements"),
      conditionals: metric(file, "conditionals"),
      coveredConditionals: metric(file, "coveredConditionals"),
      methods: metric(file, "methods"),
      coveredMethods: metric(file, "coveredMethods"),
      lineRate: metric(file, "lineRate"),
      branchRate: metric(file, "branchRate"),
      lines: lineCoverageList(file.lines),
      missingLines: lineNumbers(file.missingLines),
      partialLines: lineNumbers(file.partialLines),
    };
  });
}

function lineCoverageList(value: unknown): LineCoverage[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Invalid file coverage field: lines");
  }
  return value.map((entry) => {
    const data = object(entry, "line coverage");
    const type = data.type;
    if (type !== "stmt" && type !== "cond" && type !== "method") {
      throw new Error("Invalid line coverage type.");
    }
    return {
      lineNumber: metric(entry, "lineNumber"),
      count: metric(entry, "count"),
      type,
      trueCount: branchCount(data, "trueCount"),
      falseCount: branchCount(data, "falseCount"),
    };
  });
}

function branchCount(
  data: Record<string, unknown>,
  key: string,
): number | undefined {
  return data[key] === undefined || data[key] === null
    ? undefined
    : metric(data, key);
}

function lineNumbers(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Invalid file coverage line number list.");
  }
  return value.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error("Invalid file coverage line number.");
    }
    return entry;
  });
}
