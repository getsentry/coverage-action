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
