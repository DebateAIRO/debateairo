# Self-report — seat `REV-S03-p1-security-data-safety` · node REV(S03) lens security-data-safety, pass 1 · ticket `t_8f344263`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

A case file. Wall clock: claim 21:42:41 EEST, verdict ~22:35 EEST — about 55 minutes, one seat, no rework, no blocker. Roughly 60% of that was two background test runs I could not shorten (C3 143s, the §5 integrated ~4 min) and the rest was reading and probing.

## 1. The cause, not the symptom

**The single most expensive structural fact in this slice: a security property was proved by ASSERTING it in the same file that implements it, and no one had built the negative case until this lens did.** Three of my seven findings (N1 the custody gate that cannot fail, N2 the credential check that a short-circuit skips, N3 a "cap" that is checked after the buffer is full) are the same cause wearing three coats: **a named constant or a named test stands in for an enforced invariant.** `MAX_PROBE_RESPONSE_BYTES` reads like a bound and is a post-mortem. `model-config-no-secret.test.ts` reads like a custody gate and is two `not.toContain` calls. `PROVIDER_PROBE_SKIPPED_UNCREDENTIALED` reads like a total rule and is one branch that a preceding `return` skips.

The upgrade is mechanical and cheap: **for any test whose job is to refuse something, the author must record the RED — the input that makes it fail — in the test file's own header.** A refusal test with no recorded RED is a decoration. `heartbeat-worker` already says RED before GREEN for features; it does not say it for *guards*, and guards are exactly where a fabricated green is invisible, because the suite is green either way, forever. One line in the worker contract closes this class across every mission.

## 2. What repeatedly costs tokens here

**(a) Numbers in the package that no command reproduces.** I ran the package's C4 command and got `67/67` against a README that says `73/73` (N6). Chasing that cost me two extra tool calls into the board file to learn the seat had actually run a fifth suite. It is the third instance of the same class this mission (the C4 seat reported `BUILD-S03-C4.md:10` saying "5 paths/four suites"; the fuzzy-filter `run-suites.sh` defect is its cousin). **Cause: the command string and the reported number are typed by different hands at different times.** Upgrade: the package assembler must emit each cluster row as `<command string, verbatim> → <rc, Test Files, Tests>` **from one captured run**, never from a seat's prose. A number without its command beside it should not be allowed into a review package.

**(b) Reading to find a shape I could have been handed.** Building probe F (the removal) meant reconstructing the whole custody tree — five 0700 directories, five 32-byte 0600 secrets, an 11-principal `database-principals.env`, a synthetic Hatchet JWT whose payload must carry a UUID `sub` plus two exact URLs, a canonical register receipt. I derived every one of those from `dev-api-environment.ts`, which was right (the reviewer law says build from the CLAIM, not from their test), but the *scaffolding* is not the claim — it is plumbing, and I paid maybe 8k tokens and 10 minutes for plumbing. Upgrade: **ship a `tests/support/devCustodyRoot.ts` fixture factory in the repo** (`makeCustodyRoot(mkdtemp) → root`), so a reviewer builds their attack, not the room the attack happens in. That single helper would have been reusable by the C3 seat, by me, and by every future lens on this seam.

**(c) `grep` on this Mac is two binaries.** My first grep died on `--include` under zsh's globbing (`no matches found`). One call lost. TRAPS knows this; I re-learned it by paying for it. Upgrade: every packet that expects grepping should print the one safe form (`/usr/bin/grep -rn 'pattern' dir1 dir2`) instead of pointing at a trap index — the trap index costs a read, the one-line form costs nothing.

## 3. What I nearly got wrong

**I nearly reported N2 as blocking.** My probe showed a keyless target published to the panel as HEALTHY — a fail-open credential check, which on a slice routing V's paid keys looks like a B on sight. I had the finding half-written before I asked the reachability question and found that the dev panel forces `CLI_HANDSHAKE_UNAVAILABLE` on every keyless slot, so the stale record would need that sentinel as its `modelId` and no shipped path produces one. Reporting it blocking would have cost a FIX node, a second REV pass, and the orchestrator's time, on a defect that cannot fire today. **The discipline that saved it: after producing an admission, ask "what produces the input I just typed?" — and answer it in the code, not in my head.** That question belongs in the reviewer contract's §2 beside "probe, never read"; it is the difference between a finding and a fright.

**I also nearly mis-scored the headline.** V-41 says a removal "may refuse"; the README says it "remains refused". Both are prose. Had I repeated either, I would have reported a prediction as a measurement. The probe gave me five rows — including two attacks (a forged held set, a version rewind) that nobody asked for and that both refused correctly, which is what turned "V-41 is real" into "the gate is right and only the producer is missing." That distinction is the whole difference between a REWORK of the gate and a follow-up ticket.

## 4. Dead ends — do not re-derive these

- **Hunting for a key leak into the register.** There is none: `buildDevelopmentDeploymentRegisterRows` projects to `{providerRef, adapterKind, maker}` and model ids. I proved it with a fake bearer; the next lens should read this line and spend its time elsewhere.
- **Hunting for a key leak into logs or errors.** None. The stack's error chain keeps only `/^DEV_[A-Z0-9_]+$/` messages, the CLIs print codes, and the two availability warnings carry `tier=` and `model=`. Also none in the diff or in the three mission trees (`sk-…`: zero hits; the two hits are relay handshake fixtures).
- **`thinking: disabled` for Z.ai.** It IS applied — the catalogue's maker string is exactly `Z.AI`, the extension map's key. The C2 seat left this UNVERIFIED; it is now verified for the dev panel's maker names. Do not re-open it.
- **The homograph / IP-literal / `.internal` base URLs.** Admitted by both gates, and *not* a SPEC-v3 requirement (no host allow-list is specified). Recording them as findings would be inventing a requirement.

## 5. Where THIS packet was unclear, exactly

- **Charge 2(e)** asks whether the slot-0 → `VLLM_*` case "is reachable at cc014550? measure" — and cites V-39, which already states the case and its default. It took me a read of V-39 to learn that my measurement was **evidence for an open row**, not a new finding. Upgrade: when a charge duplicates an open V row, the packet should say so in the charge itself ("measure it; it is V-39's evidence, not a new row"). I spent tokens deciding whether to raise a row that already existed.
- **Charge 2(f)** names "F-ARCH-4" with no pointer. I could not resolve that label from my inputs and worked from S23/S28/S30 and V-41 instead. An unresolvable label in a charge is a silent instruction to read more than the floor allows.
- **The verification line** ("your OWN fixtures for the whole slice, both modes on UI · one mount of every surface this slice shares…") is the generic REV(S) line pasted onto a `ui: no` slice. There are no modes and no artboards here. The README narrows it per lens, and the packet says the README wins where it narrows — but the packet's own line is what a seat reads first, and reconciling the two cost a re-read. **A packet for a `ui: no` slice should not carry the UI sentence at all.**
- **`probes.md` is numbered 1…11, 13, 12.** Trivial, and it still sent me to the wrong block once.

## 6. Toward the one-prompt machine

Three changes, in the order I would make them:

1. **Guards must ship with their RED.** Any test whose purpose is refusal carries, in its header, the input that makes it fail and the date that was measured. Cost: one line per guard. Saves: the entire N1 class, in every mission, forever — and it is checkable mechanically by `packet-check`.
2. **One captured run is the only source of a number.** The review package assembler emits command + rc + `Test Files` + `Tests` together, from one execution, for every row it prints. Cost: a loop in the assembler. Saves: the C4 class (three instances this mission), and it removes the reviewer's obligation to distrust the package before distrusting the code.
3. **Give reviewers a fixture factory for every custody-shaped seam.** `makeCustodyRoot`, `makePanel`, `makeReceipt` in `tests/support/`. Cost: an afternoon, once. Saves: every blind lens after this one re-deriving a 40-line room before it can throw its first punch — which is the single biggest block of tokens I spent, and the one with zero review value.

The honest measure of this seat: seven findings, none blocking, and **five of them came from probes that took under a minute to run once the fixture existed.** The bottleneck was never the thinking. It was the room.
