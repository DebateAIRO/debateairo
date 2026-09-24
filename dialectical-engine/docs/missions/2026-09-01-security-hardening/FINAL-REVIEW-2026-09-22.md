# Final whole-branch review and fix wave — 22 September 2026

*Written by the coordinator (Claude Fable 5.1) at the end of the execution described in [EXECUTION-PLAN-2026-09-22.md](EXECUTION-PLAN-2026-09-22.md). The subject was everything this execution added to the integration branch `security/dev-sync-2026-09-18` — 347 files between the pre-execution tip `2e2660c6` and `badb43b5` (11 work packages, the dev sync, three integration steps). The 2026-09-18 hardening batch and `dev`'s own commits were not the subject. Plain-language mirror: [PLAIN-STATUS.md](PLAIN-STATUS.md).*

## 1. How it was done

Six independent read-only reviewers (Claude Fable 5.1, the owner's choice for the final reviewer), one per risk area, each with a bounded diff package and a shared brief carrying the cross-package seam question, the binding rulings, and the rule set (typed codes, sealed values superseded never edited, no one-computer paths, paste-safe docs, tests that can fail). Findings files: `.superpowers/sdd/EXECUTION-PLAN-2026-09-22/final-review-{A..F}.md` (git-ignored working files; the substance is in this record).

| Area | Scope | Verdict | Critical | Important | Minor |
|---|---|---|---|---|---|
| A | custody group, key material, KEK rotation, boot custody | **NOT APPROVED** | 2 | 4 | 13 |
| B | prompt-injection containment: frame, fences, door, tripwires, corpus, obs-capture | Approved | 0 | 3 | 12 |
| C | deployment modes, provider credentials, register rows, cost envelopes, evaluator/serve | Approved | 0 | 8 | 10 |
| D | support chat, admission budgets, API, database package, UI support components | Approved | 0 | 5 | 11 |
| E | CI, Dependabot, the known-red gate, hooks, dependency pins, VPS kit, records | Approved | 0 | 3 | 12 |
| F | `apps/runner/src/index.ts` alone (frame call sites, capture, gateway factory, money stop) | Approved | 0 | 3 | 12 |

Every reviewer verified claims against the tree (≥ 10 rows each), ran focused suites (89–317 tests per area) and, where a defect was claimed, reproduced it on a scratch tree.

## 2. What was found that mattered (and what was done)

| # | Finding | Severity | Fix package | State |
|---|---|---|---|---|
| A-C1 | The KEK rotate command listed the file store ONCE; a record written under the old key during the pass was never verified and the run printed OK — retirement made that user's data unrecoverable. Reproduced. | Critical | FW-A | Fixed: a second listing after the re-wrap pass; every ref verified current-key-alone; a straggler fails the run with a typed code. Residual: a record written after the SECOND listing is caught by the runbook's count check, not the run. |
| A-C2 | Neither service ever read the previous KEK (the ring lived only in the crypto package and the rotate command) while the runbook said both did — the documented changeover was a full outage, and the outage-free order was C1's data loss. Reproduced. | Critical | FW-A | Fixed: both services build their stores over the ring (optional `*_KEK_PREVIOUS_PATH`; reads try current then previous, writes always current, verify current-alone); previous handles under the boot ledger; the runbook rewritten in the order that works, both services' key copies, a re-run guard, a count check. |
| A-I1..I4 | Un-zeroed data key on the already-current re-wrap path; synchronous boot throws bypassing the custody ledger; custody writes decided from the root while the record's gid came from an unchecked leaf; the runner's own KEK copy never rotated. | Important | FW-A | All fixed; every synchronous decision, both ring loads, all four store constructions and the publication cleanup awaits now run under the ledger; fchown then chmod then a read-back through the reader's own acceptance. |
| B-I1 + D-I3 | The support chat's three model hand-offs posted to a vendor with no frame and no door — the one hand-off where "one frame at every hand-off" was not met. | Important | FW-B | Fixed in the signature: the port takes ONE framed packet; the door runs before the fetch, outside the try; three corpus hand-offs (210 → 252 rows); byte pins on the instruction texts. |
| B-I2 | Three evaluator prompts changed while their contract hash and consumer version did not. | Important | FW-B | Fixed: hashes from the fingerprint text; consumer version 2. |
| F-I2 + B-round-1 | The door's six refusal codes and the builder's six were missing from the code alphabets (refusals persisted as UNRECOGNIZED). | Important | FW-B | Fixed in both lists with a sweep pin over the frame module. |
| C-I1 | A 200 whose usage block carried an unknown field (OpenAI's `prompt_tokens_details`) charged NOTHING — both money ceilings blind for that vendor. | Important (bites the paid run) | FW-C | Fixed; then the round-1 fix's lenient charge was found unbounded by an independent re-review (a `2**31` counter charged 2,147,483,712 micros against 994 admitted; a `2**60` counter escaped as an untyped error and was retried) and fixed in round 2: readable = safe integer ≤ 2^31−1, else that side's admitted projection; typed, short-circuiting failures; absent = zero; a silent block charges nothing. |
| C-I2 | The 120 s reservation lapsed before a delayed first charge; the daily ceiling degraded to the ask rate limit during an outage. | Important | FW-C | 30 minutes, provisional, the two-hold arithmetic computed from the policy (60 s margin stated). |
| C-I3 | The hosted host check admitted private ranges and the host's own routable addresses. | Important | FW-C | Refused: 10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7, mapped forms, every interface address read once at start-up. 26/26 probes. |
| C-I4, C-I5 | The development register version (6) disagreed with what a fresh database allocates (5); the vetted-vendor builder had no shipped caller. | Important | FW-C | 5; `publishGeneral` requires `deployment` and enforces the vetted builder and the set's shape on the hosted branch. |
| D-I1 | The 30-day case bearer was persisted to `sessionStorage` inside the acknowledgement message — the next visitor on a shared tab inherited the case. | Important | FW-D | Fixed: memory + URL fragment only; a per-message whitelist on write and read; storage key v2 with the old name erased. |
| F-I1 | The run-body money-stop wiring was pinned by nothing CI runs. | Important | FW-F | A source pin that counts statements, checks the guard's sense and proves its own failure against six mutations. |
| E-I1..I3 | VPS runbook/kit: the rotation section (same seam as A-C2), two required env keys missing from the example, no re-run guard. | Important | FW-A | Fixed; a known-stale banner marks the kit sections Task 14 refreshes. |

Every fix package was built by an Opus implementer in its own worktree, test-first, reviewed by an independent Opus reviewer, and fixed in one round (FW-C: two, the second after a Sonnet re-review). Merges: FW-A `2bce9c75`, FW-B `71a4eca8`, FW-D `85bbc948`, FW-F `492e2279`, INT4 `731b2a73` (a merge-exposed comment tripping an architecture pin), FW-C `a654acf1`.

## 3. Found on the way, not fixed here

- **The support-chat answer benchmark has been measuring nothing.** `pnpm run support:eval` has scored 0/60 on every run since migration 0054: the harness writes a pseudonym the schema refuses, so every test conversation is refused before a model is asked. Package FW-E (in flight at the time of writing) restores the instrument with a pin against the migration's own CHECK.
- **Support-chat vendor spend is outside the daily money envelope** (bounded by call caps only) — go-live checklist line 2.
- **Admission windows are per-process** (a restart resets them; a second instance doubles them) — checklist line 4.
- **V-26** (deletion erases support conversations) is Task 7, held for the Docker window.
- **A reservation-caused ask refusal answers Retry-After = next UTC midnight** although the day reopens within the 30-minute window — needs the serialising SQL, Docker window.
- **A readable usage side beside a malformed sibling is charged at face value** (bounded by 2^31−1) — the documented "a readable count is the vendor's invoice" property.
- Text pins are text pins: the money-stop wiring pin fails on deletion, guard inversion and comment-out; that a real run body reaches the catches is proven only in the Docker window.

## 4. What the window and the paid run still owe

See [DOCKER-WINDOW-2026-09-22.md](DOCKER-WINDOW-2026-09-22.md) and [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md).

## 5. Verification of the merged tip

Run in a clean scratch checkout of the tip so uncommitted files in the working checkout could not colour it.

| Check | Result |
|---|---|
| tip | `a654acf1` |
| `pnpm run typecheck` | 0 errors |
| `pnpm exec tsc --noEmit -p acceptance/tsconfig.json` | 0 errors |
| `pnpm run test:ci-gate` | `CI_KNOWN_RED_GATE new=0 known=5 stale=0` (the five known entries: role-token-map ×2, scaffold, v2ui-pages ×2 — all recorded with their source on `dev`) |
| `pnpm audit --audit-level=moderate` and `--audit-level=low` | no known vulnerabilities |
| UI typecheck | 0 errors |
| UI node tests | 136 passed, 0 failed |
| UI build | built; `AUTH_PRODUCTION_ROUTES_VERIFIED` for /login, /sign-up, /verify-email, /enroll-mfa |
| UI security smoke (s5) | PASS (live 200 + 404 nonce CSP, fallback CSP, static API CSP, no image optimizer, trusted-proxy client ip, upgrade teardown) |
| S06 obs binding | 6 passed |
| working tree after all of the above | clean |

Not run: every database-backed suite (Docker was down for the whole execution) — see the Docker window file.

## 6. Rulings the coordinator made during the final review and the wave

Each ruling is in the ledger with its cost-if-wrong; the ones that shape the product:

1. The final review was partitioned by risk area across six reviewers, with the cross-package seam question carried to every one of them.
2. The support chat IS a model hand-off: it gets the frame and the door now; the owner-editable split of its system text belongs to the later prompt-editing design.
3. The lenient money charge is bounded by the strict schema's limit and by what the per-run gate admitted; absent = zero; malformed = the admitted projection; a silent block charges nothing (refused as unreported in hosted); every charge-computation failure is a typed code that stops the retry loop.
4. The reservation window is 30 minutes, provisional, with its arithmetic computed from the sealed policy — not raised, because a longer window caps throughput on reservations alone.
5. Hosted refuses private, CGNAT and ULA ranges and the host's own interface addresses — a hosted deployment that must reach a vendor over a private link uses https to a public name.
6. Support-chat spend stays outside the daily money total until wired (checklist), and one API instance serves the hosted site until the admission windows are database-backed (checklist).
7. The KEK rotation's "verify" is current-key-alone in every store; the count check in the runbook closes the window after the second listing.
8. Scoped re-reviews of record-only or test-only fix rounds were coordinator reads; the money charge path got an independent re-review, which earned its seat.

## 7. What is NOT on this branch yet

Tasks 5 and 7 (Docker window), Task 13 (a native vendor adapter, when the owner names a vendor), Task 14 (the VPS kit refresh — the banner names the stale sections), the owner's paid confirmation run, and every GitHub switch and push (each needs the owner's word).
