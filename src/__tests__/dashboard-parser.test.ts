import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { parseArtifact } from "../../website/src/services/artifactParser";

function archive(name: string, contents: string): ArrayBuffer {
  const zip = new AdmZip();
  zip.addFile(name, Buffer.from(contents));
  return Uint8Array.from(zip.toBuffer()).buffer;
}

describe("dashboard artifact parsing", () => {
  it("reads coverage from the action's ZIP format", async () => {
    const result = await parseArtifact(
      archive(
        "coverage-results.json",
        '{"lineRate":81.83,"branchRate":73.88,"totalStatements":30367,"coveredStatements":24850}',
      ),
    );
    expect(result.coverage).toMatchObject({
      lineRate: 81.83,
      branchRate: 73.88,
      totalStatements: 30367,
      coveredStatements: 24850,
    });
    // Artifacts written before per-file coverage existed stay usable.
    expect(result.coverage?.files).toEqual([]);
  });

  it("surfaces per-file coverage with line detail", async () => {
    const result = await parseArtifact(
      archive(
        "coverage-results.json",
        JSON.stringify({
          lineRate: 81.83,
          branchRate: 73.88,
          totalStatements: 30367,
          coveredStatements: 24850,
          files: [
            {
              name: "a.ts",
              path: "src/a.ts",
              statements: 60,
              coveredStatements: 60,
              conditionals: 4,
              coveredConditionals: 4,
              methods: 6,
              coveredMethods: 6,
              lineRate: 100,
              branchRate: 100,
              lines: [
                { lineNumber: 1, count: 3, type: "stmt" },
                {
                  lineNumber: 2,
                  count: 1,
                  type: "cond",
                  trueCount: 1,
                  falseCount: 0,
                },
              ],
              missingLines: [],
              partialLines: [2],
            },
            {
              name: "b.ts",
              path: "src/b.ts",
              statements: 40,
              coveredStatements: 22,
              conditionals: 4,
              coveredConditionals: 2,
              methods: 5,
              coveredMethods: 3,
              lineRate: 55,
              branchRate: 50,
            },
          ],
        }),
      ),
    );

    expect(result.coverage?.files).toMatchObject([
      {
        path: "src/a.ts",
        statements: 60,
        coveredStatements: 60,
        conditionals: 4,
        coveredConditionals: 4,
        methods: 6,
        coveredMethods: 6,
        lineRate: 100,
        branchRate: 100,
        missingLines: [],
        partialLines: [2],
        lines: [
          { lineNumber: 1, count: 3, type: "stmt" },
          {
            lineNumber: 2,
            count: 1,
            type: "cond",
            trueCount: 1,
            falseCount: 0,
          },
        ],
      },
      {
        path: "src/b.ts",
        lineRate: 55,
        branchRate: 50,
        // Older artifacts omit line detail; the dialog falls back to a summary.
        lines: [],
        missingLines: [],
        partialLines: [],
      },
    ]);
  });

  it("rejects malformed per-file coverage instead of rendering broken rows", async () => {
    await expect(
      parseArtifact(
        archive(
          "coverage-results.json",
          '{"files":[{"path":"src/a.ts","statements":"oops"}]}',
        ),
      ),
    ).rejects.toThrow();
  });

  it("surfaces malformed reports instead of returning no data", async () => {
    await expect(
      parseArtifact(archive("coverage-results.json", "{")),
    ).rejects.toThrow();
  });

  it("rejects invalid metric types before charts can crash", async () => {
    await expect(
      parseArtifact(archive("coverage-results.json", '{"lineRate":"oops"}')),
    ).rejects.toThrow();
  });

  it("reports archives without supported reports", async () => {
    await expect(
      parseArtifact(archive("unrelated.json", "{}")),
    ).rejects.toThrow();
  });
});
