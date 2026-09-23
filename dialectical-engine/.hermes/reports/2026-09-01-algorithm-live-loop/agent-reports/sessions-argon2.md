WORKER SESSIONS-ARGON2 — REWORK READY FOR REVIEW · tip dd083666 · comments read through: sessions-argon2-r1-2026-09-07
SKILLS LOADED: heartbeat (loader), heartbeat-protocol (router), heartbeat-worker (read as markdown — the Skill tool refused it, see Self-charges), superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review (loaded at the start of this round)

Two tickets on one lane: **F-ARGON2-SESSION-ENV** (the fixture's calendar) and
**F-SESSIONS-BARE-CATCH** (the catch that hid it). Lane `lane/sessions-argon2`, base
`1d954e88`, tip `dd0836669427db3bd058ce05851f4bc103e4fb2b`, five commits, seven files,
+362/−9. Nothing pushed, nothing merged, no board or DECISIONS file touched.

## Rework round 1 (codex r1 = CHANGES · 1 BLOCKING, 3 FOLLOW-UP)

### F1 — BLOCKING — done: a standing assertion in each service

Round 0 shipped the surfacing fix with no test pinning it, and said so. Codex required the
pin rather than a filed residual, which is the right call: the mutants I reported as
surviving were exactly the evidence that the ticket's behaviour could vanish silently.

**Commit `b8d37952`**, +238 lines across two test files, no production line touched:

- **`tests/unit/sessions-risk-signal.test.ts` (new, 175 lines).** No sessions unit test
  existed — `grep -rln SessionService tests/unit/` returned nothing before this round, so
  the amendment's named location is a new file rather than an extension. It drives a real
  `beginLogin` → `completeLogin` through the **TOTP branch**, which uses AES-GCM and HMAC
  only and never calls Argon2, so the 81-line worker-pool fixture is not copied: the two
  cases run in 19 ms and 2 ms (`17-sessions-risk-signal-unit.log`). The binding hash is **captured from the service's own
  `createLoginChallenge` call** rather than re-derived in the test, so a change to that
  derivation cannot silently pass this file.
- **`tests/unit/p2-recovery-start.test.ts`, +63.** Two cases added, none of the three
  existing cases weakened or edited (they are untouched — the commit is +63/−0).

Both services assert, per the amendment's exact requirement, with a **non-throwing**
observer so the service's own outcome stays observable:

| requirement | sessions | recovery |
|---|---|---|
| exactly one callback invocation | `expect(received).toHaveLength(1)` | same |
| the argument is a `TypeError` | `toBeInstanceOf(TypeError)` | same |
| its message is exact | `toBe("LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED")` | `toBe("RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED")` |
| a rejecting recorder's error arrives unwrapped | `expect(received[0]).toBe(sentinel)` | same |
| the service's own outcome retained | `status: "authenticated"`, both tokens `/^[A-Za-z0-9_-]{43}$/`, `session.asker_id` | `toEqual(RECOVERY_START_PUBLIC_RESPONSE)` **and** the floor `expect(now - startedAt).toBe(600)` |

The real-database S5 assertions and its **fatal** callback are unchanged.

**RED, from the mutant, read as text rather than as a count** (`14-mut-B1-killed.log`,
`15-mut-B2-killed.log`, both stamped `dd083666`, both `RESULT: ok — restored=0 hashes=match
porcelain=empty`):

```
AssertionError: expected undefined to be an instance of TypeError
 ❯ tests/unit/sessions-risk-signal.test.ts:153:25
AssertionError: expected undefined to be Error: RECORDER_REJECTED // Object.is equality
 ❯ tests/unit/sessions-risk-signal.test.ts:172:25
```

Both mutants are now **KILLED** — B1 `2 failed (2)`, B2 `2 failed | 3 passed (5)`. Two
things that matter in that output: the observer is still invoked under the mutant (so the
kill is not the invocation count firing, it is the VALUE), and recovery's three
pre-existing cases still pass under the mutant, so the new cases are what discriminate and
not collateral damage.

**Neighbouring mutant that must NOT be caught** (§2 step 4), `16-mut-B1n-neighbour-rebound-cause.log`:
rebinding the caught value through a local — `}catch(error){const cause=error;…onRiskSignalFailure(cause);}` —
**survives at 2 passed (2)**. The pin is on the delivered value, not on the source text.

### Facts I got wrong, corrected

1. **My recovery coverage claim was false.** Round 0 said `tests/unit/p2-recovery-start.test.ts`'s
   second case "is the only place in the suite that drives `recovery.ts:84`'s catch". It drives
   nothing: that case's `repository.start()` throws `DATABASE_UNAVAILABLE` at its line 80, and
   `recovery.ts` reaches the risk-signal block only inside `if(outcome.status==="created")`, so
   `outcome` is never assigned and the recorder stub at its line 83 is dead code. Verified by
   reading both files this round. Codex is right, and this is the second-order lesson of the
   whole lane: **I inferred coverage from a stub's presence instead of from the path reaching it**
   — the same mistake shape as reading a failure without its cause. The new cases return
   `{status:"created", publicHandle}` first, so the catch is genuinely entered.
2. **"Absent from W5 run 2" was wrong** — that was my packet's wording and I repeated it. The
   September-5 parent record shows this test **passing**: `logs/w5/27-suite-run2.log:36352` reads
   `✓ … runs the password-to-TOTP challenge through real Argon2 … 998ms`. Read at that line this
   round. It strengthens rather than weakens the account: green on Sep 5, red from Sep 6, which is
   precisely the 2026-09-06T10:00Z expiry. The name is red in the dev gate at
   `logs/dev-merge/03-names-dev.txt:26`.
3. **Class sweep — "three regex matches" stands; "exhaustive semantic class" does not.** A
   whitespace/multiline-aware search finds a fourth syntactic member,
   `apps/ui/app/public/debate/[id]/page.tsx:12` — `} catch { notFound(); }`, a UI error-to-404
   mapping whose `notFound()` is Next.js control flow, **not** a risk-signal observer. Read at
   that line. **Not ticketed**, per the amendment. I withdraw the round-0 phrasing that the regex
   captured the class exhaustively and the claim that a blanket notifier ban would have zero false
   positives: what is established is that my single-line regex matched exactly three sites and
   that no additional risk-signal notifier was found.
4. **"Protected by nothing" was too broad**, as codex qualified. The widened
   `(error: unknown) => void` signature already makes the exact zero-argument mutant a TypeScript
   error; the mutant only runs because Vitest does not typecheck. What was missing — and is now
   supplied — is a **runtime** assertion on the value, since `undefined` is assignable to `unknown`.
5. **My round-0 finding 4 (the provisioning log carries no `commit=` stamp) is stale and I
   withdraw it.** `01-provision.log:14` now carries `# commit=1d954e88…`, added by the orchestrator
   at 12:29. Read at that line.

### F2, F3, F4 — follow-ups, not actioned here

- **F2** (`main.ts:64`, bound diagnostic *contents*, not only field names) — outside this round's
  outcome and correctly characterised: my projection bounds the FIELDS, and `name`/`code`/`message`
  contents remain unrestricted. Codex records production disclosure as **undetermined** and did not
  reproduce one; so do I. Not actioned, awaiting its own ticket.
- **F3** (`packages/db/src/auth-risk.ts:212`) — the third class member, in `packages/`, readonly to
  me. Named, not touched.
- **F4** — the provisioning-gate contradiction. **My FIRST ACTION gate is discharged by the
  amendment's F4 paragraph**, which records the accepted exception rather than inventing an exit
  code. I did not re-run the install and do not claim its status.

## RED (original, unchanged)

Each record I took is stamped to a named commit with an empty porcelain.

**(a) The single S5 test on the untouched lane** (`1d954e88`) — `02-red-untouched.log`:

```
Error: UNEXPECTED_RISK_SIGNAL_FAILURE
 ❯ Object.onRiskSignalFailure tests/integration/session-database.test.ts:483:40
 ❯ SessionService.completeLogin apps/api/src/sessions.ts:439:32
      Tests  1 failed | 10 skipped (11)
```

The failure is visible and the cause is not. STRENGTH: **entailed**.

**(b) After surfacing the error** (`7eaa4b83`) — `03-red-cause-named.log`:

```
Error: UNEXPECTED_RISK_SIGNAL_FAILURE (TypeError: LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED)
      Tests  1 failed | 10 skipped (11)
```

STRENGTH: **entailed**. Codex notes this record was re-captured at 12:22 (after `04` at 12:18) so
that it would stamp its own commit with a clean tree; the capture order therefore does not itself
evidence the original chronological RED-first sequence. That is accurate and I do not claim
otherwise — see Self-charges.

## The cause, named from the log

`TypeError: LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED` — **read from the 03 record, not assumed**. This is
the value codex's r0 F2 could only mark *undetermined*; the probe has now been run.

1. `tests/integration/session-database.test.ts:432` (at base) fixed `now = 2026-08-23T10:00:00.000Z`,
   injected as `clock: () => currentTime`. **entailed**. (The packet cites `:431`, the `it(` line;
   codex confirms the literal is `:432`.)
2. `packages/register/src/session-policy.ts:55` sets `idle_ttl_ms: 14 * 24 * 60 * 60 * 1_000`;
   `apps/api/src/sessions.ts:330` derives `idleExpiresAt = now + idleTtlMs` → idle expiry
   `2026-09-06T10:00:00Z`. **entailed**.
3. `packages/db/src/auth-risk.ts:172` `recordForSession` calls
   `identity.prepare_authentication_risk_signal_for_session`
   (`migrations/0046_authentication_risk_signals.sql:83`), whose WHERE requires
   `session.idle_expires_at>clock_timestamp()` (`:94`) and
   `session.absolute_expires_at>clock_timestamp()` (`:95`) — the DATABASE clock. **entailed**.
4. Past that expiry the prepare query resolves no row, so `record()` returns `"scope_unresolved"` at
   `auth-risk.ts:146` (the no-user branch, **not** `:156`), `sessions.ts:438` raises the TypeError,
   and `:439` discarded it. **entailed**.
5. The name "Argon2" is in the test's title, not the mechanism: the failing frame is the
   risk-signal call after password hashing and TOTP both succeeded, mutant A1 reproduces the
   failure by changing the DATE alone, and the September-5 record shows the test green. **entailed**.

## The fix

**F-SESSIONS-BARE-CATCH — `7eaa4b83`** (`sessions.ts` +3/−3, `recovery.ts` +2/−2, `main.ts` +22/−2):
`onRiskSignalFailure` becomes `(error: unknown) => void` at all three declarations
(`sessions.ts:149`, `:166`, `recovery.ts:44`); both catches bind and pass the caught value
(`sessions.ts:439`, `recovery.ts:84`). A zero-argument callback stays assignable, so every existing
construction site compiles unchanged — the tip's `tsc` diagnostic set is byte-identical to the base's.
`main.ts`'s two consumers (`:191`, `:242`) log the error's identity beside their unchanged fixed tags
through `riskSignalFailureIdentity` (`:64`), which PROJECTS onto a named allow-list — `name`, `code`,
`message` — built as a new string. It bounds the FIELDS, not the CONTENT of the three it keeps; that
residual is F2 and is **undetermined**, not an established leak.

**F-ARGON2-SESSION-ENV — `68815250`** (`session-database.test.ts` +11/−1): `now` is read from the
database's own clock as epoch milliseconds, so the value does not depend on driver parsing:

```ts
const databaseClock = await database.pool.query<{ epoch_ms: string }>(
  `SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint::text AS epoch_ms`
);
const now = new Date(Number(databaseClock.rows[0]!.epoch_ms));
```

Every relative advance retained, checked at its line at the tip: `let currentTime = now` (`:443`),
`clock: () => currentTime` (`:510`), `Math.floor(now.getTime() / 30_000)` (`:521`),
`currentTime = new Date(now.getTime() + 30_000)` (`:602`). No sleep, no widened policy, no relaxed
assertion. Nothing weakened: one hash-only session (`:561`, `:565`), the risk signal still required
(`:574`, `:576`), the replacement-password rejection (`:525`).

**Traps — `8ff66bf2`** (+42) and **`dd083666`** (+38), `.hermes/TOOLING-TRAPS.md`, append only.
The round-1 entry corrects the round-0 one, whose numbers recorded B1/B2 as surviving.
**F1 pins — `b8d37952`** (+238, two test files), above.

## Gates

Every row read from its artifact at write time. `stamp-check.sh` against tip `dd083666` reports
**20 records, 7 flagged**; all seven are historical or non-gate by construction and none is a
current measurement: `01` (provisioning, at base), `02` (RED at base), `03` (RED at `7eaa4b83`),
`06` (typecheck baseline at base), `12`/`13` (round-0 SURVIVED transcripts, **deliberately kept
unmodified because codex's r1 F1 cites them by line**; superseded by `14`/`15`), and
`codex-r1-verdict.final-snapshot.md` (the reviewer's own file). In the table below the two RED rows
and the base-typecheck row are those historical records, stamped `1d954e88` and `7eaa4b83`; every
other row stamps the tip `dd083666` with an empty porcelain.

| run | passed/total | failures named | artifact |
|---|---|---|---|
| S5 single @ base (RED) | 1 failed \| 10 skipped (11) | `UNEXPECTED_RISK_SIGNAL_FAILURE`, cause discarded | `02-red-untouched.log` |
| S5 single @ `7eaa4b83` (RED, cause named) | 1 failed \| 10 skipped (11) | `…(TypeError: LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED)` | `03-red-cause-named.log` |
| S5 single @ tip | 1 passed \| 10 skipped (11) | none | `04-green.log` |
| `session-database.test.ts` run 1 | 11 passed (11) | none | `05-file-x3-1.log` |
| run 2 | 11 passed (11) | none | `05-file-x3-2.log` |
| run 3 | 11 passed (11) | none | `05-file-x3-3.log` |
| **worst of three** | **11/11** | none | — |
| `tests/unit/p2-recovery-start.test.ts` (3 → 5 cases) | 5 passed (5) | none | `07-recovery-catch-unit.log` |
| `tests/unit/sessions-risk-signal.test.ts` (new) | 2 passed (2) | none | `17-sessions-risk-signal-unit.log` |
| `tests/integration/p2-recovery-start-database.test.ts` | 2 passed (2) | none | `08-recovery-integration.log` |
| `tsc --noEmit` @ base | 8 diagnostics, EXIT 1 | 8 inherited `s14-ui` | `06-typecheck-untouched.log` |
| `tsc --noEmit` @ tip | 8 diagnostics, EXIT 1 | same 8, sorted sets byte-identical (`diff` empty) | `09-typecheck-lane.log` |

### Mutation campaign (all at tip `dd083666`)

| mutant | expected | measured | artifact |
|---|---|---|---|
| **A1** `now` back to the 2026-08-23 literal | KILLED | **KILLED** — 1 failed \| 10 skipped (11) | `10-mut-A1-recalendar.log` |
| **A2** `now` = DB clock − 60 000 ms | survives | **SURVIVED** — 1 passed \| 10 skipped (11) | `11-mut-A2-neighbour-60s-earlier.log` |
| **B1** `sessions.ts:439` re-discards the cause | KILLED | **KILLED** — 2 failed (2), `expected undefined to be an instance of TypeError` | `14-mut-B1-killed.log` |
| **B2** `recovery.ts:84` re-discards the cause | KILLED | **KILLED** — 2 failed \| 3 passed (5) | `15-mut-B2-killed.log` |
| **B1n** rebind the cause through a local | survives | **SURVIVED** — 2 passed (2) | `16-mut-B1n-neighbour-rebound-cause.log` |
| B1/B2 round-0, before the pins | — | SURVIVED 11/11 and 3/3 (superseded) | `12-…`, `13-…` |

## Not verified

- **Whether a driver-produced `message` can echo a bind parameter** (F2). Not reproduced by me or
  by codex. STRENGTH: **undetermined**.
- **Midnight/DST behaviour was reasoned, not simulated.** The operations use epoch milliseconds and
  the service holds its sampled clock, so no civil-date arithmetic is involved; A2 is not a DST or
  TOTP-boundary campaign. STRENGTH: **entailed** for the arithmetic, **undetermined** for a
  database-clock jump large enough to consume the 14-day TTL.
- **The provisioning install's exit status** was never captured and I do not invent it (F4).
  STRENGTH for "install succeeded": **consistent-with**.
- **No full-suite run.** I ran the session file ×3, both recovery files, the new sessions unit file,
  and a full-project `tsc`. STRENGTH for "nothing else broke": **consistent-with**, resting on the
  identical typecheck and on the production edits being signature-widening only.
- **Codex could not independently execute the suite** (`listen EPERM` at `testDatabase.ts:45` in its
  sandbox), so every runtime row above is my measurement, inspected by the reviewer, not a
  reviewer rerun. Noting it so the evidence is not read as doubly sourced.

## Findings

1. ~~The surfacing fix is pinned by no test.~~ **CLOSED this round** — `b8d37952`; B1/B2 KILLED.
2. **`packages/db/src/auth-risk.ts:212`** `}catch{poisoned();}` — replaces a decrypt/parse cause
   with a fixed `AUTH_RISK_SIGNAL_POISONED`. Readonly to me. = codex F3.
3. **`apps/api/src/main.ts:64`** — bound the diagnostic *contents*, not only the field names.
   = codex F2; production disclosure **undetermined**.
4. ~~`01-provision.log` carries no `commit=` stamp.~~ **WITHDRAWN** — the stamp now exists at `:14`.
5. **No integration test constructs `RecoveryStartService`** (`grep -rln RecoveryStartService tests/`
   returns one file, the unit test). Recovery's service-level behaviour is unit-tested only. Not a
   blocker; worth a ticket if recovery gains database-coupled behaviour.

## Self-charges

- **I inferred coverage from a stub instead of from the reachable path.** My round-0 claim that the
  recovery unit test exercised `recovery.ts:84` was false, and a two-minute read of the case's own
  `start()` would have shown it. That is the identical failure mode as the ticket itself — trusting
  a visible artefact over the path that produces it — and I made it while writing about that very
  mistake. Cost: one blocking finding and this round.
- **I reported B1/B2 surviving and filed it rather than fixing it.** Codex's judgement that a
  behavioural repair needs a standing pin is better than mine. My reason — an 81-line fixture
  duplicate — was wrong on the facts: the TOTP branch needs no Argon2, and the real pin came to
  175 lines of new file whose two cases run in 19 ms and 2 ms. I estimated the cost of the honest option without
  checking it, then let the estimate decide. Cost: one round.
- **Two self-inflicted re-run costs in round 0** (~14 min): gate records taken on a dirty tree, and
  a mutation campaign spanning two commits — the latter a trap I had read in `TOOLING-TRAPS.md` an
  hour earlier.
- **I made the same sequencing mistake AGAIN this round**, having written the self-charge for it
  two hours before: I ran the full campaign and every gate at `b8d37952`, then committed the traps
  entry, which moved the tip to `dd083666` and staled all 13 records at once. Re-taken, ~6 minutes.
  The rule I keep failing is one line — **commit every file you intend to commit BEFORE you measure
  anything** — and knowing it is evidently not enough; it needs to be a step in the packet, not a
  lesson in my report.
- **Re-capturing record 03 at its own commit made the capture order unreadable**, as codex spotted:
  `03` is timestamped after `04`. The content is right and each record now stamps a clean commit,
  but a reader cannot recover the original RED-first ordering from the files. Next time: capture
  RED at a commit the first time, rather than repairing the stamp afterwards.
- **`heartbeat-worker` could not be loaded by the Skill tool** (`Unknown skill`) — F-HARNESS-SKILL-1.
  Read as markdown, as the packet instructs.
- **`superpowers:receiving-code-review` was not loaded in round 0** (correctly — it is the
  rework-round entry) and **was loaded first this round**, before reading the verdict.
- **I did not sub-delegate.** The packet grants none.

WORK: ready — F1 is closed at tip `dd083666` with a standing pin in each service, mutants B1 and B2 now KILLED (`14`, `15`) and a neighbouring mutant confirmed surviving (`16`); the file is 11/11 on the worst of three runs, recovery 5/5, the new sessions unit 2/2, typecheck identical to the untouched base, and the false recovery-coverage claim plus the W5 and class-sweep overreaches are corrected above.
