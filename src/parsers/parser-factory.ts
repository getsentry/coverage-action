import * as fs from "node:fs/promises";
import type {
  AggregatedCoverageResults,
  CoverageResults,
  FileCoverage,
  LineCoverage,
} from "../types/coverage.js";
import type { CoverageFormat, ICoverageParser } from "./base-parser.js";
import { CloverParser } from "./clover-parser.js";
import { CoberturaParser } from "./cobertura-parser.js";
import { CodecovParser } from "./codecov-parser.js";
import { GoParser } from "./go-parser.js";
import { IstanbulParser } from "./istanbul-parser.js";
import { JaCoCoParser } from "./jacoco-parser.js";
import { LcovParser } from "./lcov-parser.js";

const PARSERS: ICoverageParser[] = [
  new CloverParser(),
  new CoberturaParser(),
  new JaCoCoParser(),
  new LcovParser(),
  new IstanbulParser(),
  new GoParser(),
  new CodecovParser(), // Added last to avoid false positives with other JSON formats
];

/**
 * Factory for creating coverage parsers with auto-detection support
 */
export const CoverageParserFactory = {
  /**
   * Get a parser for a specific format
   * @param format The coverage format to use
   * @returns The parser for the specified format
   */
  getParser(format: CoverageFormat): ICoverageParser {
    const parser = PARSERS.find((p) => p.format === format);
    if (!parser) {
      throw new Error(`Unsupported coverage format: ${format}`);
    }
    return parser;
  },

  /**
   * Auto-detect the coverage format and return the appropriate parser
   * @param content The content to analyze
   * @param filePath Optional file path for extension-based hints
   * @returns The detected parser or null if no match
   */
  detectParser(content: string, filePath?: string): ICoverageParser | null {
    // Try each parser in order of specificity (content-based detection)
    for (const parser of PARSERS) {
      if (parser.canParse(content, filePath)) {
        return parser;
      }
    }

    // Fallback to path-based detection if content detection fails
    if (filePath) {
      const formatFromPath =
        CoverageParserFactory.detectFormatFromPath(filePath);
      if (formatFromPath) {
        return CoverageParserFactory.getParser(formatFromPath);
      }
    }

    return null;
  },

  /**
   * Auto-detect format from file path (extension-based)
   * @param filePath The file path to analyze
   * @returns The detected format or null
   */
  detectFormatFromPath(filePath: string): CoverageFormat | null {
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.endsWith("clover.xml")) {
      return "clover";
    }
    if (
      lowerPath.endsWith("cobertura.xml") ||
      lowerPath.includes("cobertura")
    ) {
      return "cobertura";
    }
    if (lowerPath.endsWith("jacoco.xml") || lowerPath.includes("jacoco")) {
      return "jacoco";
    }
    if (lowerPath.endsWith("lcov.info") || lowerPath.endsWith(".lcov")) {
      return "lcov";
    }
    if (
      lowerPath.endsWith("coverage-final.json") ||
      lowerPath.includes("istanbul")
    ) {
      return "istanbul";
    }
    if (
      lowerPath.endsWith("coverage.out") ||
      lowerPath.endsWith("cover.out") ||
      lowerPath.endsWith(".coverprofile")
    ) {
      return "go";
    }
    if (lowerPath.endsWith("codecov.json")) {
      return "codecov";
    }

    return null;
  },

  /**
   * Parse a coverage file with auto-detection or explicit format
   * @param filePath Path to the coverage file
   * @param format Optional explicit format (uses auto-detection if not provided or 'auto')
   * @returns Parsed coverage results
   */
  async parseFile(
    filePath: string,
    format?: CoverageFormat | "auto"
  ): Promise<CoverageResults> {
    const content = await fs.readFile(filePath, "utf-8");
    return CoverageParserFactory.parseContent(content, filePath, format);
  },

  /**
   * Parse coverage content with auto-detection or explicit format
   * @param content The coverage content to parse
   * @param filePath Optional file path for detection hints
   * @param format Optional explicit format (uses auto-detection if not provided or 'auto')
   * @returns Parsed coverage results
   */
  async parseContent(
    content: string,
    filePath?: string,
    format?: CoverageFormat | "auto"
  ): Promise<CoverageResults> {
    let parser: ICoverageParser | null = null;

    // Use explicit format if provided and not 'auto'
    if (format && format !== "auto") {
      parser = CoverageParserFactory.getParser(format);
    } else {
      // Auto-detect
      parser = CoverageParserFactory.detectParser(content, filePath);
    }

    if (!parser) {
      const hint = filePath ? ` for file: ${filePath}` : "";
      throw new Error(
        `Unable to detect coverage format${hint}. ` +
          "Please specify format explicitly or ensure the file is in a supported format. " +
          `Supported formats: ${CoverageParserFactory.getSupportedFormats().join(
            ", "
          )}`
      );
    }

    return parser.parseContent(content);
  },

  /**
   * Get list of supported format names
   */
  getSupportedFormats(): CoverageFormat[] {
    return PARSERS.map((p) => p.format);
  },

  /**
   * Aggregate multiple coverage results into a single result.
   *
   * Multiple reports covering the same file are merged by path with union
   * semantics: per-line hit counts are combined via max(), so a line hit
   * by any report counts as covered. Without this, overlapping files
   * would be double-counted in the denominator, deflating the rate.
   */
  aggregateResults(results: CoverageResults[]): AggregatedCoverageResults {
    const mergedFiles = mergeFilesByPath(results);

    let totalStatements = 0;
    let coveredStatements = 0;
    let totalConditionals = 0;
    let coveredConditionals = 0;
    let totalMethods = 0;
    let coveredMethods = 0;

    // Detailed metrics for reporting
    let totalHits = 0;
    let totalMisses = 0;
    let totalPartials = 0;
    let totalBranches = 0;
    let totalLines = 0;

    for (const file of mergedFiles) {
      totalStatements += file.statements;
      coveredStatements += file.coveredStatements;
      totalConditionals += file.conditionals;
      coveredConditionals += file.coveredConditionals;
      totalMethods += file.methods;
      coveredMethods += file.coveredMethods;

      for (const line of file.lines) {
        totalLines++;
        if (line.count > 0) {
          totalHits++;
        } else {
          totalMisses++;
        }
      }

      if (file.partialLines) {
        totalPartials += file.partialLines.length;
      }

      totalBranches += file.conditionals;
    }

    const lineRate =
      totalStatements > 0
        ? Number.parseFloat(
            ((coveredStatements / totalStatements) * 100).toFixed(2)
          )
        : 0;
    const branchRate =
      totalConditionals > 0
        ? Number.parseFloat(
            ((coveredConditionals / totalConditionals) * 100).toFixed(2)
          )
        : 0;

    return {
      totalStatements,
      coveredStatements,
      totalConditionals,
      coveredConditionals,
      totalMethods,
      coveredMethods,
      lineRate,
      branchRate,
      files: mergedFiles,
      // Detailed metrics
      totalHits,
      totalMisses,
      totalPartials,
      totalBranches,
      totalFiles: mergedFiles.length,
      totalLines,
    };
  },
};

/**
 * Merge FileCoverage entries that share a path in two phases:
 *
 *   1. Within each report, sum entries sharing a path. Some parsers emit
 *      multiple FileCoverage entries per source file (e.g., cobertura
 *      produces one `<class>` per Java/C# type, and a single source file
 *      can contain multiple types or inner classes). These are disjoint
 *      parts of one file and must be summed, not unioned.
 *   2. Across reports, union entries sharing a path — a line hit by any
 *      report counts as covered.
 */
function mergeFilesByPath(results: CoverageResults[]): FileCoverage[] {
  const perReportCombined = results.flatMap((r) =>
    groupByPath(r.files, sumFileGroup),
  );
  return groupByPath(perReportCombined, mergeFileGroup);
}

function groupByPath(
  files: FileCoverage[],
  combine: (group: FileCoverage[]) => FileCoverage,
): FileCoverage[] {
  const byPath = new Map<string, FileCoverage[]>();
  for (const file of files) {
    const key = file.path || file.name;
    const group = byPath.get(key);
    if (group) {
      group.push(file);
    } else {
      byPath.set(key, [file]);
    }
  }

  const result: FileCoverage[] = [];
  for (const group of byPath.values()) {
    result.push(group.length === 1 ? group[0] : combine(group));
  }
  return result;
}

/**
 * Sum disjoint FileCoverage entries (e.g., inner classes within the same
 * source file). Counts are additive; line data is concatenated.
 */
function sumFileGroup(group: FileCoverage[]): FileCoverage {
  const lineMap = new Map<number, LineCoverage>();
  for (const file of group) {
    for (const line of file.lines) {
      // Distinct classes in the same file normally occupy non-overlapping
      // line ranges, but if they do overlap, take the max hit count.
      const existing = lineMap.get(line.lineNumber);
      if (!existing || line.count > existing.count) {
        lineMap.set(line.lineNumber, { ...line });
      }
    }
  }

  let statements = 0;
  let coveredStatements = 0;
  let conditionals = 0;
  let coveredConditionals = 0;
  let methods = 0;
  let coveredMethods = 0;
  for (const f of group) {
    statements += f.statements;
    coveredStatements += f.coveredStatements;
    conditionals += f.conditionals;
    coveredConditionals += f.coveredConditionals;
    methods += f.methods;
    coveredMethods += f.coveredMethods;
  }

  return finalizeMergedFile(group, lineMap, {
    statements,
    coveredStatements,
    conditionals,
    coveredConditionals,
    methods,
    coveredMethods,
  });
}

function mergeFileGroup(group: FileCoverage[]): FileCoverage {
  const lineMap = new Map<number, LineCoverage>();
  for (const file of group) {
    for (const line of file.lines) {
      const existing = lineMap.get(line.lineNumber);
      if (!existing) {
        lineMap.set(line.lineNumber, { ...line });
        continue;
      }
      if (line.count > existing.count) {
        existing.count = line.count;
      }
      if (line.type === "cond" || existing.type === "cond") {
        existing.type = "cond";
      } else if (line.type === "method" || existing.type === "method") {
        existing.type = "method";
      }
      if (line.trueCount !== undefined) {
        existing.trueCount = Math.max(existing.trueCount ?? 0, line.trueCount);
      }
      if (line.falseCount !== undefined) {
        existing.falseCount = Math.max(
          existing.falseCount ?? 0,
          line.falseCount,
        );
      }
    }
  }

  // Parsers differ on how statements map to lines: cobertura/lcov/jacoco/
  // istanbul emit one "statement" per line entry, but Go counts semantic
  // blocks where one block can span many lines. To stay correct for both:
  //
  //   - `statements` uses max() across reports (same file ⇒ same count).
  //   - When statements align 1:1 with lines, derive `coveredStatements`
  //     from the merged line union exactly.
  //   - Otherwise, approximate the union by summing per-report covered
  //     counts and clamping to `statements`. This is more accurate than
  //     max() when reports exercise different blocks (the common case
  //     for Go, where different suites cover different paths), at the
  //     cost of overestimating when reports cover overlapping blocks.
  //     Exact reconstruction would require preserving block structure
  //     through FileCoverage.
  const statements = Math.max(...group.map((f) => f.statements));
  const lineAligned = group.every((f) => f.statements === f.lines.length);
  const coveredStatements = lineAligned
    ? [...lineMap.values()].filter((l) => l.count > 0).length
    : Math.min(
        statements,
        group.reduce((s, f) => s + f.coveredStatements, 0),
      );

  // LineCoverage doesn't carry per-branch hit state, so we can't reliably
  // union branch hits across reports. Same file ⇒ same branch count across
  // reports, so take the max as a best-effort union.
  const conditionals = Math.max(...group.map((f) => f.conditionals));
  const coveredConditionals = Math.max(
    ...group.map((f) => f.coveredConditionals),
  );
  const methods = Math.max(...group.map((f) => f.methods));
  const coveredMethods = Math.max(...group.map((f) => f.coveredMethods));

  return finalizeMergedFile(group, lineMap, {
    statements,
    coveredStatements,
    conditionals,
    coveredConditionals,
    methods,
    coveredMethods,
  });
}

interface MergedFileMetrics {
  statements: number;
  coveredStatements: number;
  conditionals: number;
  coveredConditionals: number;
  methods: number;
  coveredMethods: number;
}

/**
 * Assemble the final FileCoverage from a pre-populated lineMap and the
 * aggregation strategy's numeric metrics. Shared by `sumFileGroup` and
 * `mergeFileGroup` — they differ in how the map and metrics are built,
 * but the downstream derivation (sort, missing/partial lines, rates,
 * output shape) is identical.
 */
function finalizeMergedFile(
  group: FileCoverage[],
  lineMap: Map<number, LineCoverage>,
  metrics: MergedFileMetrics,
): FileCoverage {
  const mergedLines = [...lineMap.values()].sort(
    (a, b) => a.lineNumber - b.lineNumber,
  );
  const missingLines = mergedLines
    .filter((l) => l.count === 0)
    .map((l) => l.lineNumber);

  // A partial line remains partial only if it still has hits after merge;
  // lines that ended up fully missed are no longer partial.
  const partialLines = [
    ...new Set(group.flatMap((f) => f.partialLines ?? [])),
  ]
    .filter((ln) => (lineMap.get(ln)?.count ?? 0) > 0)
    .sort((a, b) => a - b);

  return {
    name: group[0].name,
    path: group[0].path,
    ...metrics,
    lineRate: calculateRate(metrics.coveredStatements, metrics.statements),
    branchRate: calculateRate(
      metrics.coveredConditionals,
      metrics.conditionals,
    ),
    lines: mergedLines,
    missingLines,
    partialLines,
  };
}

function calculateRate(covered: number, total: number): number {
  return total > 0
    ? Number.parseFloat(((covered / total) * 100).toFixed(2))
    : 0;
}

/**
 * Re-export for convenience
 */
export type { CoverageFormat, ICoverageParser } from "./base-parser.js";
export { CloverParser } from "./clover-parser.js";
export { CoberturaParser } from "./cobertura-parser.js";
export { CodecovParser } from "./codecov-parser.js";
export { GoParser } from "./go-parser.js";
export { IstanbulParser } from "./istanbul-parser.js";
export { JaCoCoParser } from "./jacoco-parser.js";
export { LcovParser } from "./lcov-parser.js";
