# Orphan audit digit separators + publication-check deadline in the register — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the orphan audit's exported-number rule see numbers written with `_` separators, and resolve the six exports it then flags the way the rule intends; the last one, the pre-publish check's 60-second deadline, moves into the register as a code-owned row that a hosted operator file may override.

**Architecture:** the audit's per-file numeric check becomes an exported pure helper with a separator-aware pattern. Five exports stop being exported (commit `645414a91`, done). The sixth, `PUBLICATION_CHECK_DEADLINE_MS`, becomes the register row `publicationCheckPolicy` (`{"kind":"PUBLICATION_CHECK_POLICY","deadline_ms":60000}`), built like `taxAuthorities`: code-owned in the seeder (so every development and hosted publication seals it), optionally superseded by the hosted operator file, read by the API at start-up inside `boot.run`, and passed to the check and the judge transport. No migration.

**Tech Stack:** TypeScript (Node 26.8.2), pnpm 11.20.0 workspace, vitest 5.0.1, zod, PostgreSQL register (`register.register_row`).

**Spec:** the owner's task (2026-10-04) plus two owner rulings in this session: "Move to register" and "Operator can override". Research map: the read-only register survey in this session (mechanisms C and H; recommendation: a new code-owned single-row family; no migration; support-config family and T16 rows rejected).

## Global Constraints

- One heavy command at a time on this 16 GB Mac; before each, `memory_pressure -Q | tail -1` (free ≥ 40%) and at most one other test run (`pgrep -fl 'vi''test[.]mjs run'`).
- The Bash tool is zsh: quote globs; `grep` is a ugrep function (paths print without `./`).
- Never write `export const NAME = <number>` in `packages/`, `apps/` or `tools/` (the source-purity law). The deadline's value lives in the frozen register row; its cap lives inside the zod schema.
- Never edit a sealed artifact: `register.bootstrap.json` / version 1 (`persistBootstrapRegister`), `tests/support/fixtures/register-development-v4.json`, the acceptance seeder's version 4, migrations 0050, 0055, 0061, 0064.
- No new migration (`register.required_row` stays as it is).
- No machine-specific paths in code, tests or docs.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Text the owner reads (PR description, chat) is plain language.

## Review Focus

1. A hosted API restarted on this code before a new register version is published: it must refuse at start-up naming `PUBLICATION_CHECK_POLICY_UNRESOLVED`, and the runbook must say to publish first (Task 3 test pins the runbook text; Task 1 test pins the refusal code).
2. An operator who writes the deadline in seconds (`60`), as a string, or above the cap: the publish refuses `PUBLICATION_CHECK_POLICY_INVALID` before anything is sealed (Task 1 and Task 3 tests).
3. A raised schema cap that the UI proxy's 85 s publish ceiling no longer covers: the route test must hold the ceiling against the largest D the register accepts, probed by behaviour (Task 4).
4. A composition that ignores the register's D (a stale literal, or no deadline): the check refuses a missing D at run time, and the route test pins that main.ts wires `publicationCheckPolicy.deadlineMs` into both the check and the judge transport (Task 4).
5. A provider-set publication (`pnpm hosted:publish-provider-set`) based on a version older than this release copies that version's rows, so it lacks the row: the runbook's upgrade note says to run the full hosted publish first (Task 3 docs, pinned by its test).

---

### Task 0 (DONE): five exports made module-private — commit `645414a91`

`SHUTDOWN_DEADLINE_MS`, `SHUTDOWN_ESCALATION_GRACE_MS`, `DEV_AUTH_STACK_STOP_TIMEOUT_MS`, `AUTH_REFUSAL_DISTINCT_SOURCE_CAP` private; `EMAIL_CHANGE_RESEND_COOLDOWN_MS` (and its twin `EMAIL_CHANGE_LINK_TTL_MS`) now private defaults of `EmailChangeService`, pinned by `tests/unit/email-change-timings.test.ts`.

### Task 1: the `publicationCheckPolicy` row, its parser and its reader

**Files:**
- Create: `packages/register/src/publication-check-policy.ts`
- Modify: `packages/register/src/index.ts` (export block after the `tax-authorities.js` block)
- Modify: `tests/support/shipped-corpus.manifest.txt` (one line, sorted)
- Test: `tests/unit/publication-check-policy.test.ts` (create)

**Interfaces:**
- Produces: `PUBLICATION_CHECK_POLICY_ROW_KEY = "publicationCheckPolicy"`; `type PublicationCheckPolicy = Readonly<{ deadlineMs: number }>`; `publicationCheckPolicyFromValue(value: unknown, sourceRef: string): PublicationCheckPolicy` (throws `TypedDomainError` code `PUBLICATION_CHECK_POLICY_INVALID`); `readPublicationCheckPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<PublicationCheckPolicy>` (throws `PUBLICATION_CHECK_POLICY_UNRESOLVED`); `PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW = { rowKey, sourceRef, value: { kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 60_000 } }`.

- [ ] **Step 1: Write the failing test** `tests/unit/publication-check-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW,
  PUBLICATION_CHECK_POLICY_ROW_KEY,
  publicationCheckPolicyFromValue,
  readPublicationCheckPolicy
} from "../../packages/register/src/index.js";

const row = PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW;
const codeOf = async (run: () => unknown): Promise<string> => {
  try {
    await run();
    return "NO_REFUSAL";
  } catch (error) {
    return (error as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("publicationCheckPolicy: the pre-publish check's deadline D as a register row (owner, 2026-10-04)", () => {
  it("is a code-owned row holding SPEC-v2 R7's 60-second cap", () => {
    expect(PUBLICATION_CHECK_POLICY_ROW_KEY).toBe("publicationCheckPolicy");
    expect(row.rowKey).toBe("publicationCheckPolicy");
    const policy = publicationCheckPolicyFromValue(row.value, row.sourceRef);
    expect(policy).toEqual({ deadlineMs: 60_000 });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it("accepts whole milliseconds from 1 000 to 60 000 and refuses everything else", async () => {
    const valueOf = (deadline: unknown) => ({ kind: "PUBLICATION_CHECK_POLICY", deadline_ms: deadline });
    expect(publicationCheckPolicyFromValue(valueOf(1_000), "x").deadlineMs).toBe(1_000);
    expect(publicationCheckPolicyFromValue(valueOf(60_000), "x").deadlineMs).toBe(60_000);
    for (const deadline of [60, 999, 60_001, 0, -1, 1_500.5, "60000", null]) {
      expect(await codeOf(() => publicationCheckPolicyFromValue(valueOf(deadline), "x")), String(deadline))
        .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    }
    expect(await codeOf(() => publicationCheckPolicyFromValue({ ...row.value, extra: 1 }, "x")))
      .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    expect(await codeOf(() => publicationCheckPolicyFromValue({ deadline_ms: 60_000 }, "x")))
      .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    expect(await codeOf(() => publicationCheckPolicyFromValue(null, "x"))).toBe("PUBLICATION_CHECK_POLICY_INVALID");
    expect(await codeOf(() => publicationCheckPolicyFromValue(row.value, " "))).toBe("PUBLICATION_CHECK_POLICY_INVALID");
  });

  it("reads the row at the pinned version, and refuses a version without it by name", async () => {
    const asked: unknown[][] = [];
    const pool = (value: unknown) => ({
      query: async (_text: string, parameters: unknown[]) => {
        asked.push(parameters);
        return { rows: value === null ? [] : [{ value_json: value, source_ref: "v1" }] };
      }
    }) as never;
    expect(await readPublicationCheckPolicy(pool(row.value), 7)).toEqual({ deadlineMs: 60_000 });
    expect(asked).toEqual([[7, "publicationCheckPolicy"]]);
    expect(await codeOf(() => readPublicationCheckPolicy(pool(null), 7))).toBe("PUBLICATION_CHECK_POLICY_UNRESOLVED");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (the exports do not exist):
`run-de.sh exec vitest run tests/unit/publication-check-policy.test.ts` → `PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW` undefined / "is not a function".

- [ ] **Step 3: Write `packages/register/src/publication-check-policy.ts`:**

```ts
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";

/**
 * hate-speech S02 — THE PRE-PUBLISH CHECK'S DEADLINE D, as a sealed register row (owner's ruling 2026-10-04).
 *
 * Every judge call of one publish attempt shares ONE `AbortSignal.timeout(D)` (apps/api/src/publication-check/
 * check.ts). SPEC-v2 R7 caps D at 60 s and ruling R-D2 (FIX-HS2-p2 ui-B2) set it to that cap: at 50 s the §4 eval
 * against the dev judge still failed one run in three (one call past 50 s); what stays slower than 60 s is the dev
 * judge's own tail (V-15). The judge transport's backstop is D + 10 s, and the UI proxy's publish ceiling (85 s,
 * apps/ui/app/api/[...path]/route.ts) is sized for the cap, so the schema refuses anything above 60 000 ms; below
 * 1 000 ms it refuses a deadline written in seconds. A check that cannot finish refuses the publish (fail closed).
 *
 * Code-owned: every development and hosted publication seals this row, and a hosted operator file may supersede it
 * with its own `publicationCheckPolicy` member (deploy/vps/register/README.md). The API reads it at start-up and
 * refuses a register version without it. Until 2026-10-04 D was the exported constant PUBLICATION_CHECK_DEADLINE_MS,
 * which the source-purity law (tools/orphan-audit) refuses once it sees digit separators.
 */
export const PUBLICATION_CHECK_POLICY_ROW_KEY = "publicationCheckPolicy" as const;

export type PublicationCheckPolicy = Readonly<{ deadlineMs: number }>;

const publicationCheckPolicyValueSchema = z.object({
  kind: z.literal("PUBLICATION_CHECK_POLICY"),
  deadline_ms: z.number().int().min(1_000).max(60_000)
}).strict();

export type PublicationCheckPolicyValue = z.infer<typeof publicationCheckPolicyValueSchema>;

export function publicationCheckPolicyFromValue(value: unknown, sourceRef: string): PublicationCheckPolicy {
  const parsed = publicationCheckPolicyValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("PUBLICATION_CHECK_POLICY_INVALID", "The sealed publication-check policy row is malformed");
  }
  return Object.freeze({ deadlineMs: parsed.data.deadline_ms });
}

/** The row at a register version. A version without it refuses by name: the check has no deadline of its own. */
export async function readPublicationCheckPolicy(
  pool: Pick<Pool, "query">,
  registerVersion: number
): Promise<PublicationCheckPolicy> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, PUBLICATION_CHECK_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "PUBLICATION_CHECK_POLICY_UNRESOLVED",
      `No ${PUBLICATION_CHECK_POLICY_ROW_KEY}@${registerVersion} exists`
    );
  }
  return publicationCheckPolicyFromValue(row.value_json, row.source_ref);
}

export const PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: PUBLICATION_CHECK_POLICY_ROW_KEY,
  sourceRef: "hate-speech S02: SPEC-v2 R7 (D <= 60 s) and ruling R-D2 (FIX-HS2-p2 ui-B2, D = 60 000 ms), recorded in"
    + " apps/api/src/publication-check/check.ts at eb7269e1a (PR #56); sealed as a register row by the owner's"
    + " ruling of 2026-10-04",
  value: Object.freeze({
    kind: "PUBLICATION_CHECK_POLICY" as const,
    deadline_ms: 60_000
  })
});
```

Export block in `packages/register/src/index.ts`, right after the `} from "./tax-authorities.js";` block:

```ts
// hate-speech S02: the pre-publish check's deadline, a code-owned row a hosted file may supersede (owner, 2026-10-04).
export {
  PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW,
  PUBLICATION_CHECK_POLICY_ROW_KEY,
  publicationCheckPolicyFromValue,
  readPublicationCheckPolicy,
  type PublicationCheckPolicy,
  type PublicationCheckPolicyValue
} from "./publication-check-policy.js";
```

Shipped corpus: insert `packages/register/src/publication-check-policy.ts` into `tests/support/shipped-corpus.manifest.txt` in sorted position (between the neighbouring `packages/register/src/` lines).

- [ ] **Step 4: Run, expect PASS:** the new test file, then `tests/unit/s1-1-depth-contract.test.ts -t "parses every shipped file"` (manifest drift = `{ added: [], missing: [] }`).

- [ ] **Step 5:** no commit yet (Task 2 seals the row; commit them together so the row never exists unsealed).

### Task 2: seal the row in every development and hosted publication

**Files:**
- Modify: `apps/runner/src/dev-deployment-register.ts` (import list; `developmentRows` after `TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW`)
- Test: `tests/architecture/register-support-publication.test.ts` (the `developmentRows` count pins, ~lines 428-439)

**Interfaces:** Consumes Task 1's `PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW`. Produces: every `buildDevelopmentDeploymentRegisterPublicationRows(...)` result (local and hosted) carries a `publicationCheckPolicy` row.

- [ ] **Step 1: Update the pins (failing first).** Append to the comment block, before `const storyKeys`:

```ts
    // hate-speech S02 x THE OWNER'S RULING OF 2026-10-04: +1. The deployment now also seals `publicationCheckPolicy`
    // (the pre-publish check's deadline; packages/register/src/publication-check-policy.ts). A DEPLOYMENT row, so
    // `historicalRows` stays 14 and the legacy hash is untouched. MEASURED: the port emits 62 with no duplicate keys,
    // and 61 with the key removed.
```

and change the pins: `61 → 62`, `55 → 56`, each `60 → 61`, `59 → 60`, and add
`expect(developmentRows.filter((row) => row.rowKey !== "publicationCheckPolicy")).toHaveLength(61);`

- [ ] **Step 2: Run, expect FAIL:** `run-de.sh exec vitest run tests/architecture/register-support-publication.test.ts` → `expected [...] to have a length of 62 but got 61`.

- [ ] **Step 3: Seal it.** Import `PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW` from `@debateai/register` in `dev-deployment-register.ts`, and in `developmentRows` after `TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW,`:

```ts
    // hate-speech S02 (owner's ruling 2026-10-04): the pre-publish check's deadline D. Code-owned, so every
    // publication carries it and the API can refuse a version without it; a hosted file may supersede it.
    PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW,
```

- [ ] **Step 4: Run, expect PASS:** the register architecture test, `tests/architecture/dev-deployment-register.test.ts`, `tests/unit/tax-authorities.test.ts`, `tests/unit/publication-check-policy.test.ts`.

- [ ] **Step 5: Commit** Tasks 1+2: `feat(register): seal the pre-publish check's deadline as the code-owned row publicationCheckPolicy`.

### Task 3: the hosted operator override, the start-up readiness check, and the runbooks

**Files:**
- Modify: `apps/runner/src/hosted-register-publish.ts` (header comment; imports; `TOP_LEVEL_KEYS`; `HostedRegisterFile`; `parseHostedRegisterFile`; `planHostedRegisterPublication` validation + `operatorRows`; `verifyHostedRegisterBootReadiness`)
- Modify: `deploy/vps/register/README.md` (members table; "What `sourceRef` becomes")
- Modify: `deploy/vps/README.md` (§11 "must carry" table; refusal table; the newest-version SQL check; a new "Upgrading to the publication-check deadline release" section after the model-scorecard one)
- Test: `tests/unit/publication-check-policy.test.ts` (append one `it`)

**Interfaces:** Consumes Task 1's parser and reader. Produces: an optional hosted-file member `publicationCheckPolicy` (raw value, validated by `publicationCheckPolicyFromValue`, sealed under the file's `sourceRef`, replacing the code-owned twin); `verifyHostedRegisterBootReadiness` calls `readPublicationCheckPolicy`.

- [ ] **Step 1: Write the failing test** (append inside the describe; add imports `readFile` from `node:fs/promises` and `hostedRegisterRefusalCode`, `parseHostedRegisterFile`, `planHostedRegisterPublication` from `../../apps/runner/src/hosted-register-publish.js`):

```ts
  it("is sealed by every hosted publication, and the operator's file may supersede it", async () => {
    const example = JSON.parse(await readFile(
      new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const plan = async (file: unknown) =>
      planHostedRegisterPublication(parseHostedRegisterFile(Buffer.from(JSON.stringify(file))));
    const sealedIn = async (file: unknown) =>
      (await plan(file)).rows.filter((candidate) => candidate.rowKey === "publicationCheckPolicy");
    // The kit's example leaves the member out, so a file copied from it seals the code-owned row, under its provenance.
    expect(Object.hasOwn(example, "publicationCheckPolicy")).toBe(false);
    const defaulted = await sealedIn(example);
    expect(defaulted).toHaveLength(1);
    expect(JSON.parse(defaulted[0]!.valueJsonText)).toEqual(row.value);
    expect(defaulted[0]!.sourceRef).toBe(row.sourceRef);
    // The operator's member supersedes it, sealed under the file's own sourceRef.
    const supplied = await sealedIn({ ...example, publicationCheckPolicy: { kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 45_000 } });
    expect(supplied).toHaveLength(1);
    expect(JSON.parse(supplied[0]!.valueJsonText)).toEqual({ kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 45_000 });
    expect(supplied[0]!.sourceRef).toBe(example.sourceRef);
    const refusalOf = async (file: unknown): Promise<string> => {
      try {
        await plan(file);
        return "NO_REFUSAL";
      } catch (error) {
        return hostedRegisterRefusalCode(error);
      }
    };
    expect(await refusalOf({ ...example, publicationCheckPolicy: { kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 60_001 } }))
      .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    expect(await refusalOf({ ...example, publicationCheckPolicy: { kind: "PUBLICATION_CHECK_POLICY", deadline_ms: 60 } }))
      .toBe("PUBLICATION_CHECK_POLICY_INVALID");
    // A member present with JSON null is not "left out": it is refused, never defaulted.
    expect(await refusalOf({ ...example, publicationCheckPolicy: null })).toBe("PUBLICATION_CHECK_POLICY_INVALID");
    // The runbooks name the member, the refusals and the upgrade order.
    const registerReadme = await readFile(new URL("../../deploy/vps/register/README.md", import.meta.url), "utf8");
    expect(registerReadme).toContain("| `publicationCheckPolicy` |");
    expect(registerReadme).toContain("Left out, the code-owned `publicationCheckPolicy` row is published unchanged");
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    for (const needle of ["| `publicationCheckPolicy` |", "`PUBLICATION_CHECK_POLICY_UNRESOLVED`",
      "| `PUBLICATION_CHECK_POLICY_INVALID` |", "### Upgrading to the publication-check deadline release",
      "pnpm hosted:publish-provider-set"]) expect(readme, needle).toContain(needle);
  });
```

- [ ] **Step 2: Run, expect FAIL:** the supplied member is refused `HOSTED_REGISTER_FILE_KEY_UNKNOWN`.

- [ ] **Step 3: Implement** in `hosted-register-publish.ts`, mirroring `taxAuthorities` exactly:
  - header comment, after the `taxAuthorities` sentence: "Likewise optional, the `publicationCheckPolicy` (the pre-publish check's deadline, owner's ruling 2026-10-04, checked by the register's own parser); without the member the seeder's code-owned row is sealed as it is."
  - import `PUBLICATION_CHECK_POLICY_ROW_KEY`, `publicationCheckPolicyFromValue`, `readPublicationCheckPolicy` from `@debateai/register`;
  - `TOP_LEVEL_KEYS`: after `"taxAuthorities"` add `// hate-speech S02 (owner, 2026-10-04): OPTIONAL. Left out, the code-owned publicationCheckPolicy row is sealed as it is.` and `"publicationCheckPolicy"`;
  - `HostedRegisterFile`: `/** Optional (2026-10-04): the pre-publish check's deadline; absent = the code-owned row. */ publicationCheckPolicy?: unknown;`
  - `parseHostedRegisterFile` return: `...(Object.hasOwn(record, "publicationCheckPolicy") ? { publicationCheckPolicy: record.publicationCheckPolicy } : {})`
  - `planHostedRegisterPublication`, after the `taxAuthoritiesFromValue` line: `// hate-speech S02: the operator's deadline, by the register's own parser (PUBLICATION_CHECK_POLICY_INVALID). Absent member = the code-owned row, sealed as it is.` and `if (file.publicationCheckPolicy !== undefined) publicationCheckPolicyFromValue(file.publicationCheckPolicy, file.sourceRef);`
  - `operatorRows`, after the `taxAuthorities` block:

```ts
  if (file.publicationCheckPolicy !== undefined) {
    operatorRows.set(PUBLICATION_CHECK_POLICY_ROW_KEY, Object.freeze({
      rowKey: PUBLICATION_CHECK_POLICY_ROW_KEY,
      valueJsonText: canonicalRowValue(file.publicationCheckPolicy),
      sourceRef: file.sourceRef
    }));
  }
```

  - `verifyHostedRegisterBootReadiness`, after `await readDeploymentRiskTier(pool, version);`: `// hate-speech S02: main.ts's publication-check-policy stage (the pre-publish check's deadline).` and `await readPublicationCheckPolicy(pool, version);`
  - `deploy/vps/register/README.md`, members table, after the `taxAuthorities` row: `| \`publicationCheckPolicy\` | optional, and NOT in the example: the deadline of the safety check that runs before a debate is published, as \`{"kind": "PUBLICATION_CHECK_POLICY", "deadline_ms": 60000}\`, in whole milliseconds from 1000 to 60000 (60 s is the spec's cap, and the website waits 85 s for a publish). Left out, the code-owned \`publicationCheckPolicy\` row is published unchanged (60000); include the member only to change the deadline | the register's own parser — \`PUBLICATION_CHECK_POLICY_INVALID\` (a \`null\` member is refused too) |`; and in "What `sourceRef` becomes", a bullet like the `taxAuthorities` one for this row.
  - `deploy/vps/README.md`: "must carry" table row `| \`publicationCheckPolicy\` | the API refuses: \`PUBLICATION_CHECK_POLICY_UNRESOLVED\`; every version \`pnpm register:publish-hosted\` seals from this release on carries it (the code-owned 60000, or the file's member) |`; refusal table row `| \`PUBLICATION_CHECK_POLICY_INVALID\` | the file's optional \`publicationCheckPolicy\` is not \`{"kind": "PUBLICATION_CHECK_POLICY", "deadline_ms": N}\` with N whole milliseconds from 1000 to 60000, or the member is \`null\` |`; the newest-version SQL check gains `'publicationCheckPolicy'` and "Four rows is the pass"; and the upgrade section (after "Upgrading to the model-scorecard release"):

```markdown
### Upgrading to the publication-check deadline release

This release moves the deadline of the safety check that runs before a debate is published (60 seconds) out of
the code and into the register, as the code-owned row `publicationCheckPolicy` (owner's ruling 2026-10-04). The API
reads it at start-up and refuses a register version without it (`PUBLICATION_CHECK_POLICY_UNRESOLVED`). No migration.

- **Publish a new hosted register version before the API restarts on this code.** From the new checkout, run
  `pnpm register:publish-hosted` with the same `/etc/debateai/register/hosted-register.json` (§11): it seals this
  checkout's code-owned rows, `publicationCheckPolicy` among them, as a new version and runs the start-up readers
  against it. Pin that version in both `EnvironmentFile`s and restart both units. Do this before any later
  `pnpm hosted:publish-provider-set`: that command copies the rows of the version it starts from, so on an older
  version it seals one this API refuses.
- **To change the deadline**, add the optional `publicationCheckPolicy` member to the hosted file
  (`deploy/vps/register/README.md`) and publish again: whole milliseconds from 1000 to 60000.
- **Rolling back** needs no register change: an older API does not read the row.
```

- [ ] **Step 4: Run, expect PASS:** the new test, `tests/unit/tax-authorities.test.ts`, `tests/unit/hosted-register-publish.test.ts`, `tests/unit/country-policy.test.ts`, `tests/architecture/vps-billing-runbook.test.ts`, `tests/architecture/b11-cost-envelopes-runbook.test.ts`, `tests/architecture/vps-deployment-baseline.test.ts`.

- [ ] **Step 5: Commit:** `feat(register): let the hosted operator file supersede publicationCheckPolicy, and check it before pinning`.

### Task 4: the API takes D from the register

**Files:**
- Modify: `apps/api/src/publication-check/check.ts` (remove `PUBLICATION_CHECK_DEADLINE_MS` and its doc block; `deadlineMs: number` required in `JudgeOptions` and in `createPublicationContentCheck`'s deps; guard + `AbortSignal.timeout(options.deadlineMs)`)
- Modify: `apps/api/src/publication-check/judge-transport.ts` (drop the import; module-private `ADAPTER_BACKSTOP_MARGIN_MS = 10_000`; required option `deadlineMs`; backstop `options.deadlineMs + ADAPTER_BACKSTOP_MARGIN_MS`)
- Modify: `apps/api/src/main.ts` (import `readPublicationCheckPolicy`; `boot.run("publication-check-policy", …)` before the publication-judge switch; pass `deadlineMs: publicationCheckPolicy.deadlineMs` to the transport and the check; reword the `ct-B4: D is the one constant.` comment)
- Modify: `acceptance/hs-eval-s02.ts` (D from `PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW.value.deadline_ms` for its four `judgeParts` calls and its transport)
- Modify: `apps/ui/app/api/[...path]/route.ts` (comment lines 48-53 only)
- Test: `tests/unit/hs-s02-check.test.ts`, `tests/unit/hs-s02-judge-transport.test.ts`, `tests/unit/hs-s02-publish-route.test.ts`, `tests/integration/hs-s02-publish-database.test.ts`

**Interfaces:** Consumes Task 1's `readPublicationCheckPolicy` and the row constant. Produces: `createPublicationContentCheck({ …, deadlineMs: number })`, `judgeParts({ judge, deadlineMs: number, … }, parts)`, `createPublicationJudgeTransport(target, { readAuthorizationHeader, deadlineMs: number, … })`.

- [ ] **Step 1: Write the failing tests.**
  - Every test file above: `import { PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW } from "../../packages/register/src/publication-check-policy.js";` and `const D = PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW.value.deadline_ms;` (the register's code-owned D); add `deadlineMs: D` to every `createPublicationContentCheck(`, `judgeParts(` and `createPublicationJudgeTransport(` call that passes none.
  - `hs-s02-check.test.ts`: replace the test "arms D = PUBLICATION_CHECK_DEADLINE_MS = 60 000 ms by default, and the eval core shares it" with "arms exactly the D it is given — the register's 60 000 ms included — and the eval core shares it" (asserts `AbortSignal.timeout` is called with `[D]` for the composed check, `D === 60_000`, and `[12_345]` for `judgeParts({ …, deadlineMs: 12_345 })`), plus "refuses to judge without a usable D" (`deadlineMs` of `undefined`, `0`, `1.5` each rejects `RangeError("Invalid judge deadline")` before any judge call).
  - `hs-s02-judge-transport.test.ts`: the backstop test uses `deadlineMs: D` (armed > D and ≤ D + 10 000), and a second case with `deadlineMs: 30_000` (armed > 30 000 and ≤ 40 000), so the transport provably measures from the D it is given.
  - `hs-s02-publish-route.test.ts`: drop the `PUBLICATION_CHECK_DEADLINE_MS` import; the composition test becomes "main.ts wires D from the register's publicationCheckPolicy row into the composed check and the judge transport, and nothing else": composition's `deadlineMs` matches exactly `["deadlineMs: publicationCheckPolicy.deadlineMs"]`, main contains `const publicationCheckPolicy = await boot.run("publication-check-policy", () => readPublicationCheckPolicy(pool, environment.REGISTER_VERSION));`, the transport call contains `deadlineMs: publicationCheckPolicy.deadlineMs`, and the composition carries no numeric literal; the UI-ceiling test probes the register's largest accepted D (`publicationCheckPolicyFromValue` accepts 60 000 and refuses 60 001) and holds `PUBLISH_UPSTREAM_TIMEOUT_MS ≥ 60 000 + 20 000`.

- [ ] **Step 2: Run, expect FAIL:** the composition test (main.ts still wires the constant), the transport's 30 000 case (backstop still 70 000), and the D-guard test.

- [ ] **Step 3: Implement** the five source files as listed under **Files**. In `check.ts`, the guard sits before the signal: `if (!Number.isSafeInteger(options.deadlineMs) || options.deadlineMs < 1) throw new RangeError("Invalid judge deadline");`. In `main.ts`:

```ts
// hate-speech S02 (owner's ruling 2026-10-04): D, the check's deadline, is the register's publicationCheckPolicy row,
// read at start-up; a version without it refuses here (PUBLICATION_CHECK_POLICY_UNRESOLVED). ct-B4: the running
// deployment's D is that row, wired into the check and the judge transport's backstop (D + 10 s), never a literal.
const publicationCheckPolicy = await boot.run("publication-check-policy", () => readPublicationCheckPolicy(pool, environment.REGISTER_VERSION));
```

- [ ] **Step 4: Run, expect PASS:** the four hs-s02 unit files, `tests/unit/dl7-f7-boot-custody.test.ts`, then `pnpm run typecheck`, then (integration, alone) `tests/integration/hs-s02-publish-database.test.ts`.

- [ ] **Step 5: Commit:** `feat(api): read the pre-publish check's deadline from the register at start-up`.

### Task 5: the audit fix itself (implemented and proven earlier in this session)

**Files:** `tools/orphan-audit/src/index.ts`, `tests/architecture/scaffold.test.ts` (already in the worktree, uncommitted); `.hermes/TOOLING-TRAPS.md` (one dated line under "The source-purity law does not see a NUMERIC SEPARATOR").

- [ ] **Step 1:** `run-de.sh run audit:source` prints exactly the three known `obs-capture` lines.
- [ ] **Step 2:** append to the trap entry: `- *Fixed 2026-10-04* (\`auditNumericSourceLiteralExports\`, pinned by tests/architecture/scaffold.test.ts): digit separators are seen now. \`N as const\`, a product such as \`24 * 3_600_000\` and a type annotation still are not, so this entry's rule stands for those.`
- [ ] **Step 3: Commit** with the prepared message (scratchpad `commit3.txt`).

### Task 6: verification and shipping

- [ ] `pnpm run typecheck`; `pnpm run test:ci-gate` (expect `new=0`, the three recorded known reds); `pnpm run audit:architecture` and `audit:source` (only the known obs-capture entries); the unit tests of tools/orphan-audit (`tests/architecture/scaffold.test.ts`, `tests/unit/s1-1-depth-contract.test.ts`).
- [ ] Integration, one at a time: `tests/integration/hosted-register-publish.test.ts`, `tests/integration/hs-s02-publish-database.test.ts`, `tests/integration/email-change-service.test.ts`, `tests/integration/dev-deployment-register.test.ts`, `tests/integration/register-support-publication.test.ts`.
- [ ] Final whole-branch review by a fresh Opus reviewer; fix findings.
- [ ] `git fetch origin`, merge `origin/dev`, re-run what the merge touched, push, `gh pr create --base dev`, bind the PR, fix CI, merge when `verify` and `secrets` are green.
