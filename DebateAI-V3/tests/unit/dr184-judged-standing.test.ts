import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EvaluationSnapshot } from "@debateai/propagation";
import { projectJudgedStanding } from "@debateai/runner";
import {
  assertRequiredConditionMarkRecords,
  type ConditionMarkRecord
} from "@debateai/serve";

const snapshot: EvaluationSnapshot = {
  nodes: [
    { nodeId: "root-a", baseStrength: 0.7, parentNodeId: null },
    { nodeId: "root-b", baseStrength: 0.6, parentNodeId: null },
    { nodeId: "attacker", baseStrength: 0.8, parentNodeId: "root-a" },
    { nodeId: "hidden", baseStrength: 0.4, parentNodeId: "root-b" },
    { nodeId: "hidden-child", baseStrength: 0.3, parentNodeId: "hidden" }
  ],
  arrows: [
    { arrowId: "attack-b", sourceNodeId: "attacker", targetKind: "NODE", targetNodeId: "root-b", targetEdgeId: null, polarity: "attack", kind: "rebutting", strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "EVIDENCE_VERIFIER" },
    { arrowId: "hidden-support", sourceNodeId: "hidden-child", targetKind: "NODE", targetNodeId: "hidden", targetEdgeId: null, polarity: "support", kind: null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "EVIDENCE_VERIFIER" }
  ],
  arrowOrder: ["attack-b", "hidden-support"],
  operatorResolutions: [
    { parentNodeId: "root-b", operator: "accumulate", suppliedBy: "deployment" },
    { parentNodeId: "hidden", operator: "accumulate", suppliedBy: "deployment" }
  ],
  clusterRecords: []
};

describe("DR-184 judged-standing projection mutation ledger", () => {
  it("T8/C-4 lets a reviewed cross-root attacker confer judged basis on its target", () => {
    const projected = projectJudgedStanding(snapshot, ["attacker"]);
    expect(projected.derivedStandingNodeIds).toContain("root-b");
    expect(projected.hiddenNodeIds).not.toContain("root-b");
    expect(projected.judgedBasisCounts["root-b"]).toBe(1);
  });

  it("T8 is transitive through grandchildren", () => {
    const projected = projectJudgedStanding({
      ...snapshot,
      arrows: [],
      arrowOrder: [],
      nodes: [
        { nodeId: "root", baseStrength: 0.71, parentNodeId: null },
        { nodeId: "child", baseStrength: 0.62, parentNodeId: "root" },
        { nodeId: "grandchild", baseStrength: 0.53, parentNodeId: "child" }
      ],
      operatorResolutions: []
    }, ["grandchild"]);
    expect(projected.derivedStandingNodeIds).toEqual(expect.arrayContaining(["root", "child"]));
    expect(projected.judgedBasisCounts).toMatchObject({ root: 1, child: 1 });
  });

  it("T9/T11/T12 leaves class H as a complete excluded subtree without deletion or re-parenting", () => {
    const projected = projectJudgedStanding(snapshot, ["attacker"]);
    expect(projected.hiddenNodeIds).toEqual(expect.arrayContaining(["hidden", "hidden-child"]));
    expect(projected.snapshot.nodes.map((node) => node.nodeId)).not.toContain("hidden");
    expect(projected.snapshot.arrows.map((arrow) => arrow.arrowId)).not.toContain("hidden-support");
    expect(snapshot.nodes.find((node) => node.nodeId === "hidden-child")?.parentNodeId).toBe("hidden");
  });

  it("T10/T14 keeps class-D tau and requires its typed positive basis record", () => {
    const projected = projectJudgedStanding(snapshot, ["attacker"]);
    expect(projected.snapshot.nodes.find((node) => node.nodeId === "root-b")?.baseStrength).toBe(0.6);
    const record: ConditionMarkRecord = {
      mark: "DERIVED-STANDING-UNREVIEWED",
      scope: "node",
      subjectRef: "root-b",
      reason: "test-layer: own cross-house review missing; standing comes from judged arguments",
      liftPath: null,
      servedRootRule: null,
      affectedNodeIds: ["root-b"],
      callSiteKey: "JUDGE:review:root-b",
      terminalTransportOutcome: "FAILED",
      excludedFromServedNumber: false,
      judgedBasisCount: 1
    };
    expect(() => assertRequiredConditionMarkRecords(["DERIVED-STANDING-UNREVIEWED"], [record])).not.toThrow();
    expect(() => assertRequiredConditionMarkRecords(["DERIVED-STANDING-UNREVIEWED"], [{ ...record, judgedBasisCount: 0 }]))
      .toThrowError(expect.objectContaining({ code: "DERIVED_STANDING_RECORD_INVALID" }));
  });
});

describe("DR-184 future-number sentinel", () => {
  it("T13/C-9 fails when any shipped writer emits a measured edge", async () => {
    const sourceFiles = async (directory: string): Promise<readonly string[]> => {
      const entries = await readdir(directory, { withFileTypes: true });
      return (await Promise.all(entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
      }))).flat();
    };
    const files = (await Promise.all(["apps", "packages", "acceptance"].map(sourceFiles))).flat();
    const measuredWriter = /magnitudeStatus\s*:\s*["']MEASURED["']/;
    const knownTypeDeclaration = /^\s*readonly\s+magnitudeStatus\s*:\s*["']MEASURED["']\s*\|\s*["']UNKNOWN["']\s*;\s*$/;
    const offenders = (await Promise.all(files.map(async (file) => {
      const lines = (await readFile(file, "utf8")).split("\n");
      return lines.flatMap((line, index) => measuredWriter.test(line) && !knownTypeDeclaration.test(line)
        ? [`${file}:${index + 1}:${line.trim()}`]
        : []);
    }))).flat();
    expect(offenders).toEqual([]);
  });

  it("T15 keeps veil state node-local so a low-score descendant is not hidden by inheritance", async () => {
    const adapter = await readFile("apps/v2-ui/lib/v3/adapter.ts", "utf8");
    expect(adapter).not.toContain("inheritedHiddenReason");
    expect(adapter).toContain("const hiddenReason = ownHiddenReason");
  });
});
