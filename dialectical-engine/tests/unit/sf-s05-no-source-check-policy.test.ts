import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  parseSupportNoSourceCheckPolicy,
  readSupportNoSourceCheckPolicy,
  supportNoSourceCheckPolicyRow,
  supportNoSourceCheckPolicyStartValues
} from "../../packages/register/src/support-no-source-check-policy.js";

const valid = { kind: "SUPPORT_NO_SOURCE_CHECK_POLICY", version: 1, timeoutMs: 8000 } as const;

describe("S05 no-source check policy", () => {
  it("reads an absent row as null", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(readSupportNoSourceCheckPolicy({ query } as unknown as Pick<Pool, "query">, 12)).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      "SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2",
      [12, "supportNoSourceCheckPolicy"]
    );
  });

  it("starts with the exact 15-second policy", () => {
    expect(supportNoSourceCheckPolicyStartValues()).toEqual({
      kind: "SUPPORT_NO_SOURCE_CHECK_POLICY", version: 1, timeoutMs: 15000
    });
  });

  it("parses an eight-second policy", () => {
    expect(parseSupportNoSourceCheckPolicy(valid)).toEqual(valid);
  });

  it.each([999, 15001])("refuses timeoutMs %d with its field path", (timeoutMs) => {
    expect(() => parseSupportNoSourceCheckPolicy({ ...valid, timeoutMs }))
      .toThrow(new TypeError("SUPPORT_NO_SOURCE_CHECK_POLICY_INVALID:timeoutMs"));
  });

  it("refuses an extra key", () => {
    expect(() => parseSupportNoSourceCheckPolicy({ ...valid, extra: true }))
      .toThrow(new TypeError("SUPPORT_NO_SOURCE_CHECK_POLICY_INVALID:extra"));
  });

  it("refuses another policy kind", () => {
    expect(() => parseSupportNoSourceCheckPolicy({ ...valid, kind: "QUESTION_LANGUAGE_POLICY" }))
      .toThrow(new TypeError("SUPPORT_NO_SOURCE_CHECK_POLICY_INVALID:kind"));
  });

  it("seals a row that re-parses to the same policy", () => {
    const row = supportNoSourceCheckPolicyRow(valid, "fixture-source");
    expect(row.rowKey).toBe("supportNoSourceCheckPolicy");
    expect(row.sourceRef).toBe("fixture-source");
    expect(parseSupportNoSourceCheckPolicy(JSON.parse(row.valueJsonText))).toEqual(valid);
  });
});
