# S3b REWORK 1 — re-review packet (enumeration oracle closed by equal post-response work)

Ticket t_3f2a4c64, board `accounts-phase1`. Author: Codex, session 01a019e7.
You are ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on
source; running tests is REQUIRED — a blocking lens must have run the live world.
You may stand up your own isolated Postgres. Establish the true change set from
**file mtimes** (`find -mmin` / `stat`), never `git diff`, and ignore the Aug-17
rename churn.

## What happened in round 1
The dual diamond came back **SPLIT**: Grok GREENLIGHT, Opus **BLOCK**
(`reviews/S3b-opus-verdict.md` — the full harness and numbers). Durability and the
VR-10 mutation evidence were independently confirmed REAL by both lenses and are
**frozen** (contract items 1, 3, 4, 5, 6, 7). One item failed: **item 2**, the
enumeration oracle.

The defect: new-address registrations ran a **second** global-audit-chain
transaction (`recordVerificationDelivery` — two more argon2id hashes plus
`pg_advisory_xact_lock('identity:audit-chain')`) that duplicate-address
registrations never ran, and the guarding test **paused the mail sender across the
missing-address measurement wave only**, so it certified a configuration
production never runs.

## What Codex did (claims — verify them)
Chose **option (a)**: duplicate registrations now schedule a *matching* truthful
post-response transaction performing the same row/select work, two source argon2id
hashes, and the same global audit-chain lock as the created branch's delivery
record. `pendingMailDispatches` is unchanged. **F3** folded in: audit-before-DEK
ordering restored so an audit failure aborts before the non-transactional file
write.

Claimed measurements, real Postgres, **mail live**, production auth policy
(65 536 KiB / t=3) — the assertion guard is **AUC ≤ 80%**:

| | N=1 | N=4 | N=8 |
|---|---|---|---|
| **RED (current code, before fix)** | clf 75.0% / AUC 62.5% / gap 0.1 ms | clf 87.5% / AUC 87.5% / gap 83.1 ms | clf 93.8% / **AUC 94.1%** / gap 182.3 ms |
| **GREEN (full file)** | clf 68.8% / AUC 59.4% / gap 0.0 ms | clf 68.8% / AUC 70.3% / gap 31.3 ms | clf 59.4% / AUC 61.7% / gap 43.7 ms |
| **GREEN (repo gate re-run)** | 68.8% / 59.4% / 0.1 ms | 65.6% / 70.3% / 38.6 ms | 57.8% / 60.0% / 35.7 ms |

VR-10 mutants: removing the duplicate post-work → RED (N=4 clf 87.5%/AUC 85.5%;
N=8 clf 95.3%/AUC 91.6%); moving the DEK callback before `appendAudit` → F3 RED
(`before_commit_calls=1`). Gates: typecheck green, `pnpm test` 110 files /
**793 tests**, lint 28 edges / 0 violations, `git diff --check` green.

---

## THE PRIMARY QUESTION — is 70% AUC at N=4 a residual leak, or the measurement's own noise floor?

The GREEN numbers are not 50%. At N=4 the AUC is **70.3%**, comfortably under the
80% guard but comfortably above chance. Two readings, and the packet does not tell
you which is right:

- **Noise floor.** With ~32 samples per arm, AUC has real variance; N=1 shows
  59.4% AUC at a **0.0 ms** median gap, which can only be noise. If the estimator's
  spread is that wide, 70% may be indistinguishable from equality.
- **Residual signal.** A 70% classifier is exploitable by an attacker who probes
  the same address repeatedly and takes a majority vote. "Under the guard" is not
  the same as "closed".

**Required to settle it — run the same-arm control.** Measure two waves that are
**both** new-address (and separately, both duplicate), at the same N, with the same
harness, and report the AUC. That is the true null distribution.
- If same-arm AUC lands near 70%, the cross-arm 70% is noise and item 2 holds.
- If same-arm AUC lands near 50-55% while cross-arm sits at 70%, **there is
  residual signal** and the guard is mis-calibrated — say so and BLOCK.

Also judge whether **AUC ≤ 80%** is the right threshold at all, or whether it was
chosen to fit the numbers that were achievable. Justify from the null distribution,
not from the ruled 100 ms (which is a latency tolerance, not a separation bound).

## Adversarially attack the chosen fix — option (a) makes the server do MORE work
Codex equalised by **adding** work to the duplicate branch rather than removing it
from the created branch. Interrogate the consequences:
1. **Cost amplification.** Every duplicate-address probe now costs a second
   audit-chain transaction. An enumerating attacker previously paid for one; now
   the *server* pays two per probe, on a **global** lock. Does this hand an
   attacker a cheap amplification primitive within S3c's 20/IP/15 min budget?
   Quantify if you can.
2. **T7 interaction.** Round 1 measured 602 ms (N=1) → **5 940 ms** (N=32) from
   global-lock serialisation. Re-measure the concurrency curve **after** this
   change. If it materially worsened, that is a finding to report even though T7
   itself is a separate ticket.
3. **Truthfulness of the dummy work.** Codex calls the duplicate's transaction
   "truthful". Verify it writes nothing that misrepresents state: no delivery
   record for an address that got no mail, no cooldown column set, no audit row
   claiming an event that did not occur, no chain entry that corrupts ordering
   semantics. **VR-3: no user identifier may reach any audit column** — re-check
   after the restructure.
4. **New plaintext surfaces.** Does the duplicate post-work retain email / IP / UA
   in any new structure, or extend the lifetime of an existing one?
5. **Does the duplicate path now become distinguishable a different way** — error
   behaviour, connection-pool usage, log volume, or failure modes when the dummy
   transaction fails?

## Also confirm
- **The test no longer pauses mail across its own measurement window**, runs at
  production auth-policy parameters, and its assertion is the separation statistic
  (not the outlier-fragile range). Re-run it yourself.
- **The VR-10 mutants are real** — reintroduce the asymmetry yourself and confirm
  the new assertion goes RED. Round 4 shipped three tests that passed against
  broken code; this is why the rule exists.
- **F3:** audit-before-DEK ordering restored, and confirm this did not reintroduce
  anything the earlier ordering was fixing.
- **Frozen scope untouched:** S3a's three fixes, VR-3 erasure, the rate limiter
  (S3c), the mail channel/cooldown (S3d), crypto, the identity schema,
  `pendingMailDispatches`. Establish by mtime.
- **Durability did not regress** under the restructure — re-run a burst yourself.
- Gates reproduce (793 tests, lint 28/0).

## Verdict
Write `reviews/S3b-r1-<lens>-verdict.md`: GREENLIGHT or BLOCK + numbered findings
with file:line evidence and measured numbers. If BLOCK, state exactly what proof
lifts it. Restore any mutation you apply and confirm the tree is byte-identical.
No commit, no push.
