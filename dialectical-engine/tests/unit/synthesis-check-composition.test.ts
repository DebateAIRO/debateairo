import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");

describe("synthesis check production composition", () => {
  it("uses the support target, registered deadline, local switch, worker, and publish gate", () => {
    expect(source).toContain("createSynthesisCheckTransport(supportModelTarget");
    expect(source).toContain("createLocalOffFlagSwitch(");
    expect(source).toContain("synthesisCheckOffFlagPath(environment.API_PORT)");
    expect(source).toContain("deadlineMs: publicationCheckPolicy.deadlineMs");
    expect(source).toContain("new SynthesisCheckWorker(");
    expect(source).toContain("createSynthesisPublishGate(");
    expect(source).toContain("synthesisPublishGate,");
  });

  it("unrefs and clears the worker timer without a process signal", () => {
    expect(source).toMatch(/synthesisCheckTimer = setInterval\([^;]+;/);
    expect(source).toContain("synthesisCheckTimer.unref()");
    expect(source).toContain("clearInterval(synthesisCheckTimer)");
    expect(source).not.toMatch(/installSynthesisCheck.*Signal/);
  });

  it("wires answer access into API and exports and reconciles synthesis erasure first", () => {
    expect(source).toContain("createSynthesisAnswerAccess({ repository: synthesisCheckRepository, deadlineMs: publicationCheckPolicy.deadlineMs })");
    expect(source).toMatch(/const ownerDeps = \{[^}]*synthesisAnswerAccess[^}]*\}/);
    expect(source).toContain("synthesisAnswerAccess,");
    expect(source).toMatch(/try \{ await synthesisCheckErasure\.reconcile\(100\); \} catch \{[^}]*\}\s*await privateErasure\.reconcile/);
  });

  it("wires Publish and the worker to the owner-scoped answer read beneath the public hold", () => {
    const read = source.slice(source.indexOf("const readSynthesisAnswer ="),
      source.indexOf("const synthesisCheckWorker ="));
    expect(read).toContain("application.readAnswer(answerId, ownerSession(ownerRef");
    expect(read).not.toContain("readOwnerAnswer(");
    expect(read).toContain("await readSynthesisAnswer(runId, answerId, version, ownerRef)");
    expect(read).toContain("texts.set(version, synthesisTextOf(answer))");
  });
});
