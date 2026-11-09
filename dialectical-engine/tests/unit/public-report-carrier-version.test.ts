// tests/unit/public-report-carrier-version.test.ts
// V4 start step, Task 56h: a report on a public debate records its calls under its carrier run, and in hosted mode every call is charged to its own run's
// settings version's guard (main.ts runCostEnvelopeGuard). A carrier this runner never claimed (any carrier after a restart, and always a run made only to
// carry a visitor's report) was unmapped: RUN_SETTINGS_VERSION_UNKNOWN:UNMAPPED. The sweep now maps it to its own stamped version first; Task 57o: a
// refused own version, to today's (57o-fix: the owners' switched-on version; if this runner refuses it, the release's own).
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { carrierVersionMapper } from "../../apps/runner/src/public-contribution.js";
import { createRunSettingsVersions } from "../../apps/runner/src/run-settings.js";

describe("Task 56h: a report's carrier is mapped to its own run's settings version before its calls", () => {
  it("an unmapped carrier: its stamped version, once that version's settings are loaded", async () => {
    const versions = createRunSettingsVersions();
    const steps: string[] = [];
    const map = carrierVersionMapper({ readVersion: async (runId) => { steps.push(`read ${runId}`); return 7; }, requireSettings: async (version) => { steps.push(`require ${String(version)}`); }, versions,
      switchedOnVersion: async () => 5, siteVersion: 3, log: () => undefined });
    await map("run-a");
    expect(versions.versionOf("run-a")).toBe(7);
    expect(steps).toEqual(["read run-a", "require 7"]);
  });

  it("a carrier the claim already mapped is left as it is, and nothing is read", async () => {
    const versions = createRunSettingsVersions();
    versions.set("run-b", 5);
    const steps: string[] = [];
    const map = carrierVersionMapper({ readVersion: async () => { steps.push("read"); return 9; }, requireSettings: async () => { steps.push("require"); }, versions,
      switchedOnVersion: async () => 5, siteVersion: 3, log: () => undefined });
    await map("run-b");
    expect(versions.versionOf("run-b")).toBe(5);
    expect(steps).toEqual([]);
  });

  // Task 57o (owner, 8 Nov: "Use today's settings"; 57o-fix: "Your switched-on one"): a carrier whose own version is refused is mapped to the owners'
  // switched-on version, with one line.
  it("a version the runner refuses (a typed settings refusal): the switched-on version, once loaded, and one content-free journal line", async () => {
    const versions = createRunSettingsVersions();
    const steps: string[] = [];
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const map = carrierVersionMapper({ readVersion: async () => 4, switchedOnVersion: async () => 5, siteVersion: 3, log: (line) => { lines.push(line); }, versions,
      requireSettings: async (version) => {
        steps.push(`require ${String(version)}`);
        if (version === 4) throw new Error("RUNNER_SETTINGS_VERSION_UNLOADABLE");
      } });
    await map("run-c");
    expect(versions.versionOf("run-c")).toBe(5);
    expect(steps).toEqual(["require 4", "require 5"]);
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_RUN_SETTINGS_TODAY", runId: "run-c", ownVersion: "4", usedVersion: "5", switchedOnVersion: "5",
      code: "RUNNER_SETTINGS_VERSION_UNLOADABLE" }]);
  });

  it("the refusal's owner-typed detail stays out of the line unless it is plainly an id (settingsJournalCode)", async () => {
    const versions = createRunSettingsVersions();
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const map = carrierVersionMapper({ readVersion: async () => 4, switchedOnVersion: async () => 5, siteVersion: 3, log: (line) => { lines.push(line); }, versions,
      requireSettings: async (version) => { if (version === 4) throw new TypedDomainError("PREVIEW_ROLE_UNKNOWN:Made up name", "made-up"); } });
    await map("run-f");
    expect(lines.map((line) => line.code)).toEqual(["PREVIEW_ROLE_UNKNOWN"]);
  });

  it("a database failure maps nothing and rejects as before: the lane tries again on its next pass, no line", async () => {
    const versions = createRunSettingsVersions();
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const map = carrierVersionMapper({ readVersion: async () => 4, switchedOnVersion: async () => 5, siteVersion: 3, log: (line) => { lines.push(line); }, versions,
      requireSettings: async () => { throw new TypedDomainError("DATABASE_POOL_FAILED", "made-up: the database did not answer"); } });
    await expect(map("run-d")).rejects.toThrow("made-up: the database did not answer");
    expect(versions.versionOf("run-d")).toBeUndefined();
    expect(lines).toEqual([]);
  });

  it("the switched-on and the site version both refused: maps nothing and rejects with the site version's refusal, no line", async () => {
    const versions = createRunSettingsVersions();
    const lines: Array<Readonly<Record<string, unknown>>> = [];
    const map = carrierVersionMapper({ readVersion: async () => 4, switchedOnVersion: async () => 5, siteVersion: 3, log: (line) => { lines.push(line); }, versions,
      requireSettings: async (version) => { throw new Error(`RUNNER_SETTINGS_VERSION_UNLOADABLE:${String(version)}`); } });
    await expect(map("run-e")).rejects.toThrow("RUNNER_SETTINGS_VERSION_UNLOADABLE:3");
    expect(versions.versionOf("run-e")).toBeUndefined();
    expect(lines).toEqual([]);
  });
});
