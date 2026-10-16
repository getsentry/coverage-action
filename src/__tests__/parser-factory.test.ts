import { describe, expect, it } from "vitest";
import { CoverageParserFactory } from "../parsers/parser-factory.js";

describe("CoverageParserFactory", () => {
  // Sample content for each format
  const cloverXML = `<?xml version="1.0"?>
<coverage clover="3.2.0">
  <project timestamp="123">
    <metrics statements="10" coveredstatements="5" conditionals="2" coveredconditionals="1" methods="3" coveredmethods="2" elements="15" coveredelements="8"/>
  </project>
</coverage>`;

  const coberturaXML = `<?xml version="1.0"?>
<coverage line-rate="0.5" branch-rate="0.3">
  <packages>
    <package name="pkg">
      <classes>
        <class filename="file.py">
          <lines><line number="1" hits="1"/></lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;

  const jacocoXML = `<?xml version="1.0"?>
<report name="test">
  <package name="pkg">
    <sourcefile name="File.java">
      <line nr="1" mi="0" ci="5" mb="0" cb="0"/>
      <counter type="LINE" missed="0" covered="1"/>
      <counter type="BRANCH" missed="0" covered="0"/>
      <counter type="METHOD" missed="0" covered="1"/>
    </sourcefile>
  </package>
  <counter type="LINE" missed="0" covered="1"/>
  <counter type="BRANCH" missed="0" covered="0"/>
  <counter type="METHOD" missed="0" covered="1"/>
</report>`;

  const lcovContent = `SF:/src/file.ts
DA:1,5
DA:2,0
LF:2
LH:1
end_of_record
`;

  const istanbulJSON = JSON.stringify({
    "/src/file.ts": {
      path: "/src/file.ts",
      statementMap: {
        "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
      },
      fnMap: {},
      branchMap: {},
      s: { "0": 5 },
      f: {},
      b: {},
    },
  });

  const goCoverage = `mode: set
github.com/user/project/file.go:1.1,3.2 1 1
`;

  describe("detectParser", () => {
    it("should detect Clover format", () => {
      const parser = CoverageParserFactory.detectParser(cloverXML);
      expect(parser?.format).toBe("clover");
    });

    it("should detect Cobertura format", () => {
      const parser = CoverageParserFactory.detectParser(coberturaXML);
      expect(parser?.format).toBe("cobertura");
    });

    it("should detect JaCoCo format", () => {
      const parser = CoverageParserFactory.detectParser(jacocoXML);
      expect(parser?.format).toBe("jacoco");
    });

    it("should detect LCOV format", () => {
      const parser = CoverageParserFactory.detectParser(lcovContent);
      expect(parser?.format).toBe("lcov");
    });

    it("should detect Istanbul format", () => {
      const parser = CoverageParserFactory.detectParser(istanbulJSON);
      expect(parser?.format).toBe("istanbul");
    });

    it("should detect Go format", () => {
      const parser = CoverageParserFactory.detectParser(goCoverage);
      expect(parser?.format).toBe("go");
    });

    it("should use file path hints", () => {
      // LCOV by extension
      const parser1 = CoverageParserFactory.detectParser("", "lcov.info");
      expect(parser1?.format).toBe("lcov");

      // Go by extension
      const parser2 = CoverageParserFactory.detectParser("", "coverage.out");
      expect(parser2?.format).toBe("go");
    });

    it("should return null for unknown format", () => {
      const parser = CoverageParserFactory.detectParser("random content");
      expect(parser).toBeNull();
    });
  });

  describe("detectFormatFromPath", () => {
    it("should detect Clover from path", () => {
      expect(CoverageParserFactory.detectFormatFromPath("clover.xml")).toBe(
        "clover"
      );
      expect(
        CoverageParserFactory.detectFormatFromPath("coverage/clover.xml")
      ).toBe("clover");
    });

    it("should detect Cobertura from path", () => {
      expect(CoverageParserFactory.detectFormatFromPath("cobertura.xml")).toBe(
        "cobertura"
      );
      expect(
        CoverageParserFactory.detectFormatFromPath("cobertura-coverage.xml")
      ).toBe("cobertura");
      expect(
        CoverageParserFactory.detectFormatFromPath("coverage.cobertura.xml")
      ).toBe("cobertura");
    });

    it("should detect JaCoCo from path", () => {
      expect(CoverageParserFactory.detectFormatFromPath("jacoco.xml")).toBe(
        "jacoco"
      );
      expect(
        CoverageParserFactory.detectFormatFromPath("build/jacoco/test.xml")
      ).toBe("jacoco");
    });

    it("should detect LCOV from path", () => {
      expect(CoverageParserFactory.detectFormatFromPath("lcov.info")).toBe(
        "lcov"
      );
      expect(
        CoverageParserFactory.detectFormatFromPath("coverage.lcov")
      ).toBe("lcov");
    });

    it("should detect Istanbul from path", () => {
      expect(
        CoverageParserFactory.detectFormatFromPath("coverage-final.json")
      ).toBe("istanbul");
    });

    it("should detect Go from path", () => {
      expect(CoverageParserFactory.detectFormatFromPath("coverage.out")).toBe(
        "go"
      );
      expect(CoverageParserFactory.detectFormatFromPath("cover.out")).toBe(
        "go"
      );
    });

    it("should return null for unknown paths", () => {
      expect(
        CoverageParserFactory.detectFormatFromPath("unknown.txt")
      ).toBeNull();
    });
  });

  describe("getParser", () => {
    it("should return correct parser for each format", () => {
      expect(CoverageParserFactory.getParser("clover").format).toBe("clover");
      expect(CoverageParserFactory.getParser("cobertura").format).toBe(
        "cobertura"
      );
      expect(CoverageParserFactory.getParser("jacoco").format).toBe("jacoco");
      expect(CoverageParserFactory.getParser("lcov").format).toBe("lcov");
      expect(CoverageParserFactory.getParser("istanbul").format).toBe(
        "istanbul"
      );
      expect(CoverageParserFactory.getParser("go").format).toBe("go");
    });

    it("should throw for unknown format", () => {
      expect(() =>
        CoverageParserFactory.getParser("unknown" as never)
      ).toThrow("Unsupported coverage format");
    });
  });

  describe("parseContent", () => {
    it("should parse with auto-detection", async () => {
      const result = await CoverageParserFactory.parseContent(lcovContent);
      expect(result.files).toHaveLength(1);
    });

    it("should parse with explicit format", async () => {
      const result = await CoverageParserFactory.parseContent(
        lcovContent,
        undefined,
        "lcov"
      );
      expect(result.files).toHaveLength(1);
    });

    it("should parse with auto format hint", async () => {
      const result = await CoverageParserFactory.parseContent(
        lcovContent,
        "lcov.info",
        "auto"
      );
      expect(result.files).toHaveLength(1);
    });

    it("should throw for undetectable format", async () => {
      await expect(
        CoverageParserFactory.parseContent("unknown content")
      ).rejects.toThrow("Unable to detect coverage format");
    });
  });

  describe("getSupportedFormats", () => {
    it("should return all supported formats", () => {
      const formats = CoverageParserFactory.getSupportedFormats();
      expect(formats).toContain("clover");
      expect(formats).toContain("cobertura");
      expect(formats).toContain("jacoco");
      expect(formats).toContain("lcov");
      expect(formats).toContain("istanbul");
      expect(formats).toContain("go");
      expect(formats).toContain("codecov");
      expect(formats).toHaveLength(7);
    });
  });

  describe("aggregateResults", () => {
    it("should aggregate multiple results", async () => {
      const result1 = await CoverageParserFactory.parseContent(lcovContent);
      const result2 = await CoverageParserFactory.parseContent(goCoverage);

      const aggregated = CoverageParserFactory.aggregateResults([
        result1,
        result2,
      ]);

      // Combined files from both results
      expect(aggregated.files.length).toBeGreaterThanOrEqual(2);

      // Combined metrics
      expect(aggregated.totalStatements).toBe(
        result1.metrics.statements + result2.metrics.statements
      );
    });

    it("should handle empty results array", () => {
      const aggregated = CoverageParserFactory.aggregateResults([]);

      expect(aggregated.totalStatements).toBe(0);
      expect(aggregated.lineRate).toBe(0);
      expect(aggregated.files).toHaveLength(0);
    });

    it("should merge same file across reports with union of line hits", async () => {
      // Multiple reports covering the same file. Lines 1,2 hit by report
      // A, lines 2,3 hit by report B. Union should report 3/4 covered,
      // not 3/8.
      const reportA = `<?xml version="1.0"?>
<coverage line-rate="0.5">
  <packages><package name="p"><classes>
    <class filename="src/shared.cs">
      <lines>
        <line number="1" hits="5"/>
        <line number="2" hits="2"/>
        <line number="3" hits="0"/>
        <line number="4" hits="0"/>
      </lines>
    </class>
  </classes></package></packages>
</coverage>`;
      const reportB = `<?xml version="1.0"?>
<coverage line-rate="0.5">
  <packages><package name="p"><classes>
    <class filename="src/shared.cs">
      <lines>
        <line number="1" hits="0"/>
        <line number="2" hits="3"/>
        <line number="3" hits="1"/>
        <line number="4" hits="0"/>
      </lines>
    </class>
  </classes></package></packages>
</coverage>`;

      const a = await CoverageParserFactory.parseContent(reportA);
      const b = await CoverageParserFactory.parseContent(reportB);
      const aggregated = CoverageParserFactory.aggregateResults([a, b]);

      expect(aggregated.files).toHaveLength(1);
      expect(aggregated.totalStatements).toBe(4);
      expect(aggregated.coveredStatements).toBe(3);
      expect(aggregated.lineRate).toBe(75);

      const merged = aggregated.files[0];
      expect(merged.lines.find((l) => l.lineNumber === 1)?.count).toBe(5);
      expect(merged.lines.find((l) => l.lineNumber === 2)?.count).toBe(3);
      expect(merged.lines.find((l) => l.lineNumber === 3)?.count).toBe(1);
      expect(merged.lines.find((l) => l.lineNumber === 4)?.count).toBe(0);
      expect(merged.missingLines).toEqual([4]);
    });

    it("should sum disjoint classes sharing a path within one report", async () => {
      // Cobertura emits one <class> per type; a single source file with
      // multiple types (inner classes, partial classes) produces several
      // FileCoverage entries sharing a path. These are disjoint parts
      // of the file and must be summed, not unioned (which would both
      // undercount the denominator and let coveredStatements exceed it).
      const report = `<?xml version="1.0"?>
<coverage line-rate="0.5">
  <packages><package name="p"><classes>
    <class filename="src/multi.py">
      <lines>
        <line number="1" hits="1"/>
        <line number="2" hits="1"/>
        <line number="3" hits="0"/>
      </lines>
    </class>
    <class filename="src/multi.py">
      <lines>
        <line number="10" hits="1"/>
        <line number="11" hits="0"/>
      </lines>
    </class>
  </classes></package></packages>
</coverage>`;

      const result = await CoverageParserFactory.parseContent(report);
      const aggregated = CoverageParserFactory.aggregateResults([result]);

      expect(aggregated.files).toHaveLength(1);
      expect(aggregated.totalStatements).toBe(5);
      expect(aggregated.coveredStatements).toBe(3);
      expect(aggregated.lineRate).toBe(60);
    });

    it("should union coveredStatements when Go reports exercise disjoint blocks", async () => {
      // Go reports statement count as semantic blocks, not physical lines:
      // `file.go:1.1,3.2 2 1` is one block covering lines 1-3 with 2
      // statements. Merging must not collapse statements to lines.length,
      // and when reports cover disjoint blocks (report A hits block 1 only,
      // report B hits block 2 only), the union should credit both.
      const reportA = `mode: set
github.com/x/p/f.go:1.1,3.2 2 1
github.com/x/p/f.go:5.1,7.2 2 0
`;
      const reportB = `mode: set
github.com/x/p/f.go:1.1,3.2 2 0
github.com/x/p/f.go:5.1,7.2 2 1
`;

      const a = await CoverageParserFactory.parseContent(reportA);
      const b = await CoverageParserFactory.parseContent(reportB);
      const aggregated = CoverageParserFactory.aggregateResults([a, b]);

      expect(aggregated.files).toHaveLength(1);
      // 2 blocks × 2 statements = 4 statements total, not 6 physical lines.
      expect(aggregated.totalStatements).toBe(4);
      // Union of disjoint coverage: A covers 2 stmts, B covers 2 stmts,
      // overlap is 0 → 4 covered, not max(2,2)=2.
      expect(aggregated.coveredStatements).toBe(4);
      expect(aggregated.lineRate).toBe(100);
    });
  });
});
