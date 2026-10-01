import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * B8 in the API root (R-5, R-28). The server decides the ask from B6b's room
 * composition, which already asked B4a's `assertBillingReady`: `askBilling`
 * exists exactly when that composition carries billing (hosted, billingPolicy
 * enabled, plans sealed, the band published). No second billing boot read.
 */
const main = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8");
const runbook = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");

describe("the setup step B8 adds, beside B6b's and B7b's (budget spec §2.9)", () => {
  it("keeps every earlier step in the union and appends COST_RECORD", () => {
    expect(api).toContain(
      '  | "ADMISSION_RELEASE" | "MEMORY_QUESTION" | "WORK_QUEUE" | "DISPATCH" | "WAITING_LINE" | "ROOM_HOLD" | "PLAN_CHANGED"\n'
      + '  | "COST_RECORD";'
    );
  });

  it("names it in the operator runbook's RUN_SETUP_FAILED row, after B7b's PLAN_CHANGED", () => {
    const row = runbook.split("\n").find((line) => line.startsWith("| A failed debate whose reason is `RUN_SETUP_FAILED:ADMISSION_RELEASE`"));
    expect(row).toBeDefined();
    expect(row).toContain("`RUN_SETUP_FAILED:ROOM_HOLD`, `RUN_SETUP_FAILED:PLAN_CHANGED` or `RUN_SETUP_FAILED:COST_RECORD`, shown the same way");
    expect(row).toContain("`COST_RECORD` means a paid question that did not fit its owner's remaining allowance");
  });
});

describe("the API root wires the server-decided ask from the room's composition", () => {
  it("reads B6b's composition as it is: the room's own plans, allowance, spend store and estimator", () => {
    // B6b's step returns these; B8 does not edit it.
    expect(main).toContain("return Object.freeze({ room, spend, estimator, entitlements, personAllowance, billingPlans });");
    expect(main).toContain("      plans: askRoomComposition.billingPlans,");
    expect(main).toContain("        personAllowance: askRoomComposition.personAllowance,");
    expect(main).toContain("        estimator: askRoomComposition.estimator");
  });

  it("builds askBilling only when the composition carries billing, and hands it to both consumers", () => {
    expect(main).toContain("const askBilling: AskBilling | undefined = askRoomComposition === undefined");
    expect(main).toContain("|| askRoomComposition.entitlements === null || askRoomComposition.billingPlans === null");
    expect(main).toContain("  ...(askBilling === undefined ? {} : { billing: askBilling }),");
    expect(main).toContain("  ...(askBilling === undefined ? {} : { askBilling }),");
  });

  it("adds no boot step of its own: the readiness check stays in B6b's ask-room step", () => {
    expect(main).not.toContain('boot.run("billing-ask"');
    const askRoomStep = main.slice(main.indexOf('boot.run("ask-room"'), main.indexOf("const askRoom = askRoomComposition?.room;"));
    expect(askRoomStep).toContain("assertBillingReady(");
  });
});
