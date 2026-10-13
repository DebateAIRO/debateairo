// Slow answer (owner ruling, 2026-10-12). A MiMo-V2.6-Pro verdict-story call ran past 600 s: the gate halted and the
// app gave up at the same 600 s. MiMo's speed swings between 17 and 50 tokens a second, and a story reply is normally
// 3,500-8,400 tokens. The ruling: (2) the gate's vendor deadline becomes 1,200 s (its reply timeout that plus 30 s),
// and the app waits longer than the gate, so the GATE decides when a call has taken too long; (3) on the preview the
// storyteller asks for its row's whole answer cap only on the fast rows (DeepSeek, Claude Haiku), and for 16,384
// tokens on the slower ones (MiMo, Qwen, GLM): a reviewed per-row field next to the row's answer cap.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PREVIEW_GATE_IPC_TIMEOUT_MS,
  PREVIEW_GLM_DEADLINE_MS,
  PREVIEW_MODEL_ROWS,
  PREVIEW_REMAINING_TIMEOUT_MS,
  parsePreviewProviderTestConfig,
  previewCallBound,
  previewModelRow,
  previewStorytellerTokenCeiling
} from "@debateai/providers";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN],
  requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "slow-answer"
}))!;

/** A whole-number constant read out of a source file by its exact `NAME = value` line (the gate's own copy). */
function sourceNumber(path: string, name: string): number {
  const text = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const match = new RegExp(`^${name} = ([0-9]+(?:\\.[0-9]+)?)(?: +#.*)?$`, "mu").exec(text);
  if (match === null) throw new Error(`${name} not found in ${path}`);
  return Number(match[1]);
}

describe("(2) time: the gate, not the app, decides when a call has taken too long", () => {
  /** The owner's ruling: the gate gives the vendor 1,200 s; it answers the app at most 30 s later. */
  const GATE_CALL_DEADLINE_SECONDS = 1200;
  const GATE_REPLY_MARGIN_SECONDS = 30;

  it("the app's preview call deadline is 1,260 s: the gate's 1,200 s, its 30 s reply margin, and 30 s more", () => {
    expect(PREVIEW_GLM_DEADLINE_MS).toBe(1_260_000);
    expect(PREVIEW_GLM_DEADLINE_MS).toBeGreaterThan((GATE_CALL_DEADLINE_SECONDS + GATE_REPLY_MARGIN_SECONDS) * 1000);
    // Every preview call bound carries it, whatever the register sealed.
    expect(previewCallBound({ maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 60_000 }, CONFIG).deadlineMs).toBe(PREVIEW_GLM_DEADLINE_MS);
    expect(previewCallBound({ maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 60_000 }, undefined).deadlineMs).toBe(60_000);
  });

  it("the gate socket's own timeout outlasts the app's deadline, so the app's abort always speaks first", () => {
    expect(PREVIEW_GATE_IPC_TIMEOUT_MS).toBe(PREVIEW_GLM_DEADLINE_MS + 30_000);
    expect(PREVIEW_GATE_IPC_TIMEOUT_MS).toBeGreaterThan(PREVIEW_GLM_DEADLINE_MS);
    // The read-only /remaining stays a quick local read, never a vendor call.
    expect(PREVIEW_REMAINING_TIMEOUT_MS).toBeLessThan(PREVIEW_GLM_DEADLINE_MS);
  });

  it("matches the gate's own constants: the gate's vendor deadline is inside the app's, and it holds the app's socket as long as the app does", () => {
    const authority = "packages/providers/ops/preview_budget_authority.py";
    const callDeadline = sourceNumber(authority, "CALL_DEADLINE_SECONDS");
    const replyTimeout = sourceNumber(authority, "REPLY_TIMEOUT_SECONDS");
    expect(callDeadline).toBe(GATE_CALL_DEADLINE_SECONDS);
    expect(sourceNumber("packages/providers/ops/preview_budget_helper.py", "MAX_TIMEOUT_SECONDS")).toBeGreaterThanOrEqual(callDeadline);
    expect(PREVIEW_GLM_DEADLINE_MS).toBeGreaterThan((callDeadline + GATE_REPLY_MARGIN_SECONDS) * 1000);
    // The gate's timeout on the app's connection is the app's own socket timeout: neither side drops a call the other still waits for.
    expect(replyTimeout * 1000).toBe(PREVIEW_GATE_IPC_TIMEOUT_MS);
  });

  it("the practice relay keeps a quiet connection open longer than the gate takes to answer and the app waits", () => {
    const idle = sourceNumber("tools/preview-practice/gate-relay.py", "DEFAULT_IDLE_TIMEOUT_SECONDS");
    const drain = sourceNumber("tools/preview-practice/gate-relay.py", "DEFAULT_DRAIN_SECONDS");
    expect(idle).toBe(1500);
    expect(idle * 1000).toBeGreaterThan(PREVIEW_GATE_IPC_TIMEOUT_MS);
    // An in-flight call at the relay's lifetime end (or on a stop) gets as long as the app would wait for it.
    expect(drain * 1000).toBeGreaterThan(PREVIEW_GATE_IPC_TIMEOUT_MS);
  });
});

describe("(3) the storyteller's allowance is a reviewed per-row field, smaller on the slower rows", () => {
  const expected: Readonly<Record<string, number>> = { [GLM]: 16_384, [DEEPSEEK]: 32_768, [MIMO]: 16_384, [QWEN]: 16_384, [HAIKU]: 32_768 };

  it("MiMo, Qwen and GLM: 16,384; DeepSeek and Claude Haiku: their whole 32,768 cap", () => {
    expect(Object.fromEntries(PREVIEW_MODEL_ROWS.map((row) => [row.model, row.storytellerTokenCeiling]))).toEqual(expected);
  });

  it("never above the row's answer cap, never below the preview's generation floor", () => {
    for (const row of PREVIEW_MODEL_ROWS) {
      expect(Number.isSafeInteger(row.storytellerTokenCeiling)).toBe(true);
      expect(row.storytellerTokenCeiling).toBeLessThanOrEqual(row.outputBound);
      expect(row.storytellerTokenCeiling).toBeGreaterThanOrEqual(8192);
    }
  });

  it("previewStorytellerTokenCeiling is the row's own field", () => {
    for (const model of Object.keys(expected)) {
      expect(previewStorytellerTokenCeiling(previewModelRow(model)!)).toBe(expected[model]);
    }
  });
});
