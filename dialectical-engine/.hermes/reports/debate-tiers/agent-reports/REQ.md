# SELF-REPORT — seat REQ · node REQ (requirements) · mission `debate-tiers` · pass 1 of 3

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Run:** 2026-09-09 17:15Z → 17:28Z, 13 minutes wall clock, ~30 tool calls, ~185k tokens.
**Output:** 689 lines across 10 files. **Roughly 60% of the tokens went to reading product source the
packet did not list as an input.** That is the headline, and everything below explains it.

---

## 1. The body — what cost tokens, and the CAUSE, not the symptom

### 1.1 The packet's `inputs` list and the packet's `verification` list contradict each other. ~110k tokens.

`REQ.md:10` says *"inputs (read these and nothing else)"* and names three things: the intake, a
135-line design extract, and `docs/architecture/`. `REQ.md:17` says the verification standard is
*"every SPEC requirement numbered and mechanically checkable"*, and COMMON §4 says *"cite repo claims
as `path:line`"*.

Those cannot both be obeyed. A mechanically checkable requirement about `/new` has to name
`#treeDepth`, `data-field="planTier"`, `setRiskTier(value)` and `const DEPTH_MAX = 5;` — strings that
exist only in files outside the input list. I read them (13 targeted greps and `sed -n` ranges, never
a whole file) and I am declaring it as a contract crossing on a READ, not a write.

**CAUSE:** the packet template inherits `inputs` from node types whose output is prose and
`verification` from node types whose output is code. Nobody reconciled them for a REQ node, whose
output is prose ABOUT code.

**UPGRADE — the highest-value change in this report:** the orchestrator already ran every one of
these measurements. COMMON §6 is a table of facts *with the command beside each one*. Ship the
**output of those commands**, not the commands. The packet should have carried, inline: the 12 lines
of `AskRequestSchema`; the `SegmentedRow`/`SliderRow`/`SelectRow` render bodies (the id scheme is the
entire testability surface of S01); the `const ready =` expression; the `it(...)` line of each of the
six named tests. That is ~150 lines pasted at intake, and it removes 13 round-trips and ~110k tokens
from every REQ, ARCH and REV node that follows. **Measure once, paste everywhere.**

### 1.2 `docs/architecture/` was offered as an input with no line range. 12,575 lines.

Reading it would have cost more than the rest of this node combined. I read **none** of it and say so
here rather than pretending. `heartbeat-protocol` §3.8 says a packet that makes you read more is a
packet defect — this is one. **UPGRADE:** a packet names a file AND a line range, or it names nothing.
A bare directory is not an input.

### 1.3 The base commit in the packet was stale. ~4k tokens, and a real hazard.

Packet and COMMON §6 both pin `dev @ 7f89f7b7`. Measured HEAD at dispatch: `086a56e3`. I spent one
`git diff --stat 7f89f7b7 HEAD` on the three files I depend on (identical — no harm this time) and
flagged it in my CLAIM. **CAUSE:** the packet is written at intake and dispatched later; nothing
re-measures in between. **UPGRADE:** `packet-check.sh` re-runs `git rev-parse --short HEAD` at
dispatch and stamps it, or COMMON's base row says "as of intake — re-measure".

### 1.4 The board CLI's truncation rule cost nothing here, but only because I looked first.

`hermes kanban show --json` prints everything at this ticket's size. At consent-ui sizes it truncates
and the seat has to slice the JSON. Worth keeping in COMMON §2, which it is.

---

## 2. What I NEARLY got wrong — three, and the second one was nearly fatal to the mission's point

### 2.1 I nearly copied row V-4 verbatim into S01. Cost if shipped: one full rework round on S01.

Row V-4 binds Free's risk tier to *"the deployment floor (`deriveRiskTierDefault`, else `standard`)"*.
It is unimplementable on that page. `tests/unit/v2ui-pages.test.ts:90` asserts `apps/ui/app/new/page.tsx`
never contains `contractClient.readDeployment`; `tests/render/ux01-new-debate-form.test.tsx:168`
asserts it is never called; and `deriveRiskTierDefault` (`apps/ui/app/new/defaults.tsx:26`) **has no
caller anywhere in `apps` or `tests`** — it is dead code that reads like an API.

A binding default resting on dead code is the most expensive kind of defect this system produces,
because every downstream seat treats it as settled. BUILD would have hit it at RED, filed a finding,
and cost a rework round plus a V gate — call it two hours and a pass.

**CAUSE:** the row was written from the function's *existence*, not its *reachability*.
**UPGRADE, and it is one line of shell:** at intake, for every symbol a V-row default names, run
`grep -rn '<symbol>' apps packages tests | grep -v <its own definition>`. Zero callers → the row is a
question, not a default. One second of compute against a whole rework round. **Put it in
`packet-check.sh`.**

### 2.2 I nearly put `plan_tier` inside `askContract`, because it needs no migration.

`ask_contract` is `jsonb` and already carries a bag of ask fields (`packages/db/src/schema.ts:128`) —
the obvious, cheap, migration-free home. It is wrong. For a `server` principal with a cipher, `startRun`
replaces the stored contract with `CONTENT_JSON_SENTINEL` and encrypts the real one into
`content_ciphertext` (`packages/db/src/index.ts:1156-1170, 1201`). The tier would be invisible to the
one consumer V named for it — billing (C2 / row V-6).

I caught it by reading 50 lines of `startRun` instead of trusting the column list. **The lesson is
general: a JSONB column is not a place until you have read the write path.** Opened as row V-11 with
the plaintext column recommended.

### 2.3 I nearly let both slices own `packages/contract/src/index.ts`.

Both lanes were cut from `7f89f7b7`. S01 needs `plan_tier` to submit it; S02 needs it to read it; both
need the rosters. Two lanes editing the one file every other file imports is a merge conflict in the
worst possible place. Charge 4 of my packet forced the question — **that charge was the single most
valuable line in the packet**, and it is the pattern to copy: when a mission has parallel lanes, the
packet names the shared file and demands an owner. Answer: S01 owns it; S02 rebases (row V-12).

---

## 3. DEAD ENDS — nobody re-derives these

1. **`deriveRiskTierDefault` (`apps/ui/app/new/defaults.tsx:26`) is dead code.** No caller. Do not
   build on it. Do not "wire it back up" as a convenience — two tests forbid the read it needs.
2. **`packages/contract/generated/` is gitignored** (`dialectical-engine/.gitignore:7`). Nothing
   generated is committed; `pnpm run generate:contract` is re-run per lane after any schema change.
3. **The `⚙ OPTIONS` V2 knobs are already never sent** (`apps/ui/app/new/page.tsx:266-274`). Locking
   them in Free is a promise to the eye with no wire consequence. Do not go looking for one.
4. **There is no tier artboard in the design of record.** I read the named extract
   (`docs/missions/ui-overhaul/design/design-document-rendered.html:967-1101`) — it is the plain `/new`
   card, `NEW QUESTION` through `Start run →`. MOCK(S01) is designing, not transcribing.
5. **No billing, plan, entitlement or subscription concept exists** (intake grep, 0 hits). Confirmed
   at the contract, API and UI layers. Stop looking.
6. **The composition math needs no change for a 2- or 3-model panel** —
   `packages/register/src/index.ts:185-199` covers every size ≥ 1. C7 is closed, not deferred.
7. **The refusal needs no new UI.** `ContractHttpError` keeps the server message
   (`packages/contract/src/client.ts:82-83`) and `/new` renders `exc.message`
   (`apps/ui/app/new/page.tsx:134-135, 155`). The 422 path already reaches the asker's eye.

---

## 4. What we must upgrade — ranked by tokens saved per unit of work

| # | Upgrade | Where | Saves |
|---|---|---|---|
| 1 | Packets carry the **measured extracts**, not the paths | `packet-check.sh` / orchestrator intake | ~110k tokens **per planning node**, and it compounds: ARCH, MOCK and every REV pass re-derive the same lines today |
| 2 | **Caller-check every symbol a V-row default names** | `packet-check.sh`, one `grep -rn` per symbol | a rework round each time it fires; it would have fired on V-4 today |
| 3 | Inputs are **files with line ranges**, never a bare directory | packet template | an unbounded read; `docs/architecture/` alone is 12,575 lines |
| 4 | **Re-measure HEAD at dispatch**, not at intake | dispatch step | a class of silent wrong-base work |
| 5 | The packet names the **shared file across parallel lanes** and demands an owner | packet template §3 | a merge conflict in the file everything imports |
| 6 | Reconcile `inputs` with `verification` in the packet template | packet template | the contradiction that produced #1 |
| 7 | Word-cap the self-report in the packet | COMMON §5 | an uncapped report invites padding; this one is ~1,400 words and that is about the useful ceiling |

---

## 5. How this becomes a one-prompt machine

The bottleneck is not the models and it is not the protocol. **It is that the same twenty facts about
the repo are re-measured at every node, from scratch, by a fresh session that has been told the path
but not the content.** Every node pays the discovery tax, and the tax is the majority of the bill.

Three changes, in order of return:

1. **A measured-facts file per mission, written once and pasted into every packet.** Not paths —
   content. `COMMON §6` is 90% of the way there; it stops one step short, at the command instead of
   the output. Finish that step and the fleet stops paying the tax nine times.
2. **Mechanical gates, not reminders.** The V-4 defect, the stale base and the shared-file collision
   are all detectable by shell in under a second. Heartbeat v3.3.0 already learned this once, on
   2026-08-29: *gates work, reminders do not*. Every finding in this report that could be a gate
   should become one in `packet-check.sh`, today.
3. **Ask the seat to route contradictions, and give it somewhere to route them.** This worked. Four
   contested choices left this node as rows V-10…V-13 with a recommended default, evidence at
   `file:line`, and a smallest-yes/no for V — instead of as four guesses frozen into a SPEC. The
   `V-ROW:` line is the cheapest instrument in this protocol. Use it more.

**On efficiency of the coding itself:** the two SPECs pin, in advance, the four source-text
assertions that a naive implementation would break (`tests/unit/v2ui-pages.test.ts:79-87, 93-95,
42-44, 63-70`). Those are text-matching guards over `apps/ui/app/new/page.tsx` — they will bite a
coding seat that refactors innocently, and they cost a debugging cycle each. Finding them at REQ,
where they cost one grep, rather than at BUILD, where they cost a red suite and a confused seat, is
exactly the trade this node exists to make. **The general rule: before freezing a requirement about a
file, read the tests that read that file as TEXT.**

---

## 6. Where THIS packet was unclear, exactly

- `REQ.md:10` `inputs (read these and nothing else)` vs `REQ.md:17` `verification` — §1.1 above. The
  single defect that shaped this run.
- `REQ.md:10` names `docs/architecture/` with no line range — §1.2.
- `REQ.md:9` and COMMON §6 pin a base that is not HEAD — §1.3.
- `REQ.md:11` says PROGRESS.md is *"new, empty — the orchestrator's"*. I created it as a zero-byte
  file. If the orchestrator expects a header, say so; "empty" and "scaffold" read differently, and I
  chose the literal reading.
- `REQ.md:24` asks for the rosters as *"configuration"* in S02 while S01 must display the same model
  names. The word "configuration" hid a cross-slice ownership question the packet did not ask. Charge
  4 asked it for `packages/contract/src/index.ts` only; the rosters needed the same treatment and I
  extended it myself (S01/DECISIONS.md).

**What the packet got right, and should be copied:** numbered charges with *"answer each or write
UNVERIFIED"*; naming the six existing tests; the explicit no-touch surface for `.local/**`; and charge
4, which forced the shared-file question before it could become a merge conflict.
