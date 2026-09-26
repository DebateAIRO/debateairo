# BUILD-PES-S01-C1 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat BUILD-PES-S01-C1, BUILD(S01-C1), pass 1, ticket t_ac72862c. Session 01a0d7ca-3f18-7d11-9980-97890fd8318c. Recorded 2026-09-25 12:10:01 EEST. Token prices below are estimates from tool-output sizes, not billing measurements.

## Cause and evidence

The implementation was specified precisely: a 17-line addition to the environment loader, one export line, three tests and a byte-exact ADR copy. The measured RED progression was 0/3, then 2/3 with only the reader, then 3/3 with the export. Seven temporary mutations each produced 2/3 and each byte-for-byte restore returned 3/3. Most avoidable cost came from reading and reporting orchestration, not uncertain implementation.

## Upgrades ranked by estimated tokens saved

1. **Budget every read against the outer tool's output cap.** I batched two large reads whose combined output was about 26k tokens behind a 10k outer cap. The recovery read was itself about 11k and truncated again; I then read the missing ranges separately. Cause: I set inner command limits but omitted the outer `functions.exec` limit. Price: two truncations, several recovery calls, roughly 10k–20k repeated output tokens and about a minute. This was my orchestration error. Upgrade: bounded nonoverlapping ranges or an explicit outer budget equal to their sum. VERDICT: implement in the seat bootstrap / CONFIDENCE: high / STRONGEST COUNTER: larger budgets expose more text at once; bounded reads are preferable when the authority is long.

2. **Return session identity fields only.** I printed the full first rollout record to authenticate the session. That record included the entire base instructions, which were already in context. Only `session_id`, `cwd`, `originator`, timestamp and the path were needed. Price: roughly 5k–6k unnecessary tokens, one oversized response, no implementation retry. Upgrade: select those fields before printing. VERDICT: project the metadata / CONFIDENCE: high / STRONGEST COUNTER: the raw record can help diagnose launcher inheritance; keep it addressable without printing it by default.

3. **Generate a current-decision excerpt for each cluster.** The packet's input paragraph requires all of DECISIONS.md, including superseded requirement history and other-cluster choices, while the implementation is one generic reader. The file is about 12k tokens and only its reader/ADR/sequencing decisions affect C1. Price: thousands of context tokens before the first edit; no product ambiguity resulted. Upgrade: the orchestrator generates a provenance-linked C1 settled-decision block and changes the future packet's reading floor to it. Do not silently skip today's required reading. VERDICT: generate a cluster excerpt / CONFIDENCE: medium / STRONGEST COUNTER: history records rejected alternatives that can prevent repeated proposals; the excerpt must preserve relevant rejections and be freshness-checked.

4. **Resolve skill version, then load the entry skill before the role skills.** I listed installed Superpowers versions and loaded heartbeat-protocol and heartbeat-worker in the same call, before loading using-superpowers. That violated the prescribed order; the CLAIM discloses it. All required skill bodies and test references were loaded before tests or product edits. Price: a process exception and disclosure, not a missing skill or product rework. Upgrade: a bootstrap manifest with the resolved version and ordered exact paths. VERDICT: enforce the order in the bootstrap / CONFIDENCE: high / STRONGEST COUNTER: hardcoded installed versions grow stale; resolve at dispatch, then pin the resolved paths in the packet.

## Nearly wrong, dead ends, and packet clarity

- A mutation that copies all of the real process environment would make a failed object comparison print unrelated ambient values. I used only the synthetic `PES_S01_PROBE_D` for the unlisted-key mutation. No real key was needed or read as a fixture.
- Restoring via `git checkout` would erase the uncommitted reader. I retained each file's bytes in memory, restored those bytes in `finally`, compared them, printed status after every restore, and ran the suite GREEN after each one.
- A pair-only comparison could miss an exchanged baseline failure. The final evidence compares the six architecture failure names with START and the ARCH baseline, not only 719:6.
- `rg` was unavailable; the fallback was `grep`. Price: one failed read command, seconds, no install and no search detour.
- No implementation dead end occurred. The only dead end was oversized reading. The PLAN anchors matched the measured base, and the prescribed proposed reader matched its stated insertion point.
- The packet's “three-run table” and the eight-line handoff need different amounts of space. I keep the eight-line envelope and put the tables below it; no gate or evidence is omitted. The packet could explicitly name this layout.

The one-prompt improvement is an executable dispatch manifest: ordered resolved skill paths; bounded reading ranges with source hashes; expected baseline failure names; exact stock-runner invocations; and a handoff schema. Preserve the required baseline, mutation, and three-run evidence. Their runtime is intentional; the savings are in repeated context and evidence transcription.
