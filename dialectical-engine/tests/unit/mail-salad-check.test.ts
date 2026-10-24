import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- the S01 gate is an untyped .mjs and its allowed list carries no declaration file (house pattern: tests/unit/tier01-ask-wire.test.ts)
import * as gate from "../../scripts/mail-salad-check.mjs";

/**
 * S01-C02 (PLAN C02.3, amended for F-M, F-V and F-C). (ii) the nine value fixtures of commands/auth_copy_rule.py --self-test,
 * with the verdicts the D-75 rule as amended by D-91 and D-94 gives, one case per clause the nine leave unisolated, and the
 * product-term exemption (F-C). (i) the tree fixtures, run through the checker's own command line: 0 on a clean locale, 1 on
 * each failing fixture, with the failing message named on its line. Every class (a) to (g) has a fixture that fails it.
 * The namespace import is deliberate: a case for an export that does not exist yet fails on its own, not on the load.
 */

const { CATALOGUE_LOCALES, stripAll, verdictFor, uiStringCount, productTermsFor, checkLocale, PRODUCT_TERMS, PRE_3_4_PURPOSE } = gate as {
  CATALOGUE_LOCALES: readonly string[];
  stripAll: (text: string) => string;
  verdictFor: (english: string, value: string, productTerms?: ReadonlySet<string>) => { verdict: string; clause: string | null; why: string };
  uiStringCount: (root: string, cc: string, word: string) => number;
  PRODUCT_TERMS: Record<string, readonly string[]>;
  productTermsFor: (cc: string) => ReadonlySet<string>;
  checkLocale: (args: { root: string; enRoot: string; cc: string }) => { problems: string[] };
  PRE_3_4_PURPOSE: Record<string, string>;
};

const SCRIPT = resolve("scripts/mail-salad-check.mjs");
const FIXTURES = resolve("tests/unit/fixtures/mail-salad");
const EN_TREE = resolve(FIXTURES, "en");

type Verdict = "PASS" | "FAIL";

const VALUE_FIXTURES: Array<[string, string, string, Verdict]> = [
  ["verification subject, brand kept (correct ro)", "Verify your email for Dialectical Engine", "Verifica adresa de email pentru Dialectical Engine", "PASS"],
  ["verification subject, word-for-word calque (residual: REV)", "Verify your email for Dialectical Engine", "Verifica ta email pentru Dialectical Engine", "PASS"],
  ["greeting left in English", "Hello,", "Hello,", "FAIL"],
  ["sign-off left in English", "The DebateAI team", "The DebateAI team", "FAIL"],
  ["PROOF sentence, fluent ro, brand kept (residual: REV)", "A password reset was requested for your DebateAI account.", "S-a cerut o resetare a parolei pentru contul tau DebateAI.", "PASS"],
  ["PROOF sentence, word-for-word (residual: REV)", "A password reset was requested for your DebateAI account.", "O parola resetare a fost ceruta pentru tau DebateAI cont.", "PASS"],
  ["partial English: two English content words kept", "Verify your email for Dialectical Engine", "Verify your adresa pentru Dialectical Engine", "FAIL"],
  ["N12: greeting, comma dropped (one-character change)", "Hello,", "Hello", "FAIL"],
  ["N12: brand-only value, identical", "DebateAI", "DebateAI", "FAIL"],
];

describe("S01-C02 value rule: the nine fixtures of commands/auth_copy_rule.py (C02.3 ii)", () => {
  it.each(VALUE_FIXTURES)("%s", (_name, english, value, want) => {
    expect(verdictFor(english, value).verdict).toBe(want);
  });
});

describe("S01-C02 value rule: each clause on its own (the refutation of the nine)", () => {
  it("clause c, identity after the R-29 strip with one word left: the brand and the digits go, nothing else differs", () => {
    const result = verdictFor("Ready for DebateAI", "Ready for DebateAI 2026");
    expect(result.verdict).toBe("FAIL");
    expect(result.clause).toBe("c");
  });

  it("clause c, N12: identity folds case as well as punctuation", () => {
    const result = verdictFor("Hello,", "HELLO,");
    expect(result.verdict).toBe("FAIL");
    expect(result.clause).toBe("c");
  });

  it("a three-letter English word does not count toward survival: content words are four letters or more (D-75)", () => {
    expect(verdictFor("Use the bank now", "Folosiți the bank").verdict).toBe("PASS");
  });

  it("F-T: an English word inside an accented token is not English survival (pt cancelá is not cancel)", () => {
    expect(verdictFor("Cancel the subscription now.", "Cancelá a subscrição agora.").verdict).toBe("PASS");
  });

  it("F-S: a sentence split never falls after an ordinal 13. (the §17 pointer is measured whole)", () => {
    expect(gate.sentencesOf("Vidi a 13. szakasza. Második mondat.")).toEqual(["Vidi a 13. szakasza.", "Második mondat."]);
  });

  it("the survival floor is strict: a ratio of exactly 0.10 passes, a ratio of 0.20 fails", () => {
    const english = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    expect(verdictFor(english, "alpha").verdict).toBe("PASS");
    expect(verdictFor(english, "alpha bravo").verdict).toBe("FAIL");
  });

  it("strips placeholders, URLs, e-mail addresses, digit tokens and the R-29 tokens before comparison", () => {
    expect(stripAll("Open https://dezbatere.ro/x for user@example.com in DebateAI, code 123456 {expiry}")).toBe("Open for in , code");
    expect(stripAll("Open 2026 ٢٠٢٦ for DebateAI")).toBe("Open for");
  });

  it("matches the R-29 tokens as whole words: PRO and PLUS go, the PRO inside PROOF stays", () => {
    expect(stripAll("PROOF for PLUS users")).toBe("PROOF for users");
  });

  it("the --all list is the 34 catalogue locales: the mail-templates directories other than en", () => {
    const directories = readdirSync(resolve("packages/mail-templates/messages")).filter((name) => name !== "en").sort();
    expect(directories).toEqual([...CATALOGUE_LOCALES].sort());
  });
});

describe("S01-C02 F-C: a word the locale's own UI uses is its product term, not English survival", () => {
  it("a surviving English word that is a product term of the locale is not counted; without the term it fails", () => {
    const english = "Use your passkey to sign in";
    const value = "Verwenden Sie Ihren passkey, um sich anzumelden.";
    expect(verdictFor(english, value, new Set(["passkey"])).verdict).toBe("PASS");
    expect(verdictFor(english, value).verdict).toBe("FAIL");
  });

  it("the UI count is whole-token and placeholder-free: ten strings for passkey, nine for cancel", () => {
    expect(uiStringCount(resolve(FIXTURES, "product-terms"), "de", "passkey")).toBe(10);
    expect(uiStringCount(resolve(FIXTURES, "product-terms"), "de", "cancel")).toBe(9);
  });

  it("every granted product term has at least ten strings in its locale's real UI catalogue (the evidence is in the repo)", () => {
    for (const [cc, words] of Object.entries(PRODUCT_TERMS)) {
      for (const word of words) {
        expect(uiStringCount(resolve("."), cc, word), `${cc} ${word}`).toBeGreaterThanOrEqual(10);
      }
    }
  });
});

describe("S01-C02 F-C wiring: the grants reach the class (d) check, and a grant without evidence fails", () => {
  it("de keeps its English 'link' through the reviewed grant: no (d) failure on that value", () => {
    const problems = checkLocale({ root: resolve(FIXTURES, "grant-de"), enRoot: EN_TREE, cc: "de" }).problems;
    expect(problems.some((problem) => problem.startsWith("(d) de auth.pwr.proof.body"))).toBe(false);
  });

  it("bg has no grant, so the same English 'link' fails at survival 0.125", () => {
    const problems = checkLocale({ root: resolve(FIXTURES, "grant-de"), enRoot: EN_TREE, cc: "bg" }).problems;
    expect(problems).toContain("(d) bg auth.pwr.proof.body: survival 0.125 > floor 0.1");
  });

  it("a grant without its UI evidence fails the gate: code and link have no strings in the product-terms fixture", () => {
    const problems = checkLocale({ root: resolve(FIXTURES, "product-terms"), enRoot: EN_TREE, cc: "de" }).problems;
    expect(problems).toContain("(d) de product term code has 0 UI strings, want 10");
    expect(problems).toContain("(d) de product term link has 0 UI strings, want 10");
    expect(problems.some((problem) => problem.includes("product term passkey"))).toBe(false);
  });

  it("the grants are the reviewed words: de and fr have them, bg has none", () => {
    expect(productTermsFor("de").has("link")).toBe(true);
    expect(productTermsFor("fr").has("codes")).toBe(true);
    expect(productTermsFor("bg").size).toBe(0);
  });
});

describe("S01-C02 F-M: the stale 3.3 purpose is a class of its own, for each of the 34 locales", () => {
  it("PRE_3_4_PURPOSE names exactly the 34 catalogue locales", () => {
    expect(Object.keys(PRE_3_4_PURPOSE).sort()).toEqual([...CATALOGUE_LOCALES].sort());
  });
});

type GateRun = { status: number | null; stdout: string };

function runGate(args: readonly string[]): GateRun {
  const run = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout };
}

function expectMessages(stdout: string, messages: readonly string[]): void {
  for (const message of messages) {
    expect(stdout, message).toContain(message);
  }
}

describe("S01-C02 tree fixtures: the exit code and the failing message (C02.3 i)", () => {
  it("a clean translation exits 0 with no problem named", () => {
    const run = runGate(["--locale", "bg", "--root", resolve(FIXTURES, "clean"), "--en-root", EN_TREE]);
    expect(run.stdout).not.toContain("PROBLEM");
    expect(run.status).toBe(0);
  });

  it.each([
    ["english-copied", "(c) bg auth.common.greeting: identical to English after the R-29 strip"],
    ["placeholder-dropped", "(b) bg auth.pwr.proof.body: placeholders [] differ from en [{expiry}]"],
    ["key-removed", "(a) bg lacks auth key auth.common.signoff"],
  ])("%s exits 1 with its own failing message", (variant, message) => {
    const run = runGate(["--locale", "bg", "--root", resolve(FIXTURES, variant), "--en-root", EN_TREE]);
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(message);
  });

  it("pp-faults: a dropped §13 paragraph fails the block shape, a renamed cookie row fails the purpose lookup (class e)", () => {
    const run = runGate(["--locale", "bg", "--root", resolve(FIXTURES, "pp-faults"), "--en-root", EN_TREE]);
    expect(run.status).toBe(1);
    expectMessages(run.stdout, [
      "(e) bg §13 block kinds p,table,p,p,p differ from p,table,p,p,p,p",
      "(e) bg §13 table has no debateai.locale row with a purpose cell",
    ]);
  });

  it("stale-purpose (F-M e, g): the pre-3.4 purpose in the cookie table and in /cookies fails, though it differs from English", () => {
    const run = runGate(["--locale", "bg", "--root", resolve(FIXTURES, "stale-purpose"), "--en-root", EN_TREE]);
    expect(run.status).toBe(1);
    expectMessages(run.stdout, [
      "(e) bg cookie purpose cell is the pre-3.4 text",
      "(g) bg legal.cookies.locale.purpose is the pre-3.4 text",
    ]);
  });

  it("pointer-deleted (F-M f): a §17 without the section 13 pointer fails, though its last sentence differs from English", () => {
    const run = runGate(["--locale", "bg", "--root", resolve(FIXTURES, "pointer-deleted"), "--en-root", EN_TREE]);
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("(f) bg §17 does not name Privacy Policy section 13");
  });

  it("pointer-ordinal (F-S f): a copied English pointer sentence fails, though the last sentence after the ordinal 13. differs from English", () => {
    const run = runGate(["--locale", "bg", "--root", resolve(FIXTURES, "pointer-ordinal"), "--en-root", EN_TREE]);
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("(f) bg §17 pointer sentence is the English sentence");
  });

  it("unparseable-version (F-V): a version line the legal generator cannot parse fails class (e), though it has the 3.5 literal", () => {
    const run = runGate(["--locale", "bg", "--root", resolve(FIXTURES, "unparseable-version"), "--en-root", EN_TREE]);
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("(e) bg privacy-policy.md: the legal generator cannot parse the version line");
  });

  it("mixed-faults: each remaining sub-check of classes (a), (e), (f) and (g) names its own failure", () => {
    const run = runGate(["--locale", "bg", "--root", resolve(FIXTURES, "mixed-faults"), "--en-root", EN_TREE]);
    expect(run.status).toBe(1);
    expectMessages(run.stdout, [
      "(a) bg has auth key auth.extra.note that en lacks",
      "(a) bg auth.common.signoff is empty or not a string",
      "(e) bg cookie purpose cell equals English",
      "(e) bg §13 block 2 equals English",
      "(e) bg privacy-policy.md version is 3.3, want 3.5",
      "(f) bg terms-of-service.md version is 2.2, want 2.4",
      "(f) bg §17 pointer sentence is the English sentence",
      "(g) bg legal.cookies.locale.purpose equals English",
    ]);
  });
});

describe("S01-C02 --measure: FLOOR_MAX is the last field of its line (the C02.sh contract, C02.2)", () => {
  it("prints FLOOR_MAX 0.0000 on the clean fixture, where no English content word survives", () => {
    const run = runGate(["--measure", "bg", "--root", resolve(FIXTURES, "clean"), "--en-root", EN_TREE]);
    expect(run.status).toBe(0);
    const line = run.stdout.split("\n").find((text) => text.includes("FLOOR_MAX"));
    expect(line?.split(/\s+/).at(-1)).toBe("0.0000");
  });
});
