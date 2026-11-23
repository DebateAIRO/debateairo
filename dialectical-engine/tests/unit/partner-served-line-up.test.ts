/**
 * A model DeepInfra forwards to a partner company it does not name (its "Partner" tag) is never seated by a new settings
 * version, and the Provider Register, the Privacy Policy and the Terms name no such partner. This file pins both halves
 * and the tie between them:
 *  1. the mark: Qwen3.8-Flash's preview row is `partnerServed`, the other rows are not; its row, prices and maker stay,
 *     so debates already recorded with it read and price as before;
 *  2. the Register carries a partner entry if and only if a model a new version may seat is partner-served (today: none),
 *     and its DeepInfra row lists exactly the DeepInfra models a new version may seat;
 *  3. sealing refuses: the line-up row builder, the publish kit's carried line-up row and its answer seats;
 *  4. reading does not: a sealed version that seats Qwen still parses and composes, so a debate admitted on it finishes;
 *  5. check-version's condition 6 names such a version (SETTINGS_GATE_PARTNER_SERVED:<model>);
 *  6. the English legal texts and catalogue say nothing about a partner of DeepInfra.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PREVIEW_MODEL_ROWS, PREVIEW_PROVIDER_REF_MODELS, assertPreviewLineUpSeatable, composePreviewProviderTestConfig,
  parsePreviewEnvironmentConfig, parsePreviewLineUp, previewModelRow, previewModelRowForRef, previewModelSeatable,
  previewPartnerServedSeatRefs, previewSeatableModels, resolvePreviewLineUp
} from "@debateai/providers";
import {
  previewLineUpPolicyFromValue, previewLineUpPolicyRow, settingsGatePartnerServedCodes, settingsGateUnreviewedCodes
} from "@debateai/register";
import { DEEPINFRA_PROVIDER, PREVIEW_DEEPINFRA_MODELS, legalRegister, providerRegister } from "../../apps/ui/lib/legal/pages.js";
import { PREVIEW_MODEL_MAKERS } from "../../apps/ui/lib/previewPlanRoster.js";
import { previewAnswerSeatRefs } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const QWEN_REF = "preview:qwen-3-8-flash";
/** The line-up the live site runs once Qwen is out: GLM and DeepSeek on Free; GLM, DeepSeek, MiMo and Haiku on Premium. */
const WITHOUT_QWEN = Object.freeze({ free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, HAIKU], thinking_levels: null });
/** The line-up the site ran before: the same with Qwen on Premium. */
const WITH_QWEN = Object.freeze({ free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU], thinking_levels: null });
/** A sealed previewLineUpPolicy value, as an older code sealed it (this code's builder refuses Qwen). */
const sealedValue = (lineUp: Readonly<{ free_model_ids: readonly string[]; premium_model_ids: readonly string[] }>) =>
  ({ kind: "PREVIEW_LINE_UP_POLICY", free_model_ids: [...lineUp.free_model_ids], premium_model_ids: [...lineUp.premium_model_ids], thinking_levels: null });
const GATE = Object.freeze({ deployment: "v3-preview", requested_thinking_level: "high", scope_id: "preview-test",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock" });

describe("the partner-served mark on the preview rows", () => {
  it("marks Qwen3.8-Flash alone; every other reviewed row may be seated", () => {
    expect(PREVIEW_MODEL_ROWS.filter((row) => row.partnerServed === true).map((row) => row.model)).toEqual([QWEN]);
    for (const row of PREVIEW_MODEL_ROWS) expect(previewModelSeatable(row.model), row.model).toBe(row.model !== QWEN);
    expect(previewModelSeatable("vendor/Unknown-1")).toBe(false);
    expect(previewModelSeatable(undefined)).toBe(false);
  });

  it("keeps Qwen's row, prices, maker and ref, so debates recorded with it still read, show and price as before", () => {
    expect(previewModelRow(QWEN)).toMatchObject({ provider: "deepinfra", maker: "Alibaba", inputUsdPerM: "0.113", outputUsdPerM: "0.382",
      efforts: ["default", "low", "medium", "none"], sampling: { temperature: 0.6, top_p: 0.95, top_k: 20 } });
    expect(PREVIEW_PROVIDER_REF_MODELS[QWEN_REF]).toBe(QWEN);
    expect(previewModelRowForRef(QWEN_REF)?.model).toBe(QWEN);
    // The website's own copy of the makers keeps it too (the maker label of a recorded debate).
    expect(PREVIEW_MODEL_MAKERS[QWEN]).toBe("Alibaba");
  });
});

describe("the Provider Register follows the mark", () => {
  const seatablePartnerServed = PREVIEW_MODEL_ROWS.filter((row) => row.partnerServed === true && previewModelSeatable(row.model));
  const registers = [null, [], ["deepinfra"], ["anthropic", "deepinfra", "amazon"]] as const;

  it("carries an entry for a partner of DeepInfra if and only if a model a new version may seat is partner-served", () => {
    for (const companies of registers) {
      const keys = legalRegister(companies === null ? null : [...companies]).map((entry) => entry.key);
      expect(keys.some((key) => key.includes("partner")), String(companies)).toBe(seatablePartnerServed.length > 0);
    }
    expect(seatablePartnerServed).toEqual([]);
  });

  it("lists under DeepInfra exactly the DeepInfra models a new version may seat", () => {
    const seatableDeepInfra = PREVIEW_MODEL_ROWS.filter((row) => row.provider === "deepinfra" && previewModelSeatable(row.model)).map((row) => row.model);
    expect(PREVIEW_DEEPINFRA_MODELS.map(([id]) => id)).toEqual(seatableDeepInfra);
    expect(DEEPINFRA_PROVIDER.models).toBe("GLM-5.3-Flash (Z.AI), DeepSeek-V4.1-Flash (DeepSeek), MiMo-V2.6-Pro (Xiaomi)");
    expect(providerRegister(["deepinfra"]).map((entry) => entry.key)).toEqual(["deepinfra", "perplexity", "support"]);
  });

  it("the English catalogue says nothing about a partner of DeepInfra", () => {
    const legal = JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages/en/legal.json"), "utf8")) as Record<string, string>;
    expect(Object.keys(legal).filter((key) => /partner/iu.test(key))).toEqual([]);
    expect(legal["legal.providers.locationDeepInfra"]).toBe("The United States only");
    expect(legal["legal.providers.retentionDeepInfra"]).toBe("Not stored. DeepInfra holds the text in memory only while it answers a "
      + "request, then deletes it. Its logs hold request details such as the time and the cost, never the text");
    for (const [key, text] of Object.entries(legal).filter(([key]) => key.startsWith("legal.providers."))) {
      expect(text, key).not.toMatch(/partner/iu);
    }
  });

  it("the English Privacy Policy and Terms name no partner of DeepInfra and no company left unconfirmed for training", () => {
    for (const file of ["privacy-policy.md", "terms-of-service.md"]) {
      const whole = readFileSync(resolve(process.cwd(), "apps/ui/legal/en", file), "utf8");
      // Section 14's change summary says what 1.1 no longer says; the rest of the text says nothing about a partner.
      const summary = /^.*Version 1\.1 replaced version 1\.0: it no longer says that DeepInfra passes one model's requests to a partner company it does not name.*$/mu;
      expect(whole, file).toMatch(summary);
      const text = whole.replace(summary, "");
      expect(text, file).not.toMatch(/partner/iu);
      expect(text, file).not.toContain("which it does not name");
      expect(text, file).not.toContain("for which company we have not confirmed");
      expect(text, file).toContain("DeepInfra runs these models on its own servers in the United States");
    }
  });
});

describe("sealing a new version refuses a partner-served model", () => {
  it("the line-up rule names the roster that seats one, the free list first", () => {
    expect(() => assertPreviewLineUpSeatable(WITHOUT_QWEN)).not.toThrow();
    expect(() => assertPreviewLineUpSeatable(WITH_QWEN)).toThrow("PREVIEW_LINE_UP_POLICY_INVALID:premium_model_ids:partner_served");
    expect(() => assertPreviewLineUpSeatable({ free_model_ids: [QWEN, GLM], premium_model_ids: [QWEN, GLM] }))
      .toThrow("PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids:partner_served");
    // An entry in the thinking table seats nothing: only the two lists are asked.
    expect(() => assertPreviewLineUpSeatable(parsePreviewLineUp({ ...WITHOUT_QWEN, thinking_levels: { [QWEN]: { level: "low" } } }))).not.toThrow();
  });

  it("the row builder refuses it, and seals the line-up without it", () => {
    expect(() => previewLineUpPolicyRow(parsePreviewLineUp(WITH_QWEN), "test")).toThrow("PREVIEW_LINE_UP_POLICY_INVALID:premium_model_ids:partner_served");
    const row = previewLineUpPolicyRow(parsePreviewLineUp(WITHOUT_QWEN), "test");
    expect(previewLineUpPolicyFromValue(JSON.parse(row.valueJsonText))).toEqual(WITHOUT_QWEN);
  });

  it("the publish kit refuses Qwen as an answer seat, and keeps every other reviewed seat", () => {
    expect(previewPartnerServedSeatRefs(["preview:fixture-a", QWEN_REF, "preview:deepseek-v4-1-flash", QWEN_REF])).toEqual([QWEN_REF]);
    for (const seats of [{ writer: QWEN_REF, checker: "preview:fixture-b" }, { writer: "preview:fixture-a", checker: QWEN_REF },
      { writer: "preview:fixture-a", checker: "preview:fixture-b", storyteller: QWEN_REF }]) {
      expect(() => previewAnswerSeatRefs(seats), JSON.stringify(seats)).toThrow("PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seat-partner-served");
    }
    expect(previewAnswerSeatRefs({ writer: "preview:claude-haiku-5-5", checker: "preview:deepseek-v4-1-flash" })).toEqual({
      synthesizerRoleRef: "preview:claude-haiku-5-5", evaluatorRoleRef: "preview:deepseek-v4-1-flash",
      storytellerRoleRef: "preview:claude-haiku-5-5", storyCheckerRoleRef: "preview:deepseek-v4-1-flash" });
  });
  // The kits' refusal of a CARRIED line-up row that seats Qwen (the upload's SB3 and the practice's next version) is
  // pinned with a whole register in tests/unit/preview-register-publish-v3.test.ts.
});

describe("reading a sealed version that seats Qwen still works, so debates admitted on it finish", () => {
  it("the row reader and the line-up parser accept it", () => {
    expect(previewLineUpPolicyFromValue(sealedValue(WITH_QWEN))).toEqual(WITH_QWEN);
    expect(parsePreviewLineUp(WITH_QWEN)).toEqual(WITH_QWEN);
  });

  it("the runner's and the API's one resolution rule composes its config", () => {
    const preview = parsePreviewEnvironmentConfig(JSON.stringify(GATE));
    const config = resolvePreviewLineUp({ preview, row: parsePreviewLineUp(WITH_QWEN), isSiteVersion: false });
    expect(config?.premium_model_ids).toEqual(WITH_QWEN.premium_model_ids);
    expect(composePreviewProviderTestConfig(preview!.gate, parsePreviewLineUp(WITH_QWEN)).premium_model_ids).toContain(QWEN);
  });
});

describe("check-version's condition 6 names a version that seats a partner-served model", () => {
  const seatable = (lineUp: typeof WITH_QWEN, seatRefs: readonly string[]) =>
    previewSeatableModels({ lineUp: parsePreviewLineUp(lineUp), seatRefs, declaredModels: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU] });
  const SEATS = ["preview:fixture-a", "preview:deepseek-v4-1-flash"];

  it("in a list of AIs", () => {
    expect(settingsGatePartnerServedCodes({ seatable: seatable(WITH_QWEN, SEATS) })).toEqual([`SETTINGS_GATE_PARTNER_SERVED:${QWEN}`]);
    expect(settingsGatePartnerServedCodes({ seatable: seatable(WITHOUT_QWEN, SEATS) })).toEqual([]);
  });

  it("in an answer seat", () => {
    expect(settingsGatePartnerServedCodes({ seatable: seatable(WITHOUT_QWEN, ["preview:fixture-a", QWEN_REF]) }))
      .toEqual([`SETTINGS_GATE_PARTNER_SERVED:${QWEN}`]);
  });

  it("leaves an unreviewed model or ref to SETTINGS_GATE_UNREVIEWED", () => {
    const entries = ["unreviewed-ref:preview:never", "vendor/Dropped-1", GLM];
    expect(settingsGatePartnerServedCodes({ seatable: entries })).toEqual([]);
    expect(settingsGateUnreviewedCodes({ seatable: entries, lineUp: null })).toEqual(["SETTINGS_GATE_UNREVIEWED:preview:never", "SETTINGS_GATE_UNREVIEWED:vendor/Dropped-1"]);
  });

  it("is a step of the runner half of the check", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/runner/src/settings-check.ts"), "utf8");
    expect(source).toContain('name: "gate-models-partner-served"');
    expect(source).toContain("settingsGatePartnerServedCodes({ seatable: (await seatableOf()).seatable })");
  });
});
