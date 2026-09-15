commit=a440ec6fad48bc8e8774358e58c5b34fb10d9644

# SELF-REPORT — worker seat lane/diag-tail (Opus 5), 2026-09-07

Three low-tier tickets in one lane: F-DEV-TLS-DOUBLE-WRAP, F-DIAG-DEV-API-CLI,
F-AUTH-RISK-RETENTION-LOOP. Filed 2026-09-07 21:18 CEST (from `date`). Seat cost: roughly 25
minutes wall clock, one rework round of my own making, zero rounds from a reviewer (none has run
yet). A case file, not a diary — causes and prices.

---

## THE BODY: what nearly shipped

A test row that read like a security assertion and pinned nothing.

`tests/unit/dev-api-environment-cli.test.ts` exists to prove that the CLI stopped forwarding a
caught message on its SHAPE. Its centrepiece is a synthetic message that IS shape-legal for the
removed rule, so the row can only pass because the vocabulary rejected it. I wrote:

```ts
const SYNTHETIC_SENSITIVE = "DEV_API_ENVIRONMENT_PW_42_LEAKED_FROM_A_DRIVER";
// "Shape-legal for the removed regex — the old rule would have printed this verbatim"
```

The removed rule is `/^DEV_API_ENVIRONMENT_[A-Z_]+$/u`. **No digits in the class.** `PW_42` never
matched. The row passed under the shape rule and under the vocabulary alike; its comment asserted
the opposite in prose; the whole suite was green; and the RED capture was red for the right reason
(the classifier did not exist yet, so all seven rows failed at import).

**Nothing in the gate machinery could see it.** Green suite plus honest RED capture plus a clean
stamp check — and the row was decorative. The mutant is what killed it: `mutate.sh` restored the
shape rule and came back `EXIT = 0`, `1 passed`.

### Cause, not symptom

I reached for the corpus's established synthetic — `DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER` from
`tests/unit/dev-auth-stack.test.ts` — and copied its SHAPE across to a different rule. That
constant was written against the joiner's `/^DEV_[A-Z0-9_]+$/u`, which does admit digits. Two
sibling rules in the same codebase, two different character classes, and I treated "it works in the
neighbouring test" as transitive.

The deeper cause is the one the worker contract already names and I did not obey: **measure before
you speculate.** One line settles it and I never ran it until the mutant forced me to:

```
node -e 'console.log(/^DEV_API_ENVIRONMENT_[A-Z_]+$/u.test("DEV_API_ENVIRONMENT_PW_42_LEAKED_FROM_A_DRIVER"))'
false
```

### Price

One full re-take of the final-head record set: the 15 gate records and 7 mutant transcripts I had
already taken were discarded and redone, because the fix moved the tip after everything was
stamped. Call it 6 minutes of compute and one superseded set (`r1-*`, 22 files) left on disk for
audit. Two further mutants (the constructor-stops-wrapping and CLI-source-observer rows) were added
on the re-take, so the final set is 9.

**This is the third recurrence of one pattern in this corpus** — the worker contract's §2 says it
outright: "An assertion that pins the mutant you were shown is not a pin of the property." Mine was
worse: it pinned neither. The refutation duty is the only thing in the harness that catches this
class, and it caught it. It earns its cost.

---

## THE SECOND BODY: I invalidated 24 fresh records by writing a file

Immediately after the re-take I appended my trap to `.hermes/TOOLING-TRAPS.md` and committed it.
`TOOLING-TRAPS.md` is a **tracked file in the lane**. The commit moved the tip and every one of the
24 records I had just taken became stale. Second full re-take (`r2-*`, 24 files, also left on disk).

The records block says it in so many words — "Commit EVERYTHING of the round — source, tests, the
manifest, `.hermes/TOOLING-TRAPS.md` appends — BEFORE taking any gate record". I read that line,
staged the source and the tests, and then treated the trap append as a piece of *reporting* rather
than a piece of the *round*. It is not: it is a tracked edit like any other.

**Price:** another 6 minutes and another superseded set. Two re-takes, both pure ordering error.

### What to upgrade — the cheapest fix in this report

`gate-run.sh` already knows everything needed to refuse this. It computes `PRE` porcelain and stamps
`git rev-parse HEAD`. It could take one more argument, or read one env var, naming the artifacts the
round is expected to have committed — and refuse to emit when a tracked path outside that set is
dirty. Better still, since the failure mode is "records taken, THEN a commit", add to
`stamp-check.sh`'s output a line naming which of the lane's commits came after the newest record's
timestamp. Right now `stamp-check` tells you the records are stale AFTER you have paid for them; it
cannot tell you that you are about to make them stale.

Concretely, one line in the worker's own procedure would have saved both re-takes:

> **Freeze the round before you measure.** `git add -A` everything the round produces — source,
> tests, manifest, traps — commit once, `git status --porcelain` must be empty, and ONLY THEN take
> the first record. If you touch a tracked file afterwards, every record is void.

That sentence belongs in `heartbeat-worker` §3, not only in the mission's records block, because it
is a property of every round and not of this mission.

---

## WHAT REPEATEDLY COST TOKENS

**1. Reading a 2,291-line `TOOLING-TRAPS.md`.** My first attempt returned 181 KB and was spilled to
a file. I recovered by grepping it for the tool names I was about to use (`mutate.sh`, `gate-run`,
`typecheck`, `vitest`), which found the four entries that actually governed my work in one call.
The file is a genuine asset — the `gate-run.sh <worktree>` entry and the vitest-dedup entry both
saved me directly — but at 2,291 lines it is past the point where "read it before you start" is
executable advice.

*Upgrade:* the file needs an INDEX at the top: one line per trap, grouped by the tool or command it
bites (`git`, `vitest`, `tsc`, `mutate.sh`, `gate-run.sh`, `zsh`, `macOS`, `codex sandbox`), each
pointing at its section. A seat then reads ~40 lines of index and jumps to the three that apply. The
entries themselves are already well written; only the retrieval is broken.

**2. Re-deriving the producer vocabulary that already existed.** I enumerated the 13
`DEV_API_ENVIRONMENT_*` codes by grep, and only afterwards noticed
`apps/runner/src/dev-auth-stack.ts:131-143` already lists exactly those 13, audited by the
diag-class-a seat two hours earlier. My enumeration was still the right move — the two lists must be
independent or the test proves nothing — but I spent the tokens twice because nothing pointed me at
the prior audit. The packet named "the landed patterns" (`dev-auth-stack.ts`) but not "the prior
sweep of YOUR codes lives at `logs/diag-class-a/02-sweep-dev-codes.log`".

*Upgrade:* when a packet reuses a landed pattern, name the pattern's **evidence artifact**, not just
its file. One line in the packet — "the producer sweep for these codes is
`logs/diag-class-a/02-sweep-dev-codes.log`" — turns a re-derivation into a cross-check.

**3. An over-broad post-condition in my own edit script.** A `python3` in-place edit ended with
`assert "PW_42" not in s`; the doc comment I had deliberately written *about* `PW_42` tripped it,
the script exited before writing, and the two successful replacements were lost. The symptom read
like "the pattern didn't match". Cost: one round trip. Generic lesson, low value, deliberately NOT
added to the traps file — that file's value is its signal-to-noise ratio and I will not be the seat
that dilutes it with ordinary scripting care.

---

## WHAT I NEARLY GOT WRONG BUT DIDN'T

**Placing the retention check beside its sibling.** The obvious reading of "validated ONCE, before
the loop" is: put it next to the `maxSignals` policy check at the top, where it belongs
conceptually. I nearly did. Then I traced what happens to an input that is BOTH saturated and
carrying a bad retention: today it throws `AUTH_RISK_SIGNAL_SCAN_SATURATED`; from the top position
it would have thrown `AUTH_RISK_SIGNAL_POISONED`. The packet says "public message unchanged". No
test pins that combination, so it would have shipped, and a reviewer would have had to find it by
reasoning rather than by a red suite. Placing the check immediately before the loop satisfies the
outcome and moves exactly the two cases the ticket names.

*The general shape:* "validate early" is a style rule; "change nothing else observable" is a
contract. When they conflict, the contract wins and the reason goes in the report as a chosen
constant. **The right position was found by asking what each candidate changes, not by asking which
reads better.**

**Assuming the ticket's scope was my scope.** F-DIAG-DEV-API-CLI's own comment thread says it
"covers the CLI site and `:163`" — `apps/runner/src/dev-deployment-register.ts:163`. My packet's
`allowed` list does not contain that file and its `readonly` list explicitly excludes
`apps/runner/src/dev-*.ts (producers)`. I read the ticket first and briefly took its scope as
authoritative. It is not: the packet's contract is. I named the site instead of touching it, and the
ticket cannot close on my work alone.

*This is a real packet defect and the second of its kind on this ticket* — its own body records
self-charge #45 against an earlier orchestrator packet for exactly this (a file "in neither allowed
nor readonly"). **The pattern is: findings accrete onto a ticket through comments, the packet is cut
from the ticket TITLE, and the accreted scope is silently dropped.** A packet generated from a
ticket should diff the ticket's comment thread against its own `allowed` list and refuse to dispatch
when a named site is unreachable. That check is mechanical.

---

## DEAD ENDS — do not re-derive these

- **`tests/integration/dev-tls-front-door.test.ts` cannot host the double-wrap RED.** It only
  exercises `startDevTlsFrontDoor` and `ensureDevLocalCertificate`; the defect lives in
  `startAttestedDevTlsFrontDoor`. The suite that covers that function,
  `tests/integration/dev-tls-readiness.test.ts`, is READONLY in this packet. The RED belongs in
  `tests/unit/dev-auth-stack.test.ts`, which is where the joined-chain assertions already live and
  which is in the gate list — that is also why it is the right home, not merely the available one.
- **The `.mjs` front door has no type-level observer.** `tsconfig.json`'s `include` has no
  `deploy/**` entry, so `tls-front-door.mjs` is seen only through its hand-written
  `tls-front-door.d.mts`. Do not go looking for a compile-negative pin on that file; the runtime
  mutants are the observers. (Worth noting the `.d.mts` is what settled WHICH fix was right — its
  `constructor(code: string, cause?: unknown)` is the declared contract the two call sites were
  violating. A hand-written declaration file was the best evidence in the whole ticket.)
- **`tests/unit/s1-1-depth-contract.test.ts` is red in this lane and it is not yours.** `web/` has
  exactly one tracked file (`web/next.config.mjs`) and no `package.json`, so the orphan audit throws
  `ENOENT`. It is the same absent-tree condition that produces the 8 known-red baseline typecheck
  diagnostics. Prove it the cheap way — `git diff --stat <base>..HEAD -- web tools/orphan-audit
  tests/unit/s1-1-depth-contract.test.ts` — rather than by reading the audit.

---

## THE ONE-PROMPT MACHINE — what would make this seat need no second prompt

This seat did not need a second prompt, and the packet is most of the reason. Three things carried
it, and they are worth naming because they are copyable:

1. **The packet stated the OUTCOME and let me choose the mechanism** (D58), and then asked me to
   *say which* and *why* on the one genuine fork (constructor vs call sites). That is the right
   shape: it does not pre-decide, and it does not let me leave the decision undocumented either.
2. **It named the landed patterns.** `dev-auth-stack.ts`'s explicit-set-plus-read-once and
   `auth-risk.ts`'s bounded categories meant I was matching an existing shape, not inventing one.
   Almost every design question answered itself by reading the sibling.
3. **It pre-specified the mutants.** "The double wrap restored → the chain test fails" told me what
   the evidence had to look like before I wrote a line, which is why I built the mutants instead of
   deciding afterwards whether to.

The four gaps, in order of what they would buy:

- **A round-freeze rule in `heartbeat-worker` §3** (see THE SECOND BODY). Two re-takes here; this
  will recur in every lane that appends to the traps file, which is every lane that learns anything.
- **Packet-generation should diff the ticket comment thread against the `allowed` list.** Mechanical,
  and it is the second occurrence on this very ticket.
- **Point at prior evidence artifacts, not just prior files.** Would have halved my sweep.
- **Index `TOOLING-TRAPS.md`.** Its value per line is high and its retrievability is now the
  bottleneck.

And one thing to keep exactly as it is: **the refutation duty**. It was the only mechanism in the
entire apparatus — RED capture, three-run gates, typecheck identity, stamp check, clean-state
verdicts — that could see the defect that actually mattered this round. Everything else was green
while a security row pinned nothing. If budget ever has to be cut, cut a third gate run before you
cut a mutant.
