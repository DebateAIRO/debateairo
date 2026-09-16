# Self-report — REV-S03-p3r-correctness-tests (mission `debate-tiers`, ticket `t_06b3ae45`, head `b97985a8`)

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Wall clock for this seat: ~35 minutes (17:48 claim → 18:23 handoff). Roughly 55% of it was machine time on suites I did not need to watch.

---

## 1. The body: what actually killed this slice, and it was not the code

S03's code defect (growing a sealed register version) was found at pass 3 and fixed in one node. The **fix then failed twice more on V's real machine**, and each failure cost a full seat cycle:

- attempt 1 (`3f488b3f`): the pre-fix drift — the finding itself.
- attempt 3 (`a49d9734`): `ef302060` pinned digest `42b90bca…` as historical v4. It is not v4; it is **version 9**, a GENERAL publication of 2026-09-12. The FIX seat had to be resumed under RULING 4.

**The cause is not the FIX seat's.** It is that every artifact in this mission — the packet, the fixture comment at `tests/support/registerFixtures.ts:23`, the pass-3 review package — carried `42b90bca…` as "the pre-S03 v4 digest", inherited from a code constant, and **nobody had ever asked the database**. The fixture's own comment said *"Moved 2026-09-12 when the development provider set grew"* — that sentence describes a **publication**, and it was read as a change to history. A one-line read-only query (`SELECT register_version, snapshot_sha256 FROM register.register_version`) settles it in two seconds, and it was not run until after the second live failure.

**Upgrade #1, the highest-value one in this report:** *a digest that claims to describe production state must be measured against production state before it enters a packet.* Concretely — the orchestrator's `diag-v4-rows.ts` already exists and is read-only and secret-free. It should run **at mission intake** for any slice that touches the register, and its output should be the oracle every seat cites. Price of not doing it here: two failed live starts, one seat resume, one extra V ruling, one extra review node (this one). Call it 3 hours of wall clock and the whole token cost of pass 3r.

---

## 2. What I nearly got wrong

**(a) I nearly reported "the merge changed nothing in S03's files."** My first cross-check was `git diff --stat a25c0d99 b97985a8 -- $(cat s03-product-files.txt)`. The file lists paths as `dialectical-engine/apps/...`; from inside `dialectical-engine/` those are git-root-relative and git returns an **empty diff with exit 0**. That reads exactly like "clean". The packet's TOOLING-TRAPS line warned me in the same sentence it gave the command, so I re-ran with the prefix stripped and reproduced the package's stat to the byte. **This trap has now cost the fleet more than once and it is silent by construction** — an empty diff is indistinguishable from a clean one. Upgrade: a wrapper `git-mdiff` that refuses a pathspec beginning with `dialectical-engine/` when cwd is inside it. That is ten lines and it retires the trap permanently.

**(b) My first probe run went RED on my own assertion, not the product.** I asserted that the seed creates no new `register_version` rows; it creates one, because `persistOrAcceptSealedHistoricalBootstrap` persists the bootstrap version that my hand-built fixture had not inserted. Two minutes to diagnose, one edit. Worth recording because the *shape* of the mistake is the one this whole mission keeps making: **I asserted about a system state I had assembled myself rather than about the state the product would meet.** The fix was to assert the property that actually matters (no version *above 4* after the seed) instead of a count.

**(c) I nearly accepted the handoff's class sweep.** It names six titles across four suites and is accurate about all six. Only because I ran the grep myself did I find `tests/architecture/p2-recovery-policy-register.test.ts:119` and `p2-product-role-policy.test.ts:137` — two assertions that pin *how the seed builds the v4 rows*, in **no cluster command of this slice**, which still pass while no longer pinning their own titles. That is N12, and it is the same failure mode as my pass-3 N11: **the sweep was recorded over the population that was easy to enumerate, not the population the class names.**

---

## 3. What repeatedly cost tokens

1. **Re-deriving what an earlier node already measured.** I re-derived the ancestry, the merge stat, the guard diffs and the C3 titles — all of which the orchestrator had measured an hour earlier. That re-derivation is the job (probe, never read), but most of it is *mechanical* and could be a script the reviewer runs and reads in one screen instead of eight tool calls. **Upgrade:** a `rev-crosscheck.sh <base> <slice-head> <review-head>` in the probes directory that prints ancestry, the guard diffs, the merge stat over a file list (with the pathspec trap handled), and the three-lists check. Every REV lens re-writes this by hand, every pass.

2. **Long serial embedded-postgres runs.** C3 ×3 + §5 + §5-1b took 12 minutes of pure machine time, and I could not usefully overlap them with my own probe without risking contention in the numbers I report. I did the right thing (background script writing to an index file, then read the logs), and that pattern is worth making standard: **never hold a foreground shell on a suite run; write an index line per run and poll it.** It cost me nothing and it kept the session responsive.

3. **Reading long records for one fact.** The pass-3 artifact is 523 lines; I needed §5's B1 and the carried table. The freeze-pair line (N13) was meant to give me the pass's record in one diff and gave me only the package. **Upgrade:** every review package should carry a `WHAT-CHANGED-SINCE-YOUR-LAST-PASS.md` of at most 30 lines, written for the lens that already reviewed this slice — not a pointer to three earlier READMEs.

---

## 4. Where THIS packet fought me, exactly

- **§1's freeze pair is wrong** (N13 in the artifact). `10ee9329..d7a3d478` is one commit and 20 files, all of them the package the orchestrator assembled *for me*. The FIX's RULING 4, V's rows, the LEDGER rows, the DECISIONS fold and the FIX seat's self-report all precede `10ee9329`. The packet's own gloss promises five categories and delivers one. I only noticed because I ran the command and read the output; a lens that skimmed it would have concluded the pass produced nothing but a package. **`packet-check.sh` should assert the range contains at least one commit outside `review-packages/`.**
- **Charge 5 says "yours must match" the orchestrator's re-verification — but `reverify-b97985a8.txt` has no C4 line at all.** The "C4 79/79" I was told to match comes from the FIX handoff, and it is a **five**-file command while the cluster map's C4 is **four** files / 73 tests. I ran both. Both green. But I spent a cycle deciding whether I was looking at a regression (N14). **One command of record per cluster, quoted from the cluster map, in every handoff.**
- **What the packet got exactly right, and should be copied into every re-check packet:** charge 2 told me *what to derive* ("seal historical v4 with the row set V's DATABASE sealed") and *where the oracle lives* (the live diag log, by absolute path, with the meaning of each digest spelled out), and then ordered a specific mutant. That is the difference between a reviewer who re-reads a handoff and one who can refute it. My whole §3 exists because that charge was written that way.

---

## 5. Dead ends — do not re-derive these

- **`42b90bca…` is NOT the pre-S03 v4 digest.** It is version 9 (GENERAL, base 4, 32 rows, 2026-09-12). v4 is `120bdfea…` (32 rows, sealed, no `planTierRosters`). The fixture comment at `registerFixtures.ts:23` now says so; believe the comment, and if you must check, the mutant in §3.2 of my artifact makes the code print `42b90bca…` on demand.
- **Do not try to make the two `p2-*` architecture assertions fail by renaming the seed's builder.** They assert `toContain` over the whole file; the string they look for still lives in the publish path. The only way to make them pin their titles is to change *what they assert*, not what the code is named.
- **`packages/db` moving at the merged head is not a guard breach.** It is the observability branch (obs schema columns, `captureHandled` on pool error). `git diff 0fe14637 b97985a8 -- packages/db | grep -i register` is empty. I checked so the next lens does not have to.
- **The API's 5xx body changed shape under the merge** (`{error, correlation_id}` instead of `{error, message}`). If a probe of yours asserts `message` on a 500, that is the merge, not S03.

---

## 6. Toward the one-prompt machine

Three changes, in the order I would make them:

1. **Measure production before you write the packet.** Any slice touching a sealed or versioned store gets a read-only diagnostic run at intake, and its output becomes the packet's oracle. This single rule would have removed the entire pass-3r node, its two live failures, the RULING 4 resume and one V ruling.
2. **Make the sweep a command, not a claim.** A handoff's class sweep should be a *command with its output pasted*, over a population the class definition names — not a list of titles the author happened to touch. A reviewer can then check it mechanically in one paste instead of re-deriving it (N11 last pass, N12 this pass — same failure, twice, and the second time after a class ruling was already written).
3. **Retire the silent tooling traps in code, not in prose.** The git-root pathspec trap is documented, was quoted to me, and still nearly produced a false clean report in my hands. A ten-line wrapper that refuses the ambiguous spelling ends it. The same applies to `pkill -f` on a shared filename and to `git stash` in a shared checkout: every trap that is currently a paragraph should become an exit code.

One more, smaller: **a REV lens should be handed its own previous artifact's findings as a table, not as a 523-line file.** My carried findings section is the one part of this review that is pure clerical re-reading, and it is the same shape every pass.
