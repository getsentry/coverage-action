export interface LineCoverage {
  lineNumber: number;
  count: number;
  type: "stmt" | "cond" | "method";
  trueCount?: number;
  falseCount?: number;
}

export interface FileCoverage {
  name: string;
  path: string;
  statements: number;
  coveredStatements: number;
  conditionals: number;
  coveredConditionals: number;
  methods: number;
  coveredMethods: number;
  lineRate: number;
  branchRate: number;
  lines: LineCoverage[];
  missingLines: number[];
  partialLines: number[];
  patchCoverage?: number;
}

export interface TimeSeriesDataPoint {
  date: Date;
  commitSha: string;
  runId: number;
  runNumber: number;
  coverage?: {
    lineRate: number;
    branchRate: number;
    totalStatements: number;
    coveredStatements: number;
    totalConditionals: number;
    coveredConditionals: number;
    totalMethods: number;
    coveredMethods: number;
    files?: FileCoverage[];
  };
  tests?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    totalTime: number;
  };
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
}

export interface ParsedArtifact {
  tests?: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    passRate: number;
    totalTime: number;
  };
  coverage?: {
    lineRate: number;
    branchRate: number;
    totalStatements: number;
    coveredStatements: number;
    totalConditionals: number;
    coveredConditionals: number;
    totalMethods: number;
    coveredMethods: number;
    files?: FileCoverage[];
  };
}
