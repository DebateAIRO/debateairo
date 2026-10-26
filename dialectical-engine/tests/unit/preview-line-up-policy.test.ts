/**
 * Side-by-side spec §13, addition D12 (owner 2026-10-22): the preview's line-up (the two plan rosters and the
 * thinking-level table) as one sealed DEBATE row, `previewLineUpPolicy`. This file pins the register half (SA2):
 *  1. `previewLineUpPolicyFromValue`: the owner's live table with both rosters parses, frozen;
 *  2. the strict schema (kind, exact members, a non-empty table) refuses `PREVIEW_LINE_UP_POLICY_INVALID:<detail>`, and
 *     an off-menu level keeps the thinking parser's own `PREVIEW_THINKING_LEVELS_INVALID:<detail>`, unwrapped;
 *  3. the reader asks for exactly one row of one version (the census's allowed shape), and no row reads ABSENT (null);
 *  4. `previewLineUpPolicyRow` seals canonical register JSON that re-parses to the same value (key order irrelevant);
 *  5. the row is classified DEBATE (S2's table).
 */
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  PREVIEW_LINE_UP_POLICY_ROW_KEY,
  parseCanonicalRegisterJson,
  previewLineUpPolicyFromValue,
  previewLineUpPolicyRow,
  readPreviewLineUpPolicy,
  settingsRowKind
} from "@debateai/register";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const LIVE_FREE = [GLM, DEEPSEEK];
const LIVE_PREMIUM = [GLM, DEEPSEEK, MIMO, QWEN, HAIKU];
/**
 * The owner's live table (final, 2026-10-13; memory "thinking-effort-owner-setting-2026-10-12"), pasted verbatim, as
 * SA1's test (`tests/unit/preview-line-up.test.ts`) carries it: the first settings version must seal it unchanged.
 */
const OWNER_LIVE_TABLE = JSON.parse(`{"zai-org/GLM-5.3-Flash":{"level":"high"},"deepseek-ai/DeepSeek-V4.1-Flash":{"level":"none"},"Qwen/Qwen3.8-Flash":{"level":"medium"},"XiaomiMiMo/MiMo-V2.6-Pro":{"level":"default","steps":{"pros_cons":"none","cross_exchange":"none"}},"claude-haiku-5-5":{"level":"medium","steps":{"judge_panel":"high","reviewer":"high","answer_checker":"high","story_checker":"high","answer_writer":"high","story_writer":"high","slip_fix":"medium"}}}`) as Record<string, unknown>;
const value = (change: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "PREVIEW_LINE_UP_POLICY", free_model_ids: LIVE_FREE, premium_model_ids: LIVE_PREMIUM,
  thinking_levels: OWNER_LIVE_TABLE, ...change
});
const fakePool = (rows: ReadonlyArray<{ value_json: unknown }>) => {
  const query = vi.fn(async (_text: string, _values: readonly unknown[]) => ({ rows }));
  return { pool: { query } as unknown as Pick<Pool, "query">, query };
};

describe("previewLineUpPolicyFromValue (addition D12)", () => {
  it("parses the owner's live table with both rosters, frozen", () => {
    const parsed = previewLineUpPolicyFromValue(value());
    expect(parsed).toEqual({ free_model_ids: LIVE_FREE, premium_model_ids: LIVE_PREMIUM, thinking_levels: OWNER_LIVE_TABLE });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.free_model_ids)).toBe(true);
    expect(Object.isFrozen(parsed.premium_model_ids)).toBe(true);
    expect(Object.isFrozen(parsed.thinking_levels)).toBe(true);
  });

  it("reads a null table as every AI at its row default (today's 'no table')", () => {
    expect(previewLineUpPolicyFromValue(value({ thinking_levels: null })))
      .toEqual({ free_model_ids: LIVE_FREE, premium_model_ids: LIVE_PREMIUM, thinking_levels: null });
  });

  const { kind: _kind, ...withoutKind } = value();
  const { thinking_levels: _table, ...withoutTable } = value();
  it.each([
    ["the kind missing", withoutKind, "PREVIEW_LINE_UP_POLICY_INVALID:kind"],
    ["the wrong kind", value({ kind: "PREVIEW_PROVIDER_TEST_CONFIG" }), "PREVIEW_LINE_UP_POLICY_INVALID:kind"],
    ["an extra member", value({ anthropic_budget_socket: "/run/x.sock" }), "PREVIEW_LINE_UP_POLICY_INVALID:members"],
    ["the table member missing", withoutTable, "PREVIEW_LINE_UP_POLICY_INVALID:thinking_levels"],
    ["an empty table", value({ thinking_levels: {} }), "PREVIEW_LINE_UP_POLICY_INVALID:thinking_levels"],
    ["an empty roster", value({ free_model_ids: [] }), "PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids"],
    ["a roster longer than the reviewed rows", value({ premium_model_ids: [...LIVE_PREMIUM, GLM, GLM, GLM, GLM, GLM, GLM, GLM, GLM, GLM, GLM] }),
      "PREVIEW_LINE_UP_POLICY_INVALID:premium_model_ids"],
    ["an empty model id", value({ free_model_ids: [GLM, ""] }), "PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids"],
    ["not an object", [LIVE_FREE, LIVE_PREMIUM], "PREVIEW_LINE_UP_POLICY_INVALID:value"],
    ["null", null, "PREVIEW_LINE_UP_POLICY_INVALID:value"],
    // after zod, the providers-level check (SA1's parsePreviewLineUp) names the rule a value breaks
    ["an unreviewed id", value({ free_model_ids: [GLM, "other/model"] }), "PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids:unreviewed"],
    ["a duplicate id", value({ premium_model_ids: [GLM, GLM, DEEPSEEK] }), "PREVIEW_LINE_UP_POLICY_INVALID:premium_model_ids:duplicate"],
    ["a roster pair breaking the maker rule", value({ free_model_ids: [GLM] }), "PREVIEW_LINE_UP_POLICY_INVALID:maker_rule"]
  ])("refuses %s", (_name, candidate, message) => {
    expect(() => previewLineUpPolicyFromValue(candidate)).toThrow(new TypeError(message));
  });

  it("keeps the thinking parser's own refusal for an off-menu level, unwrapped", () => {
    // Spec 2026-10-12 §2: "high" is not a Qwen value (Alibaba documents low, medium and xhigh).
    const offMenu = { ...OWNER_LIVE_TABLE, [QWEN]: { level: "high" } };
    expect(() => previewLineUpPolicyFromValue(value({ thinking_levels: offMenu })))
      .toThrow(/^PREVIEW_THINKING_LEVELS_INVALID:/u);
    let thrown: unknown;
    try { previewLineUpPolicyFromValue(value({ thinking_levels: offMenu })); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as Error).message.startsWith("PREVIEW_LINE_UP_POLICY_INVALID")).toBe(false);
  });
});

describe("readPreviewLineUpPolicy (addition D12, D14)", () => {
  it("asks for exactly one row of one version, in the census's allowed shape", async () => {
    const { pool, query } = fakePool([{ value_json: value() }]);
    const read = await readPreviewLineUpPolicy(pool, 17);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([
      "SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2",
      [17, PREVIEW_LINE_UP_POLICY_ROW_KEY]
    ]);
    expect(read).toEqual({ free_model_ids: LIVE_FREE, premium_model_ids: LIVE_PREMIUM, thinking_levels: OWNER_LIVE_TABLE });
  });

  it("reads a version without the row as ABSENT (null: the env's line-up, D14)", async () => {
    const { pool } = fakePool([]);
    await expect(readPreviewLineUpPolicy(pool, 16)).resolves.toBeNull();
  });

  it("is loud about a sealed row that does not parse", async () => {
    const { pool } = fakePool([{ value_json: value({ kind: "OTHER" }) }]);
    await expect(readPreviewLineUpPolicy(pool, 18)).rejects.toThrow("PREVIEW_LINE_UP_POLICY_INVALID:kind");
  });
});

describe("previewLineUpPolicyRow (addition D12, D23)", () => {
  it("seals canonical register JSON that re-parses to the same line-up", () => {
    const lineUp = previewLineUpPolicyFromValue(value());
    const row = previewLineUpPolicyRow(lineUp, "side-by-side spec §13 addition D12; owner 2026-10-22");
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.keys(row).sort()).toEqual(["rowKey", "sourceRef", "valueJsonText"]);
    expect(row.rowKey).toBe("previewLineUpPolicy");
    expect(row.sourceRef).toBe("side-by-side spec §13 addition D12; owner 2026-10-22");
    // Canonical: re-parsing the sealed text through the register's own parser gives the same bytes.
    expect(parseCanonicalRegisterJson(Buffer.from(row.valueJsonText, "utf8"))).toBe(row.valueJsonText);
    const sealed = JSON.parse(row.valueJsonText) as unknown;
    expect(sealed).toEqual(value());
    expect(previewLineUpPolicyFromValue(sealed)).toEqual(lineUp);
  });

  it("does not depend on the key order of the value it is handed", () => {
    const reordered = previewLineUpPolicyFromValue({
      thinking_levels: Object.fromEntries(Object.entries(OWNER_LIVE_TABLE).reverse()),
      premium_model_ids: LIVE_PREMIUM, free_model_ids: LIVE_FREE, kind: "PREVIEW_LINE_UP_POLICY"
    });
    const a = previewLineUpPolicyRow(previewLineUpPolicyFromValue(value()), "s").valueJsonText;
    const b = previewLineUpPolicyRow(reordered, "s").valueJsonText;
    expect(b).toBe(a);
  });

  it("seals a null table as null", () => {
    const row = previewLineUpPolicyRow(previewLineUpPolicyFromValue(value({ thinking_levels: null })), "s");
    expect(JSON.parse(row.valueJsonText)).toEqual(value({ thinking_levels: null }));
  });

  it("refuses a line-up the parser would refuse, and a blank source ref", () => {
    const lineUp = previewLineUpPolicyFromValue(value());
    expect(() => previewLineUpPolicyRow({ ...lineUp, free_model_ids: [GLM] }, "s"))
      .toThrow(new TypeError("PREVIEW_LINE_UP_POLICY_INVALID:maker_rule"));
    expect(() => previewLineUpPolicyRow(lineUp, " ")).toThrow(new TypeError("PREVIEW_LINE_UP_POLICY_INVALID:source_ref"));
  });
});

describe("classification (side-by-side spec §13, S2's table)", () => {
  it("is a DEBATE row: every member decides how one debate runs", () => {
    expect(PREVIEW_LINE_UP_POLICY_ROW_KEY).toBe("previewLineUpPolicy");
    expect(settingsRowKind("previewLineUpPolicy")).toBe("DEBATE");
  });
});
