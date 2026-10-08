import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NETOPIA spec 2026-10-05 §2.19: the previous card processor leaves the code. Its name is built from two pieces, so
 * this file is never one of its own matches (the repository's habit for key-like strings).
 */
const NAME = ["x", "money"].join("");
const UPPER = NAME.toUpperCase();
const CAMEL = `X${"M"}${NAME.slice(2)}`;
const NAMES_IT = new RegExp(NAME, "iu");
const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const at = (path: string): string => resolve(gitRoot, path);
const read = (path: string): string => readFileSync(at(path), "utf8");

/** Every tracked text file (a file staged for this task counts) whose content names it, in any case. */
function filesNamingIt(): string[] {
  try {
    return execFileSync("git", ["grep", "-I", "-l", "-i", NAME], { cwd: gitRoot, encoding: "utf8", maxBuffer: 1 << 24 })
      .split("\n").filter((line) => line !== "").sort();
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

/** The records of how the card processor was chosen and replaced, kept as they were written. */
const HISTORY_FILES: ReadonlyArray<string> = Object.freeze([
  ".gitleaksignore",
  "dialectical-engine/docs/superpowers/specs/2026-09-29-paid-plans-and-payments-design.md",
  "dialectical-engine/docs/superpowers/plans/2026-09-29-paid-plans-and-payments.md",
  "dialectical-engine/docs/superpowers/specs/2026-10-05-netopia-payments-design.md",
  // dev's auth lineage plan (merged at dedbb2d50), which names the billing tables of its time.
  "dialectical-engine/docs/superpowers/plans/2026-10-06-auth-dev-preview-integration.md"
]);
const HISTORY_PREFIXES: ReadonlyArray<string> = Object.freeze([
  // This plan.
  "dialectical-engine/docs/superpowers/plans/2026-10-05-",
  // The go-live checklist, the final reviews' open items and the owner's sign-offs.
  "dialectical-engine/docs/missions/"
]);
/** Applied migrations are never edited; 0109 supersedes their objects and names the old provider's value. */
const MIGRATIONS: ReadonlyArray<string> = Object.freeze([
  "0084_billing_entitlement.sql", "0085_billing_customers_subscriptions.sql", "0086_billing_charges_invoices.sql",
  "0087_billing_outbox_cancel.sql", "0088_billing_withdrawal_step_up.sql", "0092_billing_query_indexes.sql",
  "0093_billing_runtime_role.sql", "0109_billing_netopia.sql"
].map((name) => `dialectical-engine/migrations/${name}`)).concat([
  // dev's auth lineage (merged at dedbb2d50): 0093's compatibility executable and the effective-capability verifier,
  // both bound by SHA-256 in migrations/lineage/auth-dev-20261006.json, list the billing tables 0085-0087 created.
  "dialectical-engine/migrations/compatibility/auth-dev-20261006/0093_billing_runtime_role.sql",
  "dialectical-engine/migrations/lineage/verify-effective-capabilities.sql",
  // PR-54: its successor once 0109 is applied, whose closed relation list still names those tables.
  "dialectical-engine/migrations/lineage/verify-effective-capabilities-109.sql"
]);
/**
 * The suites that seed rows of the old provider and prove 0109 keeps them inert, and (PR-33) the proof that a live boot
 * still counts that era's open rows as another payment system's (spec 2026-10-05 §2.5.4).
 */
const HISTORY_TESTS: ReadonlyArray<string> = Object.freeze([
  "dialectical-engine/tests/integration/billing-migrations.test.ts",
  "dialectical-engine/tests/integration/billing-netopia-migration.test.ts",
  "dialectical-engine/tests/integration/billing-other-system-records.test.ts"
]);
/**
 * Code that names the old provider only to recognise what it left: the outbox kind and the provider value 0087 and
 * 0109 keep for old rows, an old CREATED's environment, the removed settings a boot warns about. Every line of these
 * files that names it must match its pattern.
 */
const CODE_LINES: Readonly<Record<string, RegExp>> = Object.freeze({
  // PR-33: openOtherSystemRecordCounts keeps the SQL literals of an old CREATED ('<name>', '<name>_environment').
  "dialectical-engine/packages/db/src/billing.ts": new RegExp(`"${UPPER}_REFUND"|"${NAME}"|'${NAME}'|'${NAME}_environment'`, "u"),
  "dialectical-engine/packages/billing-core/src/subscription.ts": new RegExp(`${NAME}_environment|"${NAME}"`, "u"),
  "dialectical-engine/packages/register/src/runtime-environment.ts": new RegExp(`"${UPPER}_[A-Z_]+"`, "u"),
  "dialectical-engine/apps/ui/server.mjs": new RegExp(`"${UPPER}_SDK_ORIGIN"`, "u"),
  "dialectical-engine/tests/unit/billing-core-subscription.test.ts": new RegExp(`${NAME}_environment|"${NAME}"`, "u")
});

function allowed(path: string): boolean {
  return HISTORY_FILES.includes(path) || HISTORY_PREFIXES.some((prefix) => path.startsWith(prefix))
    || MIGRATIONS.includes(path) || HISTORY_TESTS.includes(path)
    || Object.hasOwn(CODE_LINES, path);
}

function sources(directory: string): string[] {
  return (readdirSync(at(directory), { recursive: true }) as string[])
    .filter((name) => name.endsWith(".ts"))
    .map((name) => read(`${directory}/${name}`));
}

describe("N23: the previous card processor is removed (spec 2026-10-05 §2.19)", () => {
  it("is named only by the history, the applied migrations, their two suites and the code that recognises its leftovers", () => {
    const named = filesNamingIt();
    // The history itself is still found, so an empty list would mean the search did not run.
    expect(named).toContain("dialectical-engine/docs/superpowers/plans/2026-09-29-paid-plans-and-payments.md");
    expect(named.filter((path) => !allowed(path))).toEqual([]);
  });

  it("names it in code only on the lines that recognise its stored values and its removed settings", () => {
    for (const [path, reason] of Object.entries(CODE_LINES)) {
      if (!existsSync(at(path))) continue;
      const offending = read(path).split("\n").filter((line) => NAMES_IT.test(line) && !reason.test(line));
      expect(offending, path).toEqual([]);
    }
  });

  it("ships no package, fake, tool, component, notify route or setting of it", () => {
    for (const path of [
      `dialectical-engine/packages/payments-${NAME}`,
      `dialectical-engine/acceptance/billing-fakes/fake-${NAME}.ts`,
      `dialectical-engine/tests/support/fake-${NAME}.ts`,
      `dialectical-engine/tools/billing/${NAME}-sandbox.ts`,
      `dialectical-engine/tools/billing/scrub-${NAME}-fixture.ts`,
      `dialectical-engine/apps/ui/components/billing/${CAMEL}CardForm.tsx`,
      `dialectical-engine/apps/ui/lib/billing/${NAME}Sdk.ts`,
      "dialectical-engine/apps/api/src/billing/notice-intake.ts"
    ]) {
      expect(existsSync(at(path)), path).toBe(false);
    }
    const manifest = JSON.parse(read("dialectical-engine/package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })).not.toContain(`@debateai/payments-${NAME}`);
    expect(read("dialectical-engine/apps/api/src/index.ts")).toContain('"POST /v1/billing/netopia/notify"');
    expect(read("dialectical-engine/deploy/vps/env/api.env.example")).not.toMatch(NAMES_IT);
    expect(read("dialectical-engine/deploy/vps/env/ui.env.example")).not.toMatch(NAMES_IT);
  });

  it("declares only audit lines the API writes, the renamed payment lines included", () => {
    const api = sources("dialectical-engine/apps/api/src");
    const audit = read("dialectical-engine/apps/api/src/billing/audit.ts");
    const declared = [...audit.matchAll(/^\s*\|\s*"(billing\.[a-z_.]+)"/gmu)].map((match) => match[1]!);
    expect(declared.length).toBeGreaterThanOrEqual(50);
    expect(declared).toContain("billing.payment.credentials_refused");
    expect(declared).toContain("billing.payment.answer_rejected");
    for (const event of declared) {
      // Once in the union, at least once where a line is written (audit.ts's own helpers included).
      const uses = api.reduce((count, text) => count + text.split(`"${event}"`).length - 1, 0);
      expect(uses, `${event} is declared but never written`).toBeGreaterThanOrEqual(2);
    }
  });

  it("warns about a removed setting by name at both starts, never by value", () => {
    const main = read("dialectical-engine/apps/api/src/main.ts");
    expect(main).toContain("for (const key of loadRetiredBillingSettings())");
    expect(main).toContain('console.warn(JSON.stringify({ event: "billing.setting.retired", key }))');
    const ui = read("dialectical-engine/apps/ui/server.mjs");
    expect(ui).toContain('console.warn(JSON.stringify({ event: "ui.setting.retired", key }))');
    expect(ui).not.toMatch(/process\.env\[key\]\s*[,)]/u);
  });
});
