/**
 * V4 start step, Task 27 (spec 2026-11-03 §4.1 "Which AIs"; plan Review Focus 3): THE LIST SEATS. Your plan's number
 * of AIs, one seat per company first, fastest first, a busy model skipped; when a plan has more seats than the line-up
 * has companies (Max's 7 against the test site's 5), a company writes a second list (its other model, else the same
 * model again, marked "#2"), never more than two to a company. The merge's Haiku seat is named whatever the roster.
 */
import { describe, expect, it } from "vitest";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS, parseProviderDiscoveryTargets, previewModelRow, previewTargetJsonRow, type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  START_SEAT_SPEED_ORDER, createStartBusyBook, startModelOfSeat, startSeatsFor
} from "../../apps/api/src/start-step/seats.js";

const HAIKU = "claude-haiku-5-5";
const GLM = "zai-org/GLM-5.3-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";

const TARGETS: readonly ProviderDiscoveryTarget[] = parseProviderDiscoveryTargets(
  JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)),
  PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  }));
const targetOf = (model: string) => TARGETS.find((target) => target.model === model) ?? null;
const seats = (roster: readonly string[], count: number, busy: ReadonlySet<string> = new Set()) =>
  startSeatsFor({ roster, targetOf, count, busy });
const refs = (picked: ReturnType<typeof seats>) => picked.seats.map((seat) => seat.aiRef);

describe("the list seats (spec 2026-11-03 §4.1, S5)", () => {
  it("the order measured on real AIs (Task 91 Step 4, the sitting of 9 Nov, the owner's yes): Haiku, DeepSeek, Qwen, GLM, MiMo", () => {
    expect(START_SEAT_SPEED_ORDER).toEqual([HAIKU, DEEPSEEK, QWEN, GLM, MIMO]);
    expect(Object.isFrozen(START_SEAT_SPEED_ORDER)).toBe(true);
  });

  it("Max's 7 on five companies: one seat each, fastest first, then Haiku and DeepSeek again; the Haiku seat named", () => {
    const max = seats([GLM, DEEPSEEK, MIMO, QWEN, HAIKU], 7);
    expect(refs(max)).toEqual([HAIKU, DEEPSEEK, QWEN, GLM, MIMO, `${HAIKU}#2`, `${DEEPSEEK}#2`]);
    expect(max.seats.map((seat) => seat.maker)).toEqual(["Anthropic", "DeepSeek", "Alibaba", "Z.AI", "Xiaomi", "Anthropic", "DeepSeek"]);
    expect(max.haiku).toEqual({ aiRef: HAIKU, maker: "Anthropic" });
  });

  it("the first seats of the speed order per plan's number: Free 2, Plus 4, Pro 5", () => {
    const all = [HAIKU, GLM, QWEN, DEEPSEEK, MIMO];
    expect(refs(seats(all, 2))).toEqual([HAIKU, DEEPSEEK]);
    expect(refs(seats(all, 4))).toEqual([HAIKU, DEEPSEEK, QWEN, GLM]);
    expect(refs(seats(all, 5))).toEqual([HAIKU, DEEPSEEK, QWEN, GLM, MIMO]);
  });

  it("Free's two list seats on the lean Free line-up (GLM, DeepSeek, Qwen, Haiku) are Haiku and DeepSeek, the two fastest measured", () => {
    expect(refs(seats([GLM, DEEPSEEK, QWEN, HAIKU], 2))).toEqual([HAIKU, DEEPSEEK]);
  });

  it("a busy model is skipped, and the next company takes its place", () => {
    expect(refs(seats([HAIKU, GLM, QWEN, DEEPSEEK, MIMO], 4, new Set([QWEN])))).toEqual([HAIKU, DEEPSEEK, GLM, MIMO]);
    expect(refs(seats([HAIKU, GLM, QWEN, DEEPSEEK, MIMO], 7, new Set([QWEN])))).toEqual([HAIKU, DEEPSEEK, GLM, MIMO, `${HAIKU}#2`, `${DEEPSEEK}#2`, `${GLM}#2`]);
  });

  it("a company's second seat is its other model when the roster has one, and only then the same model marked #2", () => {
    // Wave 2 review fix (Task 27): no line-up above has two models of one company. A made-up second Anthropic model,
    // declared for this test only (Haiku's target under another model id).
    const OTHER = "claude-fixture-second-model";
    const haikuTarget = targetOf(HAIKU)!;
    const withOther = (model: string) => model === OTHER ? Object.freeze({ ...haikuTarget, model: OTHER }) : targetOf(model);
    const three = startSeatsFor({ roster: [HAIKU, OTHER, GLM], targetOf: withOther, count: 3, busy: new Set() });
    expect(refs(three)).toEqual([HAIKU, GLM, OTHER]);
    expect(three.seats.map((seat) => seat.maker)).toEqual(["Anthropic", "Z.AI", "Anthropic"]);
    expect(refs(startSeatsFor({ roster: [HAIKU, OTHER, GLM], targetOf: withOther, count: 9, busy: new Set() })))
      .toEqual([HAIKU, GLM, OTHER, `${GLM}#2`]);
  });

  it("9 asked of two companies: at most two seats a company, so 4", () => {
    expect(refs(seats([GLM, HAIKU], 9))).toEqual([HAIKU, GLM, `${HAIKU}#2`, `${GLM}#2`]);
  });

  it("the Haiku seat whatever the roster; none when no Haiku target is declared; a model not declared is no seat", () => {
    const glmOnly = seats([GLM], 2);
    expect(refs(glmOnly)).toEqual([GLM, `${GLM}#2`]);
    expect(glmOnly.haiku).toEqual({ aiRef: HAIKU, maker: "Anthropic" });
    const undeclared = startSeatsFor({ roster: [HAIKU, GLM], targetOf: (model) => model === HAIKU ? null : targetOf(model), count: 3, busy: new Set() });
    expect(refs(undeclared)).toEqual([GLM, `${GLM}#2`]);
    expect(undeclared.haiku).toBeNull();
    expect(refs(seats([], 4))).toEqual([]);
  });

  it("a seat's model: the second seat's mark stripped", () => {
    expect(startModelOfSeat(`${GLM}#2`)).toBe(GLM);
    expect(startModelOfSeat(GLM)).toBe(GLM);
    expect(startModelOfSeat(`${HAIKU}#2`)).toBe(HAIKU);
  });

  it("the busy book: a model marked busy sits out for two minutes, then comes back", () => {
    let now = 1_000;
    const book = createStartBusyBook({ now: () => now });
    book.mark(QWEN);
    expect([...book.busy()]).toEqual([QWEN]);
    now += 119_999;
    expect(book.busy().has(QWEN)).toBe(true);
    now += 1;
    expect(book.busy().has(QWEN)).toBe(false);
    const short = createStartBusyBook({ now: () => now, busyMs: 10 });
    short.mark(GLM);
    now += 10;
    expect(short.busy().size).toBe(0);
  });
});
