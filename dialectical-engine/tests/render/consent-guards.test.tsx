import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cluster S01-C7 — the slice-wide guards (`S01-S42` … `S01-S45`).
 *
 * These are source-text guards, not behaviour tests: every one of them ranges
 * over files the slice's other clusters shipped, and every one is GREEN the
 * moment it is typed, because C7 runs after those files are already compliant.
 * **A guard seen only green has not been shown to guard anything** — so each
 * case names, in its own comment, the N7 mutant its RED was watched against, and
 * those mutants are pasted verbatim on ticket `t_4c58683b`.
 *
 * No DOM: every case reads bytes off disk, so this file needs no
 * `@vitest-environment` directive and runs in vitest's default node
 * environment. It is a `.tsx` because `PLAN.md`'s `S01-S42` names the path
 * `tests/render/consent-guards.test.tsx` and `CMD-C7` runs that exact path.
 *
 * Paths resolve from `process.cwd()`, which the acceptance command pins to the
 * lane root; `import.meta.url` can carry a non-file scheme under vitest
 * (TOOLING-TRAPS, CODE-T1C3 / CODE-T5C1). Same idiom as the other consent
 * suites.
 *
 * **Every banned token that is a LITERAL is matched with `String.includes`, not
 * with a regex.** CODE-REV-S01-C5 r1 measured the regex-dialect split in both
 * directions: `\.focus()` is an empty group that BSD `grep -E` accepts and the
 * tool shell's `ugrep` shim refuses outright. A literal compared as a literal is
 * immune to that class, and there is no `.`-matches-any hazard to escape around.
 * The two patterns that genuinely need alternation (`S01-S42`'s colour literals
 * and `S01-S44`'s SDK names) are transcribed from `PLAN.md`'s `accept:` lines
 * character for character (`COMMON.md` §10.43) and evaluated in JS, where no
 * shell and no locale is involved.
 */

const lane = (...parts: string[]): string => resolve(process.cwd(), ...parts);

/** S02 owns these two and S01 does not gate another slice's source (`S01-S42`). */
const S02_OWNED = ["modalSemantics.ts", "PrivacyPolicyModal.tsx"] as const;

/** The ONE shared modal helper. `S01-S45` excludes it, and only it, by name. */
const SHARED_HELPER = "modalSemantics.ts";

const CONSENT_DIR = "apps/ui/components/consent";

/**
 * Every source file under `apps/ui/components/consent/`, read from the DIRECTORY
 * rather than listed, so a sixth file added later is scanned without editing
 * this test (`S01-S42`). Sorted so a failure message is stable.
 */
const consentDirFiles = (): string[] =>
  readdirSync(lane(CONSENT_DIR))
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .sort();

/** The five files `S01-S42` and `S01-S44` scan: the slice's own, never S02's. */
const slicesOwnFiles = (): string[] => [
  "apps/ui/lib/consent.ts",
  ...consentDirFiles()
    .filter((name) => !S02_OWNED.includes(name as (typeof S02_OWNED)[number]))
    .map((name) => `${CONSENT_DIR}/${name}`)
];

/** The five files `S01-S45` scans: everything under `consent/` but the helper. */
const nonHelperFiles = (): string[] =>
  consentDirFiles()
    .filter((name) => name !== SHARED_HELPER)
    .map((name) => `${CONSENT_DIR}/${name}`);

const read = (path: string): string => readFileSync(lane(path), "utf8");

/** `path:line: text` for every line of every file matching `pattern`. */
function lineHits(paths: string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const path of paths) {
    read(path)
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) hits.push(`${path}:${index + 1}: ${line.trim()}`);
      });
  }
  return hits;
}

/** Catalogue-key literals are metadata, not executable SDK or consent-state reads. */
const withoutConsentMessageKeys = (line: string): string =>
  line.replace(/(["'])consent\.[^"']+\1/g, '""');

/** `path:line: text` for every line of every file CONTAINING `token` verbatim. */
function literalHits(paths: string[], token: string): string[] {
  const hits: string[] = [];
  for (const path of paths) {
    read(path)
      .split("\n")
      .forEach((line, index) => {
        if (line.includes(token)) hits.push(`${path}:${index + 1}: ${line.trim()}`);
      });
  }
  return hits;
}

describe("S01-C7 the slice-wide guards", () => {
  it("derives its scan list from the consent directory and excludes S02's two files by name", () => {
    // PROPERTY (S01-S42's list clause): the scan is a property of the
    // DIRECTORY, not of a list somebody has to remember to extend — and the
    // exclusion is BY NAME, because S01 does not gate another slice's source.
    //
    // This case is the guard on the guards below it. Without it, a
    // `readdirSync` that returned nothing would make all four scans pass with
    // no file read at all, which is the vacuity every source-text guard dies
    // of. It is deliberately written as CONTAINMENT and a floor rather than as
    // set equality: a sixth S01 file must be scanned without editing this test,
    // so pinning the list exactly would defeat S01-S42's own clause.
    const scanned = slicesOwnFiles();

    expect(scanned, "the five files the slice shipped are all in the scan").toEqual(
      expect.arrayContaining([
        "apps/ui/lib/consent.ts",
        `${CONSENT_DIR}/ConsentSettingsPanel.tsx`,
        `${CONSENT_DIR}/CookieBar.tsx`,
        `${CONSENT_DIR}/CookieConsent.tsx`,
        `${CONSENT_DIR}/CookiePreferencesCard.tsx`
      ])
    );
    expect(scanned.length, "and the scan is never shorter than those five").toBeGreaterThanOrEqual(5);

    for (const owned of S02_OWNED) {
      expect(
        scanned,
        `${owned} is S02's — S01 does not gate another slice's source`
      ).not.toContain(`${CONSENT_DIR}/${owned}`);
    }

    // `S01-S45` scans one file MORE than `S01-S42` does: it excludes only the
    // shared helper, so `PrivacyPolicyModal.tsx` IS in its scan. Stated here
    // because the two lists differ by exactly that one file and a reader who
    // assumes they are the same list would mis-read both guards
    // (`COMMON.md` §10.43 — the PLAN's exclusions are quoted, not widened).
    expect(nonHelperFiles(), "S01-S45 scans the policy modal too").toContain(
      `${CONSENT_DIR}/PrivacyPolicyModal.tsx`
    );
    expect(nonHelperFiles(), "and never the shared helper itself").not.toContain(
      `${CONSENT_DIR}/${SHARED_HELPER}`
    );
  });

  it("leaves no colour literal in any file this slice adds", () => {
    // S01-S42 · serves S01-R25. PROPERTY: the design-system law reaches the
    // files the shipped gate does not scan. `tests/unit/t9-mode-tokens.test.ts`
    // scans exactly `globals.css`, `layout.tsx`, `ModeToggle.tsx` and
    // `debatePresentation.ts`; nothing scans the consent components, so this
    // slice supplies the scan for its own files. Colours only via `var(--token)`.
    //
    // Pattern transcribed from PLAN.md:545 character for character.
    //
    // RED watched against the N7 mutant: `style={{ borderColor: "#A8823E" }}` on
    // the bezel element in `CookieBar.tsx`.
    const hits = lineHits(slicesOwnFiles(), /oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i);

    expect(hits, `colour literals in the files this slice adds:\n${hits.join("\n")}`).toEqual([]);
  });

  it("names every consent selector that carries motion in the S01 block's reduced-motion rule", () => {
    // S01-S43 · serves S01-R27. PROPERTY: motion this slice introduces can be
    // switched off by the visitor's own operating-system setting. There is no
    // global reduced-motion reset in this codebase — the four existing blocks
    // (globals.css:269, :3663, :4681, :5244) are each scoped to their own
    // component — so the house convention is a scoped block and this slice
    // writes its own.
    //
    // The accept is an OR: EITHER the S01 block carries no animation/transition
    // declaration at all, OR its `@media (prefers-reduced-motion: reduce)` rule
    // names every `consent*` selector that carries one. `uncovered` expresses
    // that OR exactly, with no branch written down twice:
    //   - nothing carries motion   -> uncovered is empty -> first branch, pass
    //   - something carries it and no reduced-motion rule exists
    //                              -> `named` is empty, uncovered = carriers -> fail
    //   - something carries it and the rule names it
    //                              -> uncovered is empty -> second branch, pass
    // The SECOND branch is the operative one today: `.consentBar
    // .consentPrimary` has carried `transition: transform .5s
    // cubic-bezier(.34,1.56,.64,1)` plus a hover `transform` since the C3C4
    // design-fidelity follow-up (fd8250c0), and the reduced-motion rule names
    // both selectors (CODE-REV-S01-C5 r1 §2.4). The first branch is not asserted
    // away: a later seat may delete the transition instead, and this case must
    // stay green when it does.
    //
    // RED watched against the N7 mutant: `transition: opacity .18s ease;` added
    // to `.consentBar` inside the S01 block with no counterpart in the rule.
    const css = read("apps/ui/app/globals.css");
    const opening = css.indexOf("/* === consent-ui S01 === */");
    const closing = css.indexOf("/* === end consent-ui S01 === */");
    expect(opening, "the S01 delimited block opens").toBeGreaterThan(-1);
    expect(closing, "and closes after it opens").toBeGreaterThan(opening);
    const block = css.slice(opening, closing);

    // The extractor is proved on synthetic input INSIDE the case, so this
    // assertion can never pass because the parser silently returned nothing
    // (`COMMON.md` §10.16(b), and the shim-conformance pattern from
    // TOOLING-TRAPS' CODE-S02-C7 entry). A known-BAD stylesheet must produce
    // exactly the uncovered selector; a known-GOOD one must produce none.
    expect(
      uncoveredMotionSelectors(`
        .consentBar { transition: opacity .18s ease; }
        .consentCard { animation: de-popin .2s ease; }
        @media (prefers-reduced-motion: reduce) { .consentCard { animation: none; } }
      `),
      "known-BAD synthetic input: the extractor names the uncovered selector"
    ).toEqual([".consentBar"]);
    expect(
      uncoveredMotionSelectors(`
        /* a comment carrying a stray brace { and the word transition: */
        .consentBar,
        .consentCard { transition: opacity .18s ease; }
        @media (prefers-reduced-motion: reduce) {
          .consentBar,
          .consentCard { transition: none; }
        }
      `),
      "known-GOOD synthetic input: none, and comments are not rules"
    ).toEqual([]);

    const uncovered = uncoveredMotionSelectors(block);

    expect(
      uncovered,
      `consent selectors carrying animation/transition inside the S01 block with no counterpart in its reduced-motion rule: ${uncovered.join(", ") || "none"}`
    ).toEqual([]);
  });

  it("references no analytics or telemetry SDK, and no script tag", () => {
    // S01-S44 arm 1 · serves S01-R23. PROPERTY: no file this slice adds
    // references an analytics or telemetry SDK, so the UI never claims a
    // capability the product lacks (standing V honesty law; intake C10).
    //
    // Pattern transcribed from PLAN.md:561 character for character.
    //
    // RED watched against the N7 mutant: `const plausibleReady = true;` added to
    // `CookieConsent.tsx`. The PLAN makes it a bare identifier and not a comment
    // deliberately — a grep-shaped test cannot see a comment (`COMMON.md` §8),
    // so a commented-out mutant would prove nothing. The reverse of that same
    // fact is a trap this slice has already paid for once: a comment must not
    // SPELL a banned token even to DENY it (CODE-S01-C5's JSDoc `.focus()`).
    const sdkPattern =
      /gtag|googletagmanager|analytics\.|segment|mixpanel|posthog|amplitude|plausible|datadog|sentry|<script/i;
    const hits: string[] = [];
    for (const path of slicesOwnFiles()) {
      read(path).split("\n").forEach((line, index) => {
        if (sdkPattern.test(withoutConsentMessageKeys(line))) {
          hits.push(`${path}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(hits, `analytics/telemetry references in this slice's files:\n${hits.join("\n")}`).toEqual(
      []
    );
  });

  it("gates no code path on the stored quality or analytics booleans", () => {
    // S01-S44 arm 2 · serves S01-R23. PROPERTY: the stored decision loads
    // nothing, unloads nothing and gates nothing today. A future consumer will
    // read it; until then the record is a record.
    //
    // Mechanically: every read of `.quality` / `.analytics` in these files sits
    // in a DATA position — the value of an object-literal property of the same
    // name, or the operand of a `typeof` shape check — and never in a CONTROL
    // position. Those two shapes are exactly the PLAN's own carve-out ("outside
    // the card's own toggle rendering and the R04 write") plus the codec's
    // validator, made mechanical.
    //
    // ONE constant here is deliberately WIDER than the PLAN's sentence, and it
    // has to be: PLAN.md:561 words the arm as "a conditional whose test is
    // `decision.quality` or `decision.analytics`", while the mutant it names one
    // line later is `if (readConsent()?.analytics)` — whose receiver is not
    // `decision`. Read literally the guard could not catch its own named mutant,
    // so the RECEIVER is generalised and the PROPERTY is pinned instead. This is
    // reported as a PLAN defect on ticket t_4c58683b rather than absorbed
    // silently, and the widening is measured to pass against the shipped code
    // before it was written (nine occurrences, all in data positions).
    //
    // What this does NOT catch, stated rather than implied: the shapes are
    // matched per OCCURRENCE against the text preceding them ON THE SAME LINE,
    // so a gate written on a line that also carries a well-formed `quality:`
    // property would slip past. That is a line-shape limit, not a claim about
    // the property.
    //
    // RED watched against the N7 mutant: `if (readConsent()?.analytics) {
    // document.body.dataset.consentAnalytics = "on"; }` inside
    // `CookieConsent.tsx`'s effect.
    const stored = /\??\.(quality|analytics)\b/g;
    const typeofOperand = /\btypeof\s+[\w.?[\]]*$/;
    const dataPosition = (key: string): RegExp =>
      new RegExp(`(?:^|[,{(=?:])\\s*${key}\\s*:\\s*[^,;{}]*$`);

    const gates: string[] = [];
    let reads = 0;
    for (const path of slicesOwnFiles()) {
      read(path)
        .split("\n")
        .forEach((line, index) => {
          const executableLine = withoutConsentMessageKeys(line);
          for (const match of executableLine.matchAll(stored)) {
            reads += 1;
            const before = executableLine.slice(0, match.index);
            const key = match[1]!;
            if (dataPosition(key).test(before) || typeofOperand.test(before)) continue;
            gates.push(`${path}:${index + 1}: ${line.trim()}`);
          }
        });
    }

    // Vacuity floor: the files really do read those booleans, so a scan that
    // found nothing at all would be a broken scan, not a clean slice.
    expect(reads, "the slice does read the two booleans somewhere").toBeGreaterThan(0);
    expect(
      gates,
      `code paths conditioned on the stored booleans:\n${gates.join("\n")}`
    ).toEqual([]);
  });

  it("writes no second Esc listener and no second focus trap under components/consent", () => {
    // S01-S45 arm 1 · serves S01-R18, S01-R20. PROPERTY: `SPEC.md` §Out of scope
    // bans "a second document-level Esc listener and a second focus-trap
    // implementation of any kind — the shared helper is the only one", and a ban
    // with no assertion is a comment.
    //
    // The exclusion is the PLAN's, quoted and not widened: EVERY file under
    // `apps/ui/components/consent/` except `modalSemantics.ts` — which means
    // S02's `PrivacyPolicyModal.tsx` IS scanned. Its `addEventListener("scroll"`
    // and `addEventListener("resize"` (:118, :122) do not match the keydown
    // token, which is why the token is the whole call head and not the bare
    // function name.
    //
    // Comments count, and that is the point (CODE-S01-C5 F1: a JSDoc reading
    // "this component never calls `.focus()`" is one hit for a guard that bans
    // the spelling).
    //
    // RED watched against the N7 mutant: a `useEffect` keydown listener added to
    // `CookiePreferencesCard.tsx`.
    const banned = [
      'addEventListener("keydown"',
      "addEventListener('keydown'",
      '"Escape"',
      "'Escape'",
      ".focus()"
    ];
    const files = nonHelperFiles();
    const hits = banned.flatMap((token) =>
      literalHits(files, token).map((hit) => `${token} -> ${hit}`)
    );

    expect(files.length, "the scan covers every non-helper file in the directory").toBeGreaterThanOrEqual(
      5
    );
    expect(
      hits,
      `a second Esc listener or focus trap under ${CONSENT_DIR}:\n${hits.join("\n")}`
    ).toEqual([]);
  });

  it("keeps the ONE Esc-and-focus implementation inside the shared helper", () => {
    // S01-S45 arm 2 · the other direction of the same property: the guard must
    // fail if a second implementation APPEARS and also if the only one
    // DISAPPEARS. Without this arm, deleting the helper's machinery outright
    // would leave arm 1 green.
    //
    // **This arm is UNVERIFIED by mutation from S01, and that is stated rather
    // than implied** (PLAN.md:570): flipping it means editing
    // `modalSemantics.ts`, which is S02's file and is in S01's forbidden set.
    // It is watched RED only by S02's own C1 cluster, whose TDD-first test
    // creates the helper — before it existed this arm failed for exactly that
    // reason, which is the same RED read from the other side.
    const helper = read(`${CONSENT_DIR}/${SHARED_HELPER}`);

    expect(
      helper.includes('addEventListener("keydown"') ||
        helper.includes("addEventListener('keydown'"),
      "the shared helper still owns the document-level keydown listener"
    ).toBe(true);
    expect(
      helper.includes('"Escape"') || helper.includes("'Escape'"),
      "and still names the dismiss key"
    ).toBe(true);
    expect(helper.includes(".focus()"), "and still moves focus itself").toBe(true);
  });
});

/**
 * The `S01-S43` extractor, factored out so the real stylesheet and the synthetic
 * fixtures above go through the SAME code path — a self-check that ran different
 * code from the assertion would prove nothing about the assertion.
 *
 * Returns the `consent*` selectors that carry an animation or transition
 * declaration inside `css` and are NOT named inside a
 * `prefers-reduced-motion` at-rule in the same text.
 */
function uncoveredMotionSelectors(css: string): string[] {
  const rules = locatedRules(withoutComments(css));
  const carrying = rules
    .filter((rule) => !rule.reducedMotion && MOTION.test(rule.declarations))
    .flatMap((rule) => rule.selectors)
    .filter(isConsentSelector);
  const named = rules
    .filter((rule) => rule.reducedMotion)
    .flatMap((rule) => rule.selectors)
    .filter(isConsentSelector);
  return [...new Set(carrying)].filter((selector) => !named.includes(selector)).sort();
}

/**
 * `animation:` / `transition:` as the PLAN words them, plus their longhands
 * (`transition-property`, `animation-name`, …). The longhands are a deliberate
 * WIDENING of the PLAN's two spellings and are disclosed as such: they are the
 * same property, and a slice that switched to `transition-property` would
 * otherwise carry motion this guard could not see. Measured to change nothing
 * today — the S01 block declares motion in exactly two places, both shorthand.
 */
const MOTION = /(?:^|[;{}\s])(?:animation|transition)(?:-[a-z-]+)?\s*:/;

const isConsentSelector = (selector: string): boolean => /consent/i.test(selector);

const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const normalise = (selector: string): string => selector.trim().replace(/\s+/g, " ");

type LocatedRule = { selectors: string[]; declarations: string; reducedMotion: boolean };

/**
 * Every STYLE rule in `css`, each flagged with whether a `prefers-reduced-motion`
 * at-rule encloses it. At-rules are descended into, so the flag survives any
 * depth of nesting; a style rule's own body is kept whole, so a declaration
 * nested inside it is attributed to the outer selector — the conservative
 * direction for a guard.
 *
 * Comments must be stripped before this runs: this stylesheet's comments carry
 * commas, colons and the word `transition`, all of which would otherwise land in
 * a selector list or a declaration body.
 */
function locatedRules(css: string, reducedMotion = false): LocatedRule[] {
  const out: LocatedRule[] = [];
  for (const rule of topLevelRules(css)) {
    if (rule.prelude.startsWith("@")) {
      out.push(
        ...locatedRules(rule.body, reducedMotion || /prefers-reduced-motion/.test(rule.prelude))
      );
    } else {
      out.push({
        selectors: rule.prelude.split(",").map(normalise).filter((one) => one.length > 0),
        declarations: rule.body,
        reducedMotion
      });
    }
  }
  return out;
}

/** A brace-matching walk: every `<prelude> { <body> }` at the top level of `css`. */
function topLevelRules(css: string): { prelude: string; body: string }[] {
  const rules: { prelude: string; body: string }[] = [];
  let prelude = "";
  let index = 0;
  while (index < css.length) {
    const character = css[index]!;
    if (character === "{") {
      let depth = 1;
      let end = index + 1;
      while (end < css.length && depth > 0) {
        if (css[end] === "{") depth += 1;
        else if (css[end] === "}") depth -= 1;
        end += 1;
      }
      rules.push({ prelude: prelude.trim(), body: css.slice(index + 1, end - 1) });
      prelude = "";
      index = end;
    } else if (character === "}" || character === ";") {
      // A stray `}` closes something this walk already consumed, and a `;` ends
      // a statement at-rule (`@import …;`). Either way what came before it is
      // not the prelude of the next rule.
      prelude = "";
      index += 1;
    } else {
      prelude += character;
      index += 1;
    }
  }
  return rules;
}
