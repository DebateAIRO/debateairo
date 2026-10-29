import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBootstrapRegister } from "@debateai/register";
import { buildPreviewSourceRows } from "../../deploy/preview-auth-dev/v1/publish-register.js";
import { buildPreviewSourceRowsV2, PREVIEW_SOURCE_ROW_KEYS_V2 } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";

const runtime = {
  nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40),
  sourceTree: "b".repeat(40), operatorSha256: "c".repeat(64), observedAt: "2026-10-10T12:00:00.000Z"
};
const read = (path: string) => readFileSync(path, "utf8");

describe("S04 question-check register publication", () => {
  it("seals the code-owned 15000 ms row in the development and preview v1 sources", async () => {
    const rows = await buildPreviewSourceRows(await loadBootstrapRegister(), runtime);
    const row = rows.find(candidate => candidate.rowKey === "questionCheckPolicy");
    expect(row && JSON.parse(row.valueJsonText)).toEqual({ kind: "QUESTION_CHECK_POLICY", deadline_ms: 15_000 });
    expect(row?.sourceRef).toContain("synthesis-flag S04-R8");
  });

  it("carries the same row through the preview v2 source closure", async () => {
    const rows = await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).toContain("questionCheckPolicy");
    expect(rows.filter(row => row.rowKey === "questionCheckPolicy")).toHaveLength(1);
  });

  it("accepts a hosted file member and replaces its code-owned twin after validation", () => {
    const source = read("apps/runner/src/hosted-register-publish.ts");
    expect(source).toContain('"questionCheckPolicy",');
    expect(source).toContain("questionCheckPolicyFromValue(file.questionCheckPolicy, file.sourceRef)");
    expect(source).toContain("operatorRows.set(QUESTION_CHECK_POLICY_ROW_KEY");
  });

  it("names the optional member, refusal and startup row in the operator runbooks", () => {
    const member = read("deploy/vps/register/README.md");
    const runbook = read("deploy/vps/README.md");
    expect(member).toContain("| `questionCheckPolicy` |");
    expect(member).toContain("Left out, the code-owned `questionCheckPolicy` row is published unchanged");
    expect(runbook).toContain("| `QUESTION_CHECK_POLICY_INVALID` |");
    expect(runbook).toContain("QUESTION_CHECK_POLICY_UNRESOLVED");
    expect(runbook).toContain("Five rows is the pass");
  });
});
