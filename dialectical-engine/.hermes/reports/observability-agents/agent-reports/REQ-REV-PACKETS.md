# REQ-REV-PACKETS — self-report (COMMON §5 case file)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REQ-REV-PACKETS. Role: heartbeat-reviewer (Grok 4.6). Ticket: `t_8b2f1d40`. Started 2026-09-02T18:25:20Z. HEAD at CLAIM: `2b670d30`. Shared tree at CLAIM: 65 dirty entries. Verdict: `docs/missions/observability-agents/reviews/REQ-REV-PACKETS.md` (`PASS`, N1 and N2).

## Causes (not symptoms)

1. **Packets still pin a "latest" round by filename instead of by a durable rule.** COMMON just spent a whole rework killing `__CURSOR__` and the live dirty-count. REQ-SYNTH then hardcoded `latest reviews/REQ-REV-FIX-r2.md` while `REQ-REV-FIX-r3.md` was already on disk (mtime 21:09:49 vs packet 21:13:19). OBS in the same sentence uses "plus any later controller-authorized round that exists at dispatch" — that formula should have been the FIX/SUP formula too.
   - Price: this review ~25 min on timestamps + first-lines of r2/r3 that a SYNTH seat will otherwise re-derive; one extra review round if SYNTH ships a compass that still treats r2-N1 as open.
   - Upgrade: one sentence, used everywhere a "latest verdict" is named: "r1 plus every later `reviews/<SEAT>-rN.md` that exists at dispatch; operative closure = highest N with a controller authorization comment." Never a filename that goes stale in four minutes.

2. **H0-relative demo path and packet-absolute demo path were allowed to diverge, then three product reviewers paid for it.** Original SUP/OBS P-findings are "log missing"; FIX's original P5 said the log resolved. The file lives at `docs/missions/observability-agents/logs/d12-demo-2026-09-01.log` and never at repo-root `logs/`. The packet repair named the absolute path and added verify-or-UNVERIFIED. That is the right fix. The remaining upgrade is: H0 quoted paths that seats will `ls` must be repo-absolute, or H0 must say "relative to mission root."
   - Price: original three review seats each spent a probe on a missing file; this seat spent ~8 min confirming both paths + recounting 6/1/21. Recount matched. The historical UNVERIFIED was a path bug, not a missing demo.

3. **Active routing and historical identity share vocabulary, so every repair has to say "do not rewrite" twice.** Fable/Opus/Claude/Codex Sol Max must remain in H0, original verdicts, and P8b. GPT-5.6-sol / Grok 4.6 / V must be the only *dispatch* labels. The rework got this right (P8b opus ids still present; COMMON §0 is explicit). The cost is that a naive `rg Fable` over packets looks dirty.
   - Price: this seat's routing sweep printed every Fable/Opus hit and had to classify each as historical vs live (~15 min). A one-line convention — "historical facts are prefixed `Historical fact:` or live inside P8b" — is already in the reviewer packets; apply it to COMMON child-model sentences too (`gpt-5.6-sol` vs `GPT-5.6-sol` casing is a third spelling of the same model).

4. **Line-window citations without `wc -l`.** OBS P7 was "jobs are not in cli.ts." The repair cited `index.ts:18-123`. The file is 119 lines. The jobs are there. A 30-second `wc -l` at write time would have saved N2.
   - Price: ~6 min this review. Tokens: one extra finding cycle if a later seat treats 123 as a fabricated cite.

5. **No `packets/REQ-REV-PACKETS.md`.** The contract is OBJECTIVE + COMMON + heartbeat-reviewer. That is workable. A first-time seat will still search `packets/` and waste a round looking for a packet that was never supposed to exist.
   - Price: ~5 min of "is the OBJECTIVE the packet?" at start. Upgrade: if a review has no packet file, COMMON or the ticket body should say `packet: none; contract = OBJECTIVE + COMMON + <role skill>` in the first 10 lines of the ticket.

## What repeatedly cost tokens (this seat and the mission)

- Re-reading three 130–205 line product verdicts in full to extract P-ids rather than trusting the rework table. Correct, and it cost the whole first hour. The one-prompt-machine fix is: original reviews already number P1…; the rework CLAIM must use those exact ids (it did, mostly; SUP's hyphen `P-1` vs FIX's `P1` is a needless schema fork).
- Shared dirty tree of 65 entries. Measuring and *not* cleaning it is the law; describing it in CLAIM still costs a paragraph every seat. A board field `tree_snapshot_at_claim` would make that a one-liner.
- `hermes kanban show --json` truncation (TOOLING-TRAPS). This ticket was short (0 then 1 comments), so it did not bite. When it does, seats burn a round on sliced `jq`.

## How to make coding (and this loop) more efficient

- Durable references only: no live dirty-counts, no `__CURSOR__`, no "latest r2.md" filenames, no `index.ts:18-123` without `wc -l`.
- One routing block in COMMON, copied never restated with a different roster. REQ-SYNTH S1 already points at it; keep pointing.
- Write-as-you-go worked: self-report existed before the verdict was finished; a provider kill here would have lost only the close-out table.
- Probe scripts in scratch, not in the author's report. This review's probes are independently re-runnable. That is the one-prompt-machine version of "verification-before-completion" for markdown.

## How to turn this into a one-prompt machine even better

- The packet-rework loop should have a mechanical close-out: for each original P-id, a required probe command in the rework packet itself (`diff` the 32 pairs; `test -e` the six skill files; `rg -c __CURSOR__` must print 0). This seat re-derived all of that. The rework CLAIM claimed 32/32 and 0 placeholders; both independently confirmed. Putting those commands *in the worker packet* would have made this review a replay, not a reconstruction.
- SYNTH's "latest round" must be a glob, not a name. That is the same bug class as `__CURSOR__`.
- Do not create a review ticket whose packet does not exist unless the ticket body says so in sentence one.

## Near-misses

- Nearly treating `REQ-PACKET-REWORK-R1.md` as evidence. heartbeat-reviewer §2: build the probe from the CLAIM. Independent greps/`test -e`/`diff` were the evidence; the report's tables were the claim list.
- Nearly scoring original product B/N findings. Out of contract. The OBJECTIVE says so; a tired reviewer will still "helpfully" re-open FIX B1.
- Nearly calling N1 blocking because the additional-repair sentence says "uses only the latest authorized round" and that sentence is not literally true for FIX. Root cause: r2 is already PASS, so the original failure mode (synthesize r1 REWORK as closure) is gone. Blocking would have forced a packet rework round for a remainder that does not restore P1–P7. Filed as N1 instead.
- Nearly charging the rework report for a missing `SKILLS LOADED` line. The report is the case file; the handoff is a board comment on a sibling ticket this seat must not `show`. Marked UNVERIFIED.
- Nearly using `rg` (TOOLING-TRAPS: may be absent). Used Python walks instead.

## Dead ends

- Repo-root `logs/d12-demo-2026-09-01.log` — ABSENT. Do not `ls logs/` from repo root for this demo; the file is under the mission `logs/` directory. Confirmed EXISTS there; counts 6/1/21.
- Searching `packets/` for `REQ-REV-PACKETS.md` — none, by design.
- `index.ts:18-123` as a closed interval — the file ends at 119. Read `:18`, `:74`, `:101`; do not treat 123 as a fourth job.
- Sibling `reviews/REQ-REV-*-r2.md` / `r3.md` as the original P-finding source. They are later product-rework rounds. Original P-ids live only in the r1 files.

## Where this packet / assignment was unclear

- No `packets/REQ-REV-PACKETS.md`. Contract = OBJECTIVE + COMMON + heartbeat-reviewer. Clear once noticed; not named as "packet: none" on the ticket body (`t_8b2f1d40` body is a summary, not a packet).
- "comments read through" on a ticket that started at 0 comments: CLAIM is comment 1; the cursor after reading CLAIM is 1. READY will bump it.
- "H0 and H6-selfaudit only as needed" vs "32/32 vs H6-selfaudit §1" — the latter forces a full §1 read. That is fine; say "read H6 §1 in full, H0 roster/demo/wave-1 table only."
- SUP original ids are `P-1`…`P-8` (hyphen); FIX/OBS are `P1`… . The rework report mixed `FIX P1` / `SUP P1` / `OBS P1`. This verdict preserves the original hyphenation for SUP so the orchestrator can ticket without a join table.

## Sub-delegation receipts

None. No children spawned.

## Wall-clock / tokens (this seat)

- CLAIM + skills + ticket show: ~15 min.
- Read three original verdicts + eight packets + rework report: ~40 min.
- Independent probes: ~35 min.
- Verdict + self-report: ~30 min.
- Dead-end tax (D12 repo-root path, missing packets/REQ-REV-PACKETS.md, r2/r3 first-lines): ~15 min of that.
- No sub-delegation. No git writes.

## Round 2 (scoped N1/N2 re-review)

HERMES AUTHORIZED NEXT is comment 5 on `t_8b2f1d40` (author `codex-orchestrator`). Round 2 of max 3. Scope: r1 N1 and N2 only. Started 2026-09-02T18:42:20Z. HEAD `2b670d30`. 66 dirty entries. CLAIM posted as comment 6.

### Causes (this round)

1. **Hardcoding "latest r2.md" was the same class as `__CURSOR__`.** Round-2 worker named FIX r3 *and* copied the OBS durable formula onto FIX and SUP. That is the right repair. Price: one extra review round (~this seat) that a glob-at-dispatch rule in r1 would have avoided.
2. **End-line citations without `wc -l`.** N2 was a four-line overshoot. The worker now cites `:18-119` matching EOF. Price: the round-2 packet edit plus this scoped review.

### Near-misses

- Nearly treating the Round 2 close-out table as evidence. Probes built from that CLAIM: SYNTH line 20, `test -e` FIX-r3, `wc -l` 119, export lines 18/74/101, grep 18-119 vs 18-123.
- Nearly charging the packet for not listing `:74` and `:101` as separate cites. r1 N2 asked for the range to fit EOF and for the three jobs to be the ones at those lines in source, not for three extra `path:line` tokens in the packet.

### Dead ends

- `git diff | python` with a heredoc steals stdin (TOOLING-TRAPS class). Redirect the diff to a file first.
- `git diff` vs HEAD on these packets includes the whole r1 rework, not just the N1/N2 touch. Compare against the r1-cited sentences, not against `HEAD`.

### Where the round-2 assignment was unclear

- OBJECTIVE says the scheduler citation "names the three exports at 18/74/101." The packet names the three *job strings* and a range that contains those export lines; it does not write `:74` / `:101`. I scored that as ADDRESSED for r1 N2.

### Probe log

- CLAIM posted as comment 6; comments read through 5 then 6.
- Independent probes in this seat's `probes/`: `a-synth-history.txt` (FIX r3 + durable rule True; stale r2-only False); `b-fix-r3-exists.txt` EXISTS PASS; `c-index-wc.txt` 119; `d-exports.txt` 18/74/101; `e-obs-cite.txt` 18-119 present, 18-123 absent; `f-touched-lines.txt` no new breakage; `git diff --check` exit 0.
- r1 verdict preserved: SHA-256 `0c64efaa…e94af3ff269a359cee0f58b6b394`; this seat did not write that path.
- Verdict this round: `docs/missions/observability-agents/reviews/REQ-REV-PACKETS-r2.md` **PASS**. N1 ADDRESSED. N2 ADDRESSED. New breakage none.

### Wall-clock (round 2)

- Ticket + CLAIM + skills: ~10 min.
- Read r1 N1/N2 + Round 2 close-out + two packets: ~10 min.
- Probes: ~15 min (one dead end: git diff piped into a heredoc ate stdin).
- Verdict + self-report append: ~15 min.
- No sub-delegation. No git writes.

