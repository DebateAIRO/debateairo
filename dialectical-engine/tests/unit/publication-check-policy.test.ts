import { describe, expect, it } from "vitest";
import {
  PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW,
  PUBLICATION_CHECK_POLICY_ROW_KEY,
  publicationCheckPolicyFromValue,
  readPublicationCheckPolicy
} from "../../packages/register/src/index.js";

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
});
