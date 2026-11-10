/**
 * V4 start step, Task 84 (plan Global Constraints "Public repo"; spec 2026-11-03 §8): THE PRIVATE FIGURES READER. The
 * end-to-end world and the rehearsal may read the owner's own files, outside the repository, through two variables:
 * DEBATEAI_PRIVATE_GATE_FIGURES (each gate's pot, posts, calls and models) and DEBATEAI_PRIVATE_REGISTER_EXPORT (the
 * release's register export). Absent, a check prints "not checked" and skips. A file that does not read names the field
 * that is wrong and never its value, and a refusal compares a need with a pot only as a share ("about 1.1 times the
 * pot"), so no figure ever reaches a log. Every figure here is made up, in multiples of eleven, far from any real pot.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PRIVATE_NOT_CHECKED, RELEASE_ANTHROPIC_CALLS_AT_ONCE, privateWorldGates, privateWorldHostedBilling, readPrivateGateFigures, readPrivateRegisterExport, shareOfPot
} from "../support/private-figures.js";

const GATE = Object.freeze({
  daily_budget_usd: "11", max_paid_posts_per_day: 1111, max_concurrent_calls: 22, final_writer_max_in_flight: 11,
  largest_reservation_usd: "1.1", largest_final_writer_reservation_usd: "2.2", enabled_models: ["made-up/model-a", "made-up/model-b"]
});
const GOOD = Object.freeze({
  schema: "debateai-private-gate-figures-v1",
  gates: { deepinfra: GATE, anthropic: { daily_budget_usd: "22", max_paid_posts_per_day: 2222, max_concurrent_calls: 33,
    enabled_models: ["made-up-model-c"] } },
  team_total_usd: "33",
  hosted_billing: { made_up_plan: "made-up" }
});

let folder = "";
beforeEach(() => { folder = mkdtempSync(join(tmpdir(), "private-figures-")); });
afterEach(() => { rmSync(folder, { recursive: true, force: true }); });

/** A made-up file in this test's own folder; its path in the variable the reader reads. */
function figuresFile(text: string): NodeJS.ProcessEnv {
  const path = join(folder, "gate-figures.json");
  writeFileSync(path, text, "utf8");
  return { DEBATEAI_PRIVATE_GATE_FIGURES: path };
}
const withField = (gate: "deepinfra" | "anthropic", field: string, value: unknown): string =>
  JSON.stringify({ ...GOOD, gates: { ...GOOD.gates, [gate]: { ...GOOD.gates[gate], [field]: value } } });
const thrownBy = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a throw");
};

describe("the private files are read only when named", () => {
  it("absent variables read as null, and the skip line is 'not checked'", () => {
    expect(PRIVATE_NOT_CHECKED).toBe("not checked");
    expect(readPrivateGateFigures({})).toBeNull();
    expect(readPrivateRegisterExport({})).toBeNull();
    expect(readPrivateGateFigures({ DEBATEAI_PRIVATE_GATE_FIGURES: "  " })).toBeNull();
    expect(readPrivateRegisterExport({ DEBATEAI_PRIVATE_REGISTER_EXPORT: "" })).toBeNull();
  });

  it("a made-up gate figures file reads whole, frozen", () => {
    const figures = readPrivateGateFigures(figuresFile(JSON.stringify(GOOD)));
    expect(figures).toEqual(GOOD);
    expect(Object.isFrozen(figures)).toBe(true);
    expect(Object.isFrozen(figures!.gates.anthropic.enabled_models)).toBe(true);
    expect(figures!.gates.anthropic.final_writer_max_in_flight).toBeUndefined();
  });

  it("a made-up register export reads as its text", () => {
    const path = join(folder, "register-export.json");
    writeFileSync(path, '{"made_up":"export"}\n', "utf8");
    expect(readPrivateRegisterExport({ DEBATEAI_PRIVATE_REGISTER_EXPORT: path })).toBe('{"made_up":"export"}\n');
  });
});

describe("a file that does not read names the field, never the value", () => {
  it("a bad max_concurrent_calls names gates.anthropic.max_concurrent_calls and not its value", () => {
    const message = thrownBy(() => readPrivateGateFigures(figuresFile(withField("anthropic", "max_concurrent_calls", 444.4))));
    expect(message).toBe("PRIVATE_GATE_FIGURES_INVALID:gates.anthropic.max_concurrent_calls");
    expect(message).not.toContain("444");
    const asText = thrownBy(() => readPrivateGateFigures(figuresFile(withField("anthropic", "max_concurrent_calls", "4444"))));
    expect(asText).toBe("PRIVATE_GATE_FIGURES_INVALID:gates.anthropic.max_concurrent_calls");
  });

  it("a missing field, a pot that is not a decimal, an unknown field and another schema are each named", () => {
    const { daily_budget_usd: _left, ...noPot } = GATE;
    void _left;
    expect(thrownBy(() => readPrivateGateFigures(figuresFile(JSON.stringify({ ...GOOD, gates: { ...GOOD.gates, deepinfra: noPot } })))))
      .toBe("PRIVATE_GATE_FIGURES_INVALID:gates.deepinfra.daily_budget_usd");
    const notDecimal = thrownBy(() => readPrivateGateFigures(figuresFile(withField("deepinfra", "daily_budget_usd", "$5555"))));
    expect(notDecimal).toBe("PRIVATE_GATE_FIGURES_INVALID:gates.deepinfra.daily_budget_usd");
    expect(notDecimal).not.toContain("5555");
    expect(thrownBy(() => readPrivateGateFigures(figuresFile(withField("deepinfra", "made_up_pot", "6666")))))
      .toBe("PRIVATE_GATE_FIGURES_INVALID:gates.deepinfra.made_up_pot");
    expect(thrownBy(() => readPrivateGateFigures(figuresFile(JSON.stringify({ ...GOOD, schema: "made-up-v2" })))))
      .toBe("PRIVATE_GATE_FIGURES_INVALID:schema");
    expect(thrownBy(() => readPrivateGateFigures(figuresFile(JSON.stringify({ ...GOOD, team_total_usd: 7777 })))))
      .toBe("PRIVATE_GATE_FIGURES_INVALID:team_total_usd");
  });

  it("a file that is not JSON, or is missing, says so without a word of its content", () => {
    const broken = thrownBy(() => readPrivateGateFigures(figuresFile('{"schema": 8888.8, nope')));
    expect(broken).toBe("PRIVATE_GATE_FIGURES_NOT_JSON");
    expect(thrownBy(() => readPrivateGateFigures({ DEBATEAI_PRIVATE_GATE_FIGURES: join(folder, "absent.json") })))
      .toBe("PRIVATE_GATE_FIGURES_UNREADABLE");
    expect(thrownBy(() => readPrivateRegisterExport({ DEBATEAI_PRIVATE_REGISTER_EXPORT: join(folder, "absent.json") })))
      .toBe("PRIVATE_REGISTER_EXPORT_UNREADABLE");
  });
});

describe("a need against a pot, as a share only", () => {
  it("12.1 against 11 is about 1.1 times the pot", () => {
    expect(shareOfPot("12.1", "11")).toBe("about 1.1 times the pot");
  });

  it("rounds to a tenth, half up, and a share under a twentieth says so", () => {
    expect(shareOfPot("5.5", "11")).toBe("about 0.5 times the pot");
    expect(shareOfPot("33", "11")).toBe("about 3.0 times the pot");
    expect(shareOfPot("0.55", "11")).toBe("about 0.1 times the pot");
    expect(shareOfPot("0.539", "11")).toBe("under 0.1 times the pot");
    expect(shareOfPot("0", "11")).toBe("under 0.1 times the pot");
  });

  it("a figure that is not a plain decimal, or an empty pot, is refused without its value", () => {
    for (const [need, pot] of [["1,1", "11"], ["11", "0"], ["-1.1", "11"], ["11", "9999.9999999"]] as const) {
      const message = thrownBy(() => shareOfPot(need, pot));
      expect(message).toBe("SHARE_OF_POT_INVALID");
    }
  });
});

describe("the world's hosted billing from the private file", () => {
  // Task 90c: the sitting's file carries the practice copy's billing (off: real practice debates run billing off), but the world
  // drives every plan (Free, Plus, Pro, Max), so it runs the owner's plans and ceilings with billing on, whatever the file's switch.
  it("a file with billing off is run with billing on; every other field as the file holds it", () => {
    const off = readPrivateGateFigures(figuresFile(JSON.stringify({ ...GOOD, hosted_billing: { billing: "off", perRunCeilingMicros: 1_100_000,
      billingPlans: { made_up_plan: "made-up" } } })))!;
    expect(privateWorldHostedBilling(off)).toEqual({ billing: "on", perRunCeilingMicros: 1_100_000, billingPlans: { made_up_plan: "made-up" } });
    expect(off.hosted_billing.billing).toBe("off");
  });

  it("a file with billing on is run as it is", () => {
    const on = readPrivateGateFigures(figuresFile(JSON.stringify({ ...GOOD, hosted_billing: { billing: "on", dailyCeilingMicros: 11_000_000 } })))!;
    expect(privateWorldHostedBilling(on)).toEqual({ billing: "on", dailyCeilingMicros: 11_000_000 });
  });
});

describe("the world's gates from the private file: the release's GO edit on top", () => {
  // Task 90c: the sitting's file holds today's GOs; the release's upload sets the Anthropic gate to four calls at once
  // (deploy/preview-gate/v3/README-anthropic.md, "four calls at once", step 2: that one named field, nothing else).
  it("the Anthropic gate gets the release's four calls at once; every other figure, and DeepInfra, as the file holds them", () => {
    const figures = readPrivateGateFigures(figuresFile(JSON.stringify(GOOD)))!;
    expect(RELEASE_ANTHROPIC_CALLS_AT_ONCE).toBe(4);
    expect(privateWorldGates(figures)).toEqual({ deepinfra: GOOD.gates.deepinfra, anthropic: { ...GOOD.gates.anthropic, max_concurrent_calls: 4 } });
    expect(figures.gates.anthropic.max_concurrent_calls).toBe(33);
  });
});
