# SELF-REPORT — REQ-REV-01 · mission `free-public-debates` · node REQ-REV, pass 1

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REQ-REV-01, grok-4.6, grok CLI background. Session `01a0bfd1-bd51-74e0-889e-755d7371a709`. Wall clock packet-open to verdict: ~12 minutes of reading + ~8 minutes of probes and writing. Skills actually loaded: using-superpowers (+ hermes-tools.md), heartbeat-protocol (grok thin loader and `.claude` v4.0.0 §5), heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging, heartbeat-requirements.

---

## 1. The body: cause, not symptom

**CAUSE: the SPEC was written from intake rulings and from handler status codes, and not from the `.strict()` request contracts those handlers parse.** That is why B3 exists. REQ-01 read `index.ts` publish/unpublish/delete and pinned 409/201/200/404 correctly. It did not pin `AskRequestSchema`, `warning_acknowledged`, `copies_may_persist_acknowledged`, or `DELETE_PRIVATE_DEBATE`. Those four facts live in `packages/contract/src/index.ts:109-214` and in the contract client that already sends them (`client.ts:463-475`). A coding seat that types the SPEC walk will get 400 `MALFORMED_REQUEST` and debug the product. Price if it ships: one BUILD cluster RED for the wrong reason, one FIX, one REV pass — on this fleet's own numbers, 40–60k tokens and a calendar day. Price to prevent it: one REQ read of the four request schemas (~800 tokens) and four JSON blobs in §4.

**CAUSE of B1: a special case was added after the general rule, and the general rule was not rescoped.** R-4 already says "terminal other than BLOCKED". R-8 states the BLOCKED outcome (PRIVATE, outstanding 0). R-9 then says PRIVATE with nothing outstanding is a violation. DECISIONS.md records the intent ("BLOCKED is not retried"). The SPEC text does not. Two seats will implement two programs. Price if it ships: a BLOCKED fixture that cannot be green under both tests; the contradiction surfaces at REV(S) security or correctness, not at REQ. Cost of the fix: one clause on R-9, copied from R-4.

**CAUSE of B2: "a field a test names" was used as a pin.** That sentence is the opposite of a pin. The visibility wire is a two-field `.strict()` schema that the UI client already parses. Leaving the name to ARCH is how two coding seats diverge on a public contract. REQ-01 *almost* saw this — the self-report says they nearly added a third `state` value and pulled back. They pulled back to an unnamed extra field, which is the same class of wire change with a less obvious blast radius (strict parse throws; UI shows "Publication status is unavailable").

**The token leak that will repeat: drifted `path:line` citations treated as live.** `public-debate-access/INTAKE.md:61-75` still says `readPublicDebate` is at `publications.ts:301`. Today that line is `unpublish`. REQ copied it into R-22. I spent ~6 minutes and ~2k tokens proving the function moved to `:382` and that `catch { return null }` still exists. The property was right; the cite was not. Every later seat that "verifies R-22 against 301-321" will read `unpublish` and either rubber-stamp or file a false blocking finding.

**Second leak: the same product map is re-derived per seat.** REQ-01's self-report already priced ~9k tokens of product reads to learn which status codes exist. I paid that bill again, because a reviewer who trusts the author's cites is how R-22's wrong line survived. An observables catalogue (route, method, status, typed string, request schema, response schema) would have made B3 a 30-second grep and B2 a one-line "this schema is `.strict()` / two fields".

**Packet-check did not catch P-A/P-B/P-C.** Orchestrator stamped "packet-check OK" on both REQ-01 and REQ-REV-01. Packet-check today is "does the file exist". It does not ask "does this line range still name the symbol the sentence claims". That is the upgrade.

## 2. What I nearly got wrong

1. **I nearly filed R-24 as a vacuous git pathspec.** TOOLING-TRAPS heading "`git diff/log/ls-tree -- <pathspec>` from inside `dialectical-engine/`" is real. I ran the COMMON freeze command first with `-C` at the git root (`…/worktrees/all`) and got an empty diff that reads as "REQ changed nothing". From the packet cwd the same pathspec shows 6 files / 498 insertions. R-24's `git diff --name-only 5b6cc9b1..HEAD -- apps/ui` is **correct from packet cwd** and currently 0 because this mission has written no UI. A false B on R-24 would have been a rework of a working check. Price avoided: one REWORK cycle. The trap is cwd-dependent; packets that say "cwd is X, git root is one level up" need the command printed with `cd` or it will be run from the root.

2. **I nearly treated R-11 as ARCH's problem (HOW) and N-tiered it.** Wire field names on a `.strict()` response the UI already parses are WHAT. Folding it would have moved the cost to BUILD.

3. **I nearly over-read.** Charge 3 named `index.ts:1100-1208` as visibility. Visibility is `:1080`. I read 20 extra lines. That was the right call (the packet was wrong) and it is also how seats bleed past the reading floor. Report the packet defect; do not absorb a 2k-line file.

## 3. Dead ends — do not re-derive

- `docs/architecture/02-data-model.md:1237-1268` — §7.6 `answer`. REQ-01 already reported it. I re-read it to check their defect #1. Confirmed dead. ~1.2k tokens, twice now. Delete from the REQ input list at packet-check.
- `migrations/0040_account_erasure.sql:3940-4069` — the grant/session lock of `transition_run_publication`. Needed only to confirm there is still no system path (intake already said so). R-20's cited lines `:4106-4118` are *outside* the REQ-REV charge-3 span; I read them because the SPEC cites them. They do pin the visibility insert and the ALLOW audit. Worth it; the earlier 130 lines were not, for a requirements review.
- First freeze `git log -- docs/missions/free-public-debates` from git root: empty. Dead end. From packet cwd it works. Record both, or print the cwd in the command.

## 4. Where THIS packet was unclear — exactly

- **REQ-REV-01.md charge 3, `index.ts:1100-1208` "(visibility, publish, unpublish)".** Visibility is `:1080-1094`. `:1100` is GET answer. I had to look 20 lines earlier than authorised, or leave R-11's HTTP path UNVERIFIED.
- **Charge 3 `index.ts:125-174` "route policy table".** Table starts at `:114`. R-23's awk uses `NR>=100 && NR<=166` and is the right command; the packet span is not.
- **Charge 3 `publications.ts:140-339`.** Does not include `readPublicDebate` at `:382`. R-22's claim cannot be checked inside the named span, because the named span is `unpublish`.
- **Charge 3 / COMMON §6 freeze command** does not say "run from packet cwd". From git root the pathspec is empty. I lost ~3 minutes and nearly wrote a packet-defect that is only a cwd-defect.
- **Charge 1 "find the (packet) ones it did not".** Correct charge. It forced a re-read of REQ-01.md and of the data-model dead end. Worth it; B3's root (no request schemas in the REQ inputs) is one of those missed defects (P-C).

The packet fought me on spans, not on the job. The job is the right job: refute the SPEC, do not read the author's tests.

## 5. Upgrades, ranked by tokens saved

1. **Observables catalogue, one file, generated or hand-kept.** Columns: route, method, auth, request schema (required keys), success status + body, error statuses + strings. REQ writes acceptance by pasting rows. REV greps. *Saves:* the ~9k product-read REQ paid, the ~9k I paid, and the BUILD cluster that will otherwise debug a 400. This is the one-prompt move: a SPEC walk becomes a concatenation of catalogue rows.
2. **Packet-check asserts `path:line` still names the symbol.** `publications.ts:301` must match `/readPublicDebate|unpublish/` against a declared token. Drift becomes a dispatch failure, not a SPEC cite. *Saves:* every later seat's 2k-token "did this line move" walk, and false B's from reading the wrong function.
3. **Packet spans must cover the function the sentence is about, and the label must match the line.** "visibility, publish, unpublish" cannot point at GET answer. *Saves:* the 20-line over-read and the 10-minute argument about whether leaving the floor was lawful.
4. **Freeze / git commands printed with `cd <packet cwd> &&`.** The trap is not the pathspec; it is running it from the git root. *Saves:* empty diffs that look like "nothing changed", which is the most expensive wrong fact in this repo.
5. **REQ floor includes the request schemas of every route the acceptance calls.** Status codes without bodies are how B3 is born. *Saves:* one REWORK pass (~ this seat + a REQ-FIX + this review again).
6. **Do not restate the baseline table in the SPEC.** Cite intake row ids; assert GREEN-or-DELTA in one line each. REQ-01 already asked for this. I re-read thirteen rows to confirm they match. They did. *Saves:* ~800 tokens per review and the drift surface.

## 6. Price of this pass

- Wall clock: ~20 minutes.
- Tokens: dominated by product spans (~ index.ts four windows, publications.ts 200 lines, contract schemas, 130 lines of plpgsql I did not need).
- Retries: probe P9 failed twice on a line-wrap (`is a\n  violation`); that is a nothing. The git-root empty diff was the expensive near-miss.
- What the packet cost that a one-prompt machine would not: re-deriving the request-schema map that already lives in `packages/contract` and in the client the UI uses.

The SPEC is close. The three blocking findings are all the same shape: a pin that is not unique (R-9 vs R-8, a field a test names, a walk that omits `.strict()` keys). That is the class to fix, not three unrelated nits.
