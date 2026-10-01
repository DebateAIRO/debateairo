// tests/architecture/b11-cost-envelopes-runbook.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Budget spec 2026-09-28 §2.12 and paid-plans spec 2026-09-29 §2.11: the
 * operator's money section describes what the code now does, and the records
 * carry the amendments (V-28, J24).
 */
const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const readme = await read("deploy/vps/README.md");
const money = readme.slice(readme.indexOf("### The cost envelopes (V-28)"), readme.indexOf("#### One answer's record"));
const publishing = readme.slice(readme.indexOf("### Publishing the settings register on this host"), readme.indexOf("## 12. The observation agent"));

describe("the runbook's cost envelopes (B11b)", () => {
  it("describes the band, holds, the waiting line and the three members with their example values", () => {
    for (const needle of [
      "`admission_close_basis_points`", "`finish_up_to_basis_points`", "`waiting_line_per_person`",
      "`9500`", "`11500`", "hold", "waits in line", "ASK_ALREADY_WAITING", "cost_envelope_band",
      "api.ask.waiting", "api.wait.started", "api.wait.tick", "runner.body.cheaper_model", "core.run_cost_substitution"
    ]) expect(money, needle).toContain(needle);
  });

  it("says to remove the members only with an empty waiting line (B7b builds no waker without them)", () => {
    expect(money).toContain("SELECT count(*) FROM core.run_waiting_v");
    expect(money).toMatch(/only when[^\n]*`0`/u);
    // B6b's boot step refuses a version without the band while any run waits.
    expect(money).toContain("WAITING_LINE_REQUIRES_BAND");
  });

  it("names the boot check and each person's windows, with their refusals", () => {
    for (const needle of [
      "RUN_CEILING_BELOW_ONE_CALL", "BILLING_REQUIRES_ENVELOPE_MEMBERS", "BILLING_PLANS_UNRESOLVED",
      "BILLING_PLAN_WINDOW_BELOW_RUN_CEILING", "ASK_SIGN_IN_REQUIRED", "PERSON_ALLOWANCE_REACHED", "110%", "115%",
      // B9d prices the boot check per plan: each plan's cheapest model must fit.
      "every plan's cheapest must fit"
    ]) expect(money, needle).toContain(needle);
  });

  it("keeps the first paid run's values and their provisional flag", () => {
    for (const needle of ["`250000`", "`2000000`", "0.25 USD", "2.00 USD", "provisional: true", "provisional: false"]) {
      expect(money, needle).toContain(needle);
    }
  });

  it("no longer states the retired daily rule as today's rule", () => {
    expect(money).not.toContain("no new debate starts until the next UTC day");
  });

  it("keeps §11's tables in step with the publish command", () => {
    for (const needle of [
      "| `billingPlans`, `billingPolicy` |", "| `BILLING_PLANS_INVALID` / `BILLING_POLICY_INVALID` |",
      "| `BILLING_REQUIRES_ENVELOPE_MEMBERS` / `BILLING_PLANS_UNRESOLVED` |",
      "| `warning=BILLING_PLAN_WINDOW_BELOW_RUN_CEILING:<plan>` |"
    ]) expect(publishing, needle).toContain(needle);
    expect(publishing).toMatch(/^\| `COST_ENVELOPE_POLICY_INVALID` \|[^\n]*`waiting_line_per_person`/mu);
  });

  /**
   * Final review Part 1b, Minor 1 (and deferred 42): every failure signal the
   * waiting line and the money engine print has a runbook row. The API's
   * `api.wait.*` events are swept from the source, so a new one reddens this
   * row the day it is written; the bare marker and the runner's two lines are
   * named by the code that prints them.
   */
  it("gives every waiting-line and money failure signal the code prints a row in the signal tables", async () => {
    const signals = readme.slice(readme.indexOf("#### What the runner's log says"), readme.indexOf("### Publishing the settings register on this host"));
    const api = await read("apps/api/src/index.ts");
    const waker = [...new Set([...api.matchAll(/event: "(api\.wait\.[a-z_]+)"/gu)].map((match) => match[1]!))];
    // The sweep must find the waker's own lines, or it is a test that cannot fail.
    expect(waker).toEqual(expect.arrayContaining(["api.wait.start_failed", "api.wait.redispatch_failed", "api.wait.tick"]));
    for (const event of waker) {
      expect(readme.includes(`\`${event}\``) || readme.includes(`"event":"${event}"`), event).toBe(true);
    }
    for (const event of ["api.wait.start_failed", "api.wait.redispatch_failed", "api.run.setup_failure_unrecorded"]) {
      expect(signals, event).toContain(`| \`"event":"${event}"\``);
    }
    expect(await read("apps/api/src/main.ts")).toContain('console.error("[ASK_WAITING_LINE_WAKE_PENDING]")');
    expect(signals).toContain("| `[ASK_WAITING_LINE_WAKE_PENDING]`");
    expect(await read("apps/runner/src/index.ts")).toContain('log("RUN_COST_SUBSTITUTION_WRITE_FAILED", {');
    expect(signals).toContain('| `"kind":"DEBATEAI_BODY_COST_FALLBACK"`, `"event":"RUN_COST_SUBSTITUTION_WRITE_FAILED"`');
    expect(await read("apps/runner/src/main.ts"))
      .toContain('console.warn(JSON.stringify({ kind: "DEBATEAI_PERSON_WALL", event: "PLANS_UNRESOLVED" }));');
    expect(signals).toContain('| `{"kind":"DEBATEAI_PERSON_WALL","event":"PLANS_UNRESOLVED"}`');
    // The setup-failure row no longer says nothing will start a debate whose first job is queued.
    expect(signals).not.toContain("because nothing will ever start it");
  });

  it("lists the new members in the register file's README", async () => {
    const fileReadme = await read("deploy/vps/register/README.md");
    for (const needle of ["| `billingPlans` |", "| `billingPolicy` |", "`admission_close_basis_points`"]) {
      expect(fileReadme, needle).toContain(needle);
    }
  });

  it("records the amendments where the rulings live", async () => {
    const packet = await read("docs/missions/2026-09-01-security-hardening/V-DECISIONS-PACKET.md");
    expect(packet).toContain("## Amendment to V-28 (2026-09-29): new debates wait in line, and each person has windows");
    expect(packet).toMatch(/J24's cost exception extends to arguing calls/u);
    const checklist = await read("docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md");
    expect(checklist).toMatch(/^\| 13 \| [^\n]*`admission_close_basis_points`/mu);
    const record = await read("docs/missions/2026-09-01-security-hardening/COST-ENVELOPES-2026-09-22.md");
    expect(record).toContain("## Update 2026-09-29: the waiting line and each person's windows");
  });
});
