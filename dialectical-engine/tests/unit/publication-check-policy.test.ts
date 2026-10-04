import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW,
  PUBLICATION_CHECK_POLICY_ROW_KEY,
  publicationCheckPolicyFromValue,
  readPublicationCheckPolicy
} from "../../packages/register/src/index.js";
import {
  hostedRegisterRefusalCode,
  parseHostedRegisterFile,
  planHostedRegisterPublication
} from "../../apps/runner/src/hosted-register-publish.js";

const row = PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW;
const codeOf = async (run: () => unknown): Promise<string> => {
  try {
    await run();
    return "NO_REFUSAL";
  } catch (error) {
    return (error as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("publicationCheckPolicy: the pre-publish check's deadline D as a register row (owner, 2026-10-04)", () => {
  it("is a code-owned row holding SPEC-v2 R7's 60-second cap", () => {
    expect(PUBLICATION_CHECK_POLICY_ROW_KEY).toBe("publicationCheckPolicy");
    expect(row.rowKey).toBe("publicationCheckPolicy");
    const policy = publicationCheckPolicyFromValue(row.value, row.sourceRef);
    expect(policy).toEqual({ deadlineMs: 60_000 });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it("accepts whole milliseconds from 1 000 to 60 000 and refuses everything else", async () => {
    const valueOf = (deadline: unknown) => ({ kind: "PUBLICATION_CHECK_POLICY", deadline_ms: deadline });
    expect(publicationCheckPolicyFromValue(valueOf(1_000), "x").deadlineMs).toBe(1_000);
    expect(publicationCheckPolicyFromValue(valueOf(60_000), "x").deadlineMs).toBe(60_000);
    for (const deadline of [60, 999, 60_001, 0, -1, 1_500.5, "60000", null]) {
      expect(await codeOf(() => publicationCheckPolicyFromValue(valueOf(deadline), "x")), String(deadline))
        .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    }
    expect(await codeOf(() => publicationCheckPolicyFromValue({ ...row.value, extra: 1 }, "x")))
      .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    expect(await codeOf(() => publicationCheckPolicyFromValue({ deadline_ms: 60_000 }, "x")))
      .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    expect(await codeOf(() => publicationCheckPolicyFromValue(null, "x"))).toBe("PUBLICATION_CHECK_POLICY_INVALID");
    expect(await codeOf(() => publicationCheckPolicyFromValue(row.value, " "))).toBe("PUBLICATION_CHECK_POLICY_INVALID");
  });

  it("reads the row at the pinned version, and refuses a version without it by name", async () => {
    const asked: unknown[][] = [];
    const pool = (value: unknown) => ({
      query: async (_text: string, parameters: unknown[]) => {
        asked.push(parameters);
        return { rows: value === null ? [] : [{ value_json: value, source_ref: "v1" }] };
      }
    }) as never;
    expect(await readPublicationCheckPolicy(pool(row.value), 7)).toEqual({ deadlineMs: 60_000 });
    expect(asked).toEqual([[7, "publicationCheckPolicy"]]);
    expect(await codeOf(() => readPublicationCheckPolicy(pool(null), 7))).toBe("PUBLICATION_CHECK_POLICY_UNRESOLVED");
  });

  it("is sealed by every hosted publication, and the operator's file may supersede it", async () => {
    const example = JSON.parse(await readFile(
      new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const plan = async (file: unknown) =>
      planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(file))));
    const sealedIn = async (file: unknown) =>
      (await plan(file)).rows.filter((candidate) => candidate.rowKey === "publicationCheckPolicy");
    // The kit's example leaves the member out, so a file copied from it seals the code-owned row, under its provenance.
    expect(Object.hasOwn(example, "publicationCheckPolicy")).toBe(false);
    const defaulted = await sealedIn(example);
    expect(defaulted).toHaveLength(1);
    expect(JSON.parse(defaulted[0]!.valueJsonText)).toEqual(row.value);
    expect(defaulted[0]!.sourceRef).toBe(row.sourceRef);
    // The operator's member supersedes it, sealed under the file's own sourceRef.
    const supplied = await sealedIn({ ...example, publicationCheckPolicy: { kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 45_000 } });
    expect(supplied).toHaveLength(1);
    expect(JSON.parse(supplied[0]!.valueJsonText)).toEqual({ kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 45_000 });
    expect(supplied[0]!.sourceRef).toBe(example.sourceRef);
    const refusalOf = async (file: unknown): Promise<string> => {
      try {
        await plan(file);
        return "NO_REFUSAL";
      } catch (error) {
        return hostedRegisterRefusalCode(error);
      }
    };
    expect(await refusalOf({ ...example, publicationCheckPolicy: { kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 60_001 } }))
      .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    expect(await refusalOf({ ...example, publicationCheckPolicy: { kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 60 } }))
      .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    // A member present with JSON null is not "left out": it is refused, never defaulted.
    expect(await refusalOf({ ...example, publicationCheckPolicy: null })).toBe("PUBLICATION_CHECK_POLICY_INVALID");
    // The runbooks name the member, the refusals and the upgrade order.
    const registerReadme = await readFile(new URL("../../deploy/vps/register/README.md", import.meta.url), "utf8");
    expect(registerReadme).toContain("| `publicationCheckPolicy` |");
    expect(registerReadme).toContain("Left out, the code-owned `publicationCheckPolicy` row is published unchanged");
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    for (const needle of ["| `publicationCheckPolicy` |", "`PUBLICATION_CHECK_POLICY_UNRESOLVED`",
      "| `PUBLICATION_CHECK_POLICY_INVALID` |", "### Upgrading to the publication-check deadline release",
      "pnpm hosted:publish-provider-set"]) expect(readme, needle).toContain(needle);
  });
});
