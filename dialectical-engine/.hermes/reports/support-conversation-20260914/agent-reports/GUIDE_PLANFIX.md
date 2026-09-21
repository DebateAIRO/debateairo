# GUIDE_PLANFIX self-report

## Assignment

- Node/ticket/session: `GUIDE_PLANFIX` / `t_c52cfe4c` / `/root/requirements`
- Comments cursor: 2 (`DISPATCHED`)
- Ticket claim: succeeded with TTL 10800
- Measured product revision: clean `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`
- Result: `READY_FOR_SCOPED_PLAN_REVIEW_PASS_2`
- Usage: `UNAVAILABLE`

## Skills loaded

| Skill | SHA-256 | Evidence |
|---|---|---|
| `heartbeat-protocol` | `9f5c803cbdfb92a98bb749601b96d5fa1f2bdcba3805e7cff5be200fd98f3bb3` | retained same-session BODY read |
| `heartbeat-requirements` | `67c7917d9fe2b773b2fb0912ca99772a94aa87e262eadee152cd4630bed6bb32` | retained same-session BODY read |
| `superpowers:brainstorming` | `74edf03ea6d24ef53db48677b93558d14a979bdf052ca3f57ecdca0c66791608` | retained same-session native BODY read |
| `superpowers:writing-plans` | `48508f44bbfd7d24b029fbf3a314f3cd14c9615599059366e922f47b8dc08cf2` | retained same-session BODY read |
| `superpowers:receiving-code-review` | `091df1629510af1b92fc4abd6f96732ebedb4cb2c0f3457e8f2740b0504a2438` | BODY read for GUIDE_PLANFIX before applying the four review findings |

## Work completed

Created versioned planning artifacts only. The sealed v4 specification, original plan, and original inventory remain unchanged.

- B1 is corrected by PG-8A/PG-8B: independently testable public-guide preview proceeds with Forgot unresolved/actionless, while readiness stays blocked on the actual connector.
- B2 expands content/editorial/attestation from six to eight records and corrects the existing status pair's private-context contradiction.
- B3 serializes every real-corpus test frame with exact HEAD and `kbVersion` attribution.
- B4 keeps the message schema strictly `{text}` while making session-stored language authoritative and invalidating the active session when the selector changes.
- The inventory now classifies `/help` as a safe static action.
- Every Vitest command uses the repository-supported `--maxWorkers=1` only.
- The independent Account fix is recorded as consumed at clean revision `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`; no other product completion is inferred.

## Process postmortem requested by the owner

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

### New evidence from this correction

1. **A dependency graph can block authorized work without a code defect.** Making final composition depend on an unanswered external destination would have left independently testable privacy, menu and recovery work idle. Separate “working preview” from “checkpoint readiness” in the mission schema.
2. **Removing an input field requires tracing the state it carried.** The first plan correctly removed message `language` for privacy/strictness but did not replace its effect. The visible selector, session creation, stored language and stale retry form one lifecycle contract and should be inventoried together.
3. **Existing reviewed facts can become false after an architectural deletion.** Adding six new menu records was insufficient because the already admitted status pair still promised the private capability PG-1 removes. Every authority-removal prompt should include an impact scan over admitted public claims.
4. **Disjoint write sets do not imply independent test sets.** PG-1 and PG-2 can author in parallel, but both load the same real corpus. The one-prompt dispatcher needs separate `writeDependencies` and `runtimeFixtureDependencies` graphs.
5. **Test-command syntax is part of the contract.** `--minWorkers` looked harmless but Vitest 4.1.10 rejected it. Plans should validate command argv against the installed tool before dispatch, without running the heavy suite.
6. **Machine-readable inventory invariants catch prose drift cheaply.** The `/help` row contradicted its own action rule even though the route was safe. Mutation checks found this without implementation work.

### One-prompt upgrades

Add these required fields to future implementation packets:

- `gates.independent` and `gates.externalDependency`, each with permitted status vocabulary;
- `authorityRemoval.affectedReviewedClaims`, binding old content/components that must be corrected and re-attested;
- `stateCarrierLifecycle`, naming where a removed request field's user-visible effect moves;
- `writeGraph` and `fixtureGraph`, so parallel authoring does not imply parallel integration tests;
- `commands.argvValidatedAgainst`, recording the installed runner/version and accepted flags; and
- `negativeContractMutants`, one cheap in-memory break for every planning invariant.

With those fields, the orchestrator can derive the exact lane order, editorial set, final suite and readiness language from one prompt instead of discovering them across review rounds.

## Eight-line resumable handoff

1. `STATE: READY_FOR_SCOPED_PLAN_REVIEW_PASS_2`
2. `SKILLS LOADED: heartbeat-protocol; heartbeat-requirements; brainstorming; writing-plans; receiving-code-review`
3. `NODE/TICKET/SESSION: GUIDE_PLANFIX / t_c52cfe4c / /root/requirements; comments cursor 2; claimed; heartbeat comment auto-review rejected`
4. `REVISION: planning baseline 479763da; measured clean product 163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703 after consumed PG-3`
5. `ARTIFACTS: SPEC-v5; PLAN-PUBLIC-GUIDE-v2; MENU-COVERAGE-v2; evidence/receipt/self-report; two light logs`
6. `CORRECTIONS: B1 split gates; B2 exact8 status/menu review; B3 serialized corpus; B4 session language; /help mode; supported Vitest argv`
7. `LIMITS: no product/Git/heavy/runtime/model/private-data work; no plan verdict or checkpoint acceptance authority`
8. `BLOCKER: canonical Forgot destination unresolved; PG-8A independent, PG-8B/readiness blocked`

## Transport note

The ticket read and claim succeeded. Automatic approval review rejected the minimal progress comment because the Hermes destination's trust and user authorization were not established and the comment contained internal task status. I did not retry, alter the payload, or use another transport to work around the rejection. The orchestrator received the same bounded progress through the authorized native collaboration channel.
