#### Cluster S03-C3 — the cost-envelope refusal a hosted operator meets, everywhere the README names it (V-11, V-14)

Added by Revision 4, for SPEC-v3's R3.4 (V-11) and R3.4b (V-14). C1 and C2 are BUILT
(`604b15158`, `ec66d5e7c`), and their blocks above are the record of what was built. This cluster is
a fix ON TOP of C2.

**START frame.** The lane `.worktrees/pes-s03/dialectical-engine` is at `ec66d5e7c`. Measured there
by this node:
- `grep -n COST_ENVELOPES_NOT_SEALED deploy/vps/README.md` prints three lines:
  - `:700` is the end of §10's bullet `:692-700`.
  - `:737` is inside §11's support-chat note `:734-739`.
  - `:769` is §11's refusal-table row.
- `v9` is `28/0`, and `baseline` is `31/0`.
- C2's command prints `CLUSTER_GREEN` (`probes/ARCH-FIX-PES-S03-p4/c2-cluster.log`).

A BUILD seat re-measures these before its first edit. Every criterion below is a string anchor, so a
moved line number is provenance and not a dependency.

**Write surface.**
- `tests/unit/v9-provider-credential-files.test.ts`: one new `describe` block, appended after the
  `describe("S03 §11 says what the shipped code does")` block, which is the last block of the file.
  No existing line of the file changes.
- `deploy/vps/README.md`, exactly three regions:
  - (i) the paragraph at the string `**What the support chat cannot tell you yet.**` (§11);
  - (ii) the one table line starting `` | `COST_ENVELOPES_NOT_SEALED` | `` (§11's refusal table);
  - (iii) the bullet starting `- **The production maker path is now ruled` (§10).
- No other region, and no file under `apps/` or `packages/`.

C3 runs after C2 and writes the same two files, so the single-writer rule holds by sequence.

**The three cases, as code.** C3-1, C3-2 and C3-3 each add ONE `it(` from this block. C3-1 creates
the `describe` wrapper and its four helpers (`kit`, `collapse`, `supportNote`, `ROW_START`), and the
two later steps add their `it(` inside it. A seat copies the text; the strings are EXACT.

```ts
describe("S03 the kit names the cost-envelope refusal a hosted operator meets (V-11, V-14)", () => {
  const kit = () => readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
  const collapse = (text: string) => text.replace(/\s+/gu, " ");
  const supportNote = (readme: string) => readme
    .slice(readme.indexOf("## 11. Providers and vendors"))
    .split(/\n[ \t]*\n/u)
    .find((block) => block.includes("SUPPORT_MODEL_COST_UNREPORTED")) ?? "";
  const ROW_START = "| `COST_ENVELOPES_NOT_SEALED` |";

  it("README §11's support-chat note names the refusal a hosted operator meets (R3.4)", async () => {
    const note = collapse(supportNote(await kit()));
    expect(note, "the overruled sentence is gone (C3-4)").not.toContain(
      "refuses to start until the cost envelopes are sealed"
    );
    expect(note, "R3.4 first part, EXACT (C3-4)").toContain(
      "A hosted deployment reads the `costEnvelopePolicy` row in force at its own `REGISTER_VERSION` and refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none, or with `COST_ENVELOPE_POLICY_INVALID` when the row it sealed is malformed."
    );
    expect(note, "R3.4 second part, EXACT (C3-4)").toContain(
      "`COST_ENVELOPES_NOT_SEALED` is a check on the integrity of the build: it fires only when the envelope row this build ships was removed, emptied or made invalid, and the shipped source never reaches it at runtime."
    );
  });

  it("README §11's refusal row for COST_ENVELOPES_NOT_SEALED calls it a build-integrity check (R3.4b a)", async () => {
    const readme = await kit();
    const refusal = readme.slice(
      readme.indexOf("### What the hosted mode refuses, in code"),
      readme.indexOf("### The credential-file contract")
    ).split("\n");
    expect(refusal.filter((line) => line.startsWith(ROW_START)), "the row, EXACT, once, in the table (C3-5)").toEqual([
      "| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows below. |"
    ]);
    const rowAt = (code: string) => refusal.findIndex((line) => line.startsWith("| `" + code + "` |"));
    for (const code of ["COST_ENVELOPE_POLICY_UNRESOLVED", "COST_ENVELOPE_POLICY_INVALID"]) {
      expect(rowAt(code), `${code}'s row is one of "the two rows below"`).toBeGreaterThan(rowAt("COST_ENVELOPES_NOT_SEALED"));
    }
    for (const stale of ["are not published yet", "refuses to claim work until they are"]) {
      expect(collapse(readme), `no "${stale}" anywhere in the README`).not.toContain(stale);
    }
  });

  it("README §10's production-maker bullet names the live refusal, and two lines name COST_ENVELOPES_NOT_SEALED (R3.4b b)", async () => {
    const readme = await kit();
    const start = readme.indexOf("- **The production maker path is now ruled");
    expect(start, "§10's bullet exists").toBeGreaterThanOrEqual(0);
    const bullet = readme.slice(start, readme.indexOf("\n- ", start + 1));
    expect([...bullet.matchAll(/`([A-Z][A-Z0-9_]{4,})`/gu)].map((match) => match[1]), "the bullet names these two codes and no other (C3-6)")
      .toEqual(["COST_ENVELOPE_POLICY_UNRESOLVED", "COST_ENVELOPE_POLICY_INVALID"]);
    expect(collapse(bullet), "R3.4b (b), EXACT (C3-6)").toContain(
      "Until V-28's cost-envelope policy is sealed at the register version a hosted deployment runs, that deployment refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`."
    );
    const mentions = readme.split("\n").filter((line) => line.includes("COST_ENVELOPES_NOT_SEALED"));
    expect(mentions, "exactly two README lines name COST_ENVELOPES_NOT_SEALED (R3.4b)").toHaveLength(2);
    expect(mentions.filter((line) => line.startsWith(ROW_START)), "one of them is the table row").toHaveLength(1);
    const noteLines = supportNote(readme).split("\n");
    expect(mentions.filter((line) => noteLines.includes(line)), "the other is inside the support-chat note").toHaveLength(1);
  });
});
```

The three document texts below are the same strings the cases pin. The gate
`probes/ARCH-FIX-PES-S03-p4/gate.mjs` reads the case code and the `text` blocks OUT OF THIS FILE.
It builds each step's README state from the lane's README at `ec66d5e7c`, then runs the extracted
cases on every state and on every mutant (§3).

**C3-1 · RED — the support-note case (R3.4).** Append the `describe` wrapper with its four helpers
and the FIRST `it(` above: `README §11's support-chat note names the refusal a hosted operator meets (R3.4)`.
- **Done when:** `v9` reads `passed=28 failed=1`, the failing case is this one with the message
  `R3.4 first part, EXACT (C3-4)`, and the C3 command prints `CLUSTER_RED`. `baseline` stays `31/0`.
- **Capable of failing:** at `ec66d5e7c` the note carries the overruled sentence at
  `deploy/vps/README.md:736-737`. The negative assertion is therefore live, and so is the first
  EXACT one (gate state `S0`).
- **Catches:** the overruled sentence left in place beside the new ones. Either of R3.4's two parts
  missing or worded otherwise.
- **Does NOT catch:** a THIRD sentence added to the note that contradicts the two, for example "and a
  hosted runner refuses to claim work until the envelopes are published". The case pins presence,
  not the note's full text. `REV(S03)` reads the diff of region (i).

**C3-2 · RED — the refusal-row case (R3.4b (a)).** Add the SECOND `it(` above:
`README §11's refusal row for COST_ENVELOPES_NOT_SEALED calls it a build-integrity check (R3.4b a)`.
- **Done when:** `v9` reads `passed=28 failed=2`, and this case fails with
  `the row, EXACT, once, in the table (C3-5)`. `CLUSTER_RED`.
- **Capable of failing:** the row at `:769` still says "are not published yet" (gate state `S0`).
- **Catches:**
  - the row dropped from the table (V-14 read as "remove");
  - the row moved out of the refusal span;
  - the row duplicated;
  - the old Meaning text kept, whole or in part;
  - the two old phrases re-appearing anywhere else in the README;
  - either live-code row moved above it, which would make "the two rows below" false.
- **Does NOT catch:** nothing in the row's own text. The row is pinned EXACT, as ONE line, because a
  Markdown table row cannot wrap.

**C3-3 · RED — the §10 bullet and end-state case (R3.4b (b)).** Add the THIRD `it(` above:
`README §10's production-maker bullet names the live refusal, and two lines name COST_ENVELOPES_NOT_SEALED (R3.4b b)`.
- **Done when:** `v9` reads `passed=28 failed=3`, and this case fails with
  `the bullet names these two codes and no other (C3-6)`. `CLUSTER_RED`. These are the three RED
  events of this cluster, all written before any document step.
- **Capable of failing:** at `ec66d5e7c` the bullet's only code is `COST_ENVELOPES_NOT_SEALED`
  (`:700`), and the README has three lines naming it (gate state `S0`).
- **Catches:**
  - the bullet keeping `COST_ENVELOPES_NOT_SEALED` beside the two live codes;
  - the bullet deleted instead of re-worded;
  - a third mention added anywhere, the known-stale list included;
  - the support note losing its mention while the row keeps its own.
- **Does NOT catch:** a second mention of the code on the SAME line as a counted one. The count is
  per line, as SPEC-v3's `grep -n` is (`SPEC-v3.md:104-105`). A swap that keeps the count at 2, where
  the note loses its mention and a new line elsewhere gains one, IS caught: the two `filter`
  assertions require one line to be the row and one to be inside the note (gate mutant `M_swap`).

**C3-4 · the support-chat note (R3.4, V-11).** In the paragraph at the string
`**What the support chat cannot tell you yet.**`, replace this one sentence (it spans
`deploy/vps/README.md:736-737` at `ec66d5e7c`):

```text
A hosted deployment refuses to start until the cost envelopes are sealed, with the code `COST_ENVELOPES_NOT_SEALED`.
```

with these two sentences:

```text
A hosted deployment reads the `costEnvelopePolicy` row in force at its own `REGISTER_VERSION` and refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none, or with `COST_ENVELOPE_POLICY_INVALID` when the row it sealed is malformed. `COST_ENVELOPES_NOT_SEALED` is a check on the integrity of the build: it fires only when the envelope row this build ships was removed, emptied or made invalid, and the shipped source never reaches it at runtime.
```

Hard-wrap at about 100 columns like the paragraph around it; C3-1 collapses whitespace. Every other
sentence of the paragraph stays byte-identical, including the one before (ending `(V-28).`) and the
one after (naming `SUPPORT_MODEL_COST_UNREPORTED`).

The source of each claim, measured in the lane at `ec66d5e7c`:
- `COST_ENVELOPE_POLICY_UNRESOLVED`: the throw at `packages/register/src/cost-envelope-policy.ts:163-166`
  (`row === undefined`).
- `COST_ENVELOPE_POLICY_INVALID`: the throw at `:131-134`, reached through `readCostEnvelopePolicy`'s
  `return` at `:169`.
- Both roots read the row in hosted mode: `apps/api/src/main.ts:241-242`, under the `hosted` test at
  `:238`, and `apps/runner/src/main.ts:111`.
- "a check on the integrity of the build", "removed, emptied", "unreachable at runtime":
  `packages/register/src/runtime-environment.ts:106` and `:112-115`.
- The live gate is named at `:118-124`.

- **Done when:** C3-1's case passes, and `v9` reads `passed=29 failed=2`. C2-2's case
  (`README §11's support-chat note names the sealed-envelope refusal, not a daily cap ceiling`)
  still passes, because the note still names `COST_ENVELOPES_NOT_SEALED` and still has no
  daily-cap sentence.
- **RED when omitted:** C3-1 fails with `R3.4 first part, EXACT (C3-4)`.

**C3-5 · the refusal-table row (R3.4b (a), V-14).** Replace the whole line that starts
`` | `COST_ENVELOPES_NOT_SEALED` | `` (`deploy/vps/README.md:769` at `ec66d5e7c`) with this one line,
in the same position:

```text
| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows below. |
```

The row stays in the table, because R3.5's class includes this code
(`packages/register/src/runtime-environment.ts:143-147`). It also keeps
`tests/architecture/vps-deployment-baseline.test.ts:359` true.

- **Done when:** C3-2's case passes, and `v9` reads `passed=30 failed=1`. The refusal span still
  holds exactly **19** table lines, C1-2's count: the command at C1-2's criterion still prints `19`,
  because this step replaces a line and adds none. The row carries no `<…>` and no "before … hosted
  rule" (C1-1's assertions (1) and (1b)).
- **RED when omitted:** C3-2 fails with `the row, EXACT, once, in the table (C3-5)`.

**C3-6 · the §10 bullet (R3.4b (b), V-14).** In the bullet starting
`- **The production maker path is now ruled` (`deploy/vps/README.md:692-700` at `ec66d5e7c`),
replace this text (it spans `:698-700`):

```text
envelopes are V-28's (until they are sealed, a hosted runner refuses to start with `COST_ENVELOPES_NOT_SEALED`).
```

with:

```text
envelopes are V-28's. Until V-28's cost-envelope policy is sealed at the register version a hosted deployment runs, that deployment refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`.
```

Indent the continuation lines two spaces, like the bullet's other lines. Every other sentence of the
bullet stays byte-identical.

- **Done when:**
  - C3-3's case passes, `v9` reads `passed=31 failed=0`, and the C3 command prints `CLUSTER_GREEN`.
  - `/usr/bin/grep -n COST_ENVELOPES_NOT_SEALED deploy/vps/README.md` prints exactly **2** lines:
    one inside the note of region (i), and the row of C3-5.
- **RED when omitted:** C3-3 fails with `the bullet names these two codes and no other (C3-6)`.

**C3-7 · the cluster goes GREEN, three runs.**
- **Done when:**
  - `LOG=<abs> run-suites.sh tests/unit/v9-provider-credential-files.test.ts:31:0 tests/architecture/vps-deployment-baseline.test.ts:31:0`
    prints `CLUSTER_GREEN` on **three** consecutive runs, and the worst run wins.
  - `pnpm typecheck`'s per-file delta is **zero**.
  - `git diff --stat origin/dev...HEAD -- apps packages` (cwd = the lane's `dialectical-engine/`)
    prints nothing.
  - `git diff --stat ec66d5e7c..HEAD` names exactly `deploy/vps/README.md` and
    `tests/unit/v9-provider-credential-files.test.ts`.
- **R3.8 duty:** `tests/architecture/vps-deployment-baseline.test.ts` is not written, and its
  assertions are re-run by this command against the edited README. The one closest to the edits is
  `:359`, which requires `COST_ENVELOPES_NOT_SEALED` somewhere in the README. C3-5 keeps the code in
  the row, and C3-4 keeps it in the note.
- **Catches:** any baseline README assertion broken by regions (i)–(iii), and any of C1's or C2's 28
  cases broken by them. C1-1's (1), (1b) and (2), C2-2 and C2-4 are the ones that read these
  regions.
- **Does NOT catch:** `tests/unit/v30-support-provider.test.ts:550-555`, which also reads §11, for
  the support chat's own start-up codes. It is not in the command. None of regions (i)–(iii) holds
  one of those codes, and the gate ran that case on the final state
  (`probes/ARCH-FIX-PES-S03-p4/gate.log`, "regressions").
