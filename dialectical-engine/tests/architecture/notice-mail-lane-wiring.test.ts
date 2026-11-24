import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * K09/NV-24: main.ts wires the four background security-notice workers to the notice lane (the password reset's, the backup
 * address's, the lost authenticator app's and the recovery permit's), and only the anonymous
 * recovery-start port to the shared 32/96 lane. One email-recovery flow's failure never skips the other flow's run.
 * Whitespace is stripped, as tests/architecture/side-by-side-api-loops.test.ts does.
 */
const main = readFileSync(fileURLToPath(new URL("../../apps/api/src/main.ts", import.meta.url)), "utf8").replace(/\s+/gu, "");
const occurrences = (needle: string): number => main.split(needle).length - 1;

describe("K09/NV-24 notice-lane wiring in main.ts", () => {
  it("wires all four notice workers to dispatchNoticeMail", () => {
    expect(occurrences("dispatch:operation=>registration.dispatchNoticeMail(operation)")).toBe(4);
  });

  it("keeps only the recovery-start port on the shared lane", () => {
    expect(occurrences("registration.dispatchRecoveryMail(")).toBe(1);
  });

  it("reconciles every email-recovery flow independently", () => {
    expect(main).toContain("reconcileEachIndependently(emailRecoveryWorkers,100)");
    expect(main).not.toContain("for(const worker of emailRecoveryWorkers)await worker.reconcile(".replace(/\s+/gu, ""));
  });
});
