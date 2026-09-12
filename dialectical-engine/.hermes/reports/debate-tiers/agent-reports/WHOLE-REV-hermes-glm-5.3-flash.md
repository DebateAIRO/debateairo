# Self-report — WHOLE-REV-hermes-glm-5.3-flash (node REV(WHOLE), lens acceptance, pass 1) · ticket t_f6e379a9 · resumed session 20260912_141630_d2141d · 2026-09-12

The question, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## The murder case — causes, priced

1. **CAUSE: the one-shot session died silently at ~75% with its cluster logs empty.** PRICE: one full session (est. 60-75% of a whole-feature budget) plus a resume session; wall-clock ~45 min lost between cutoff (14:41 EEST note) and productive resume. The logs under `/private/tmp/debate-tiers-WHOLE-REV-hermes-glm-5.3-flash/` carried ONLY the `run-suites.sh` banner line — the background shell was killed before vitest printed anything. UPGRADE: any seat that launches a background runner must, before its context runs long, (a) `echo $!`-register the pid file, and (b) write a HEARTBEAT comment naming the log paths; the orchestrator's watchdog should treat a `LOG=` file holding zero suite lines after N minutes as a dead runner and re-fire it. A banner-only log is indistinguishable from a never-started one — that cost me a full re-inventory pass before I could trust anything.
2. **CAUSE: light-my-user's inject response is not a WHATWG Response.** PRICE: three probe runs (~3 min) plus a wrong hypothesis (I nearly accused the contract client of dropping `status`). The client reads `response.status`; fastify's inject yields `statusCode`. UPGRADE: a two-line trap note in TOOLING-TRAPS ("bridging `api.inject` into a fetch-shaped client: await it AND wrap the result in `new Response(body, {status: inject.statusCode})`, or the client reads `status: undefined`") would have saved the entire detour for every future reviewer probing the browser error path.
3. **CAUSE: my own first dispatch of the eight clusters used a wrong expectation for one suite** (`tiers-s02-rosters` 6:0 — the map's 6 is the cluster total, the suite has 4 tests). PRICE: one CLUSTER_RED false alarm, one reconciliation pass. NEARLY got wrong: I almost wrote the cluster-map "3 failed | 6 passed (9)" down as a per-suite expectation, which would have demanded a broken suite. UPGRADE: the cluster map should print per-suite expectations ONCE (it does, in the green-verdict column) and reviewers should copy them mechanically, never re-derive.
4. **CAUSE: probe files with identical names across resume generations.** The previous session left `probe-s02-r10.log` showing a FAIL for an assertion my file no longer contained — the file had been edited after the log was cut. PRICE: ~5 min of confusion and one full file read to adjudicate. UPGRADE: probe logs and probe files should be stamped together (`<name>.<timestamp>.log`), or the runner should print the file's hash; a log that cannot be tied to its exact file version is a trap for the resuming seat.

## What repeatedly costs tokens (mission-wide)

- **Re-deriving the baseline.** Every seat greps BASELINE.md, the README's pre-existing list, and the cluster map, and reconciles three sources that disagree in FORMAT (per-suite rows vs cluster blocks vs prose). One machine-readable table (suite · base value · current value · owner-of-delta) would cut a full read pass per seat.
- **Expectation arithmetic.** The cluster map's green verdicts are stated as "base + delta" (correct for gates, hostile for re-runners). Both numbers in one cell, per suite, would remove the reconciliation entirely.
- **Probe scaffolding rebuilt per seat.** The inject→fetch bridge, the httpSession fixture wiring, the alias config — I rebuilt what REV-S01 lenses built before me. A `tests/support/probeBridge.ts` + one promoted config TEMPLATE in `probes/` would make the next reviewer's probe a 20-line file.

## One-prompt-machine upgrades (what would have made this a single clean run)

1. The packet should name the RESUME state explicitly when it exists: "previous logs at X are banner-only; treat as missing" — I spent the first pass discovering it. (The orchestrator's note #3 said "read the cluster logs you dispatched", implying substance existed; the honest default is to state what the logs contain.)
2. A per-seat scratch MANIFEST (`<scratch>/MANIFEST.md`: file → what it proves → head it was cut at) appended at every write would make any resume a single read.
3. The mutant duty should be pre-scoped by the packet: "kill these N properties: R6 existence, R6 order, R9 filter, R13 guard" — I chose the same four any reviewer would, but only after re-reading the SPEC's warning paragraphs. The properties are stable; the choices shouldn't be re-made per seat.

## Dead ends (so nobody re-derives them)

- Returning `api.inject(...)` raw from a fetch-shaped adapter → client reads `status: undefined` (statusCode vs status). Fix: `new Response(payload, {status: statusCode})`, and `await` the inject.
- A same-origin fetch shim without the `Origin` header → CORS face rejects the POST; add `origin` for non-GET.
- Expectation `6:0` for `tiers-s02-rosters` (cluster total, not suite total).
- `git diff --stat 27144e77..19b79d18` from inside `dialectical-engine/` without the `-- docs/missions/debate-tiers` pathspec: the packet's cwd-relative warning is load-bearing (without the pathspec the range shows the whole mission tree diff, which reads as noise, not as "empty").

## Where the packet was unclear, exactly

- §2 `allowed` says probes "runnable from ANY worktree: the root from `$WORKTREE` or argv" but names no config mechanism; the house convention (alias-everything configs living beside the probe, `WORKTREE=` env) is only discoverable by reading REV-S01's promoted configs. One sentence in COMMON §4 would standardize it.
- The packet's charges call the S01 probe duty "both modes on UI"; for a jsdom-render probe, "both modes" can only mean the token maps (t9) plus the suite's mode-agnostic assertions — the packet could say that jsdom cannot measure compiled CSS and that the C4 style-contract suites are the CSS face, so a reviewer doesn't invent a headless-browser rig at 23:00.
- Everything else in the packet resolved cleanly; constants all checked out (see artifact §1).

## Honest shortfalls

- None blocking. The four mutant kills are conservative (each property also has standing suite coverage); the live-browser and live-DB legs are UNVERIFIED by contract (V's preconditions), listed in artifact §7.
