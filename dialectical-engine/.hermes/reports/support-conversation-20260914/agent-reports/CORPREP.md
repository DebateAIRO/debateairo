# CORPREP case file — CP1 frozen server/interface preparation

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-14. Node `CORPREP`, ticket `t_2d2d5043`, reviewer session `/root/plan_review`, frozen pre-UI revision `58fbaa7d5535dad89b479b98776cf2b8e88b978e`, base `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`.

## Cause and result

The frozen server composition pins a session to its stored knowledge version, rejects an unavailable snapshot before admission, model work or message persistence, validates structured model output, resolves action identifiers on the server, and returns the assistant cipher write record's text for accepted and replaced model replies. The new route tests exercise the exact 409 ordering and exact storage/HTTP equality; mutation evidence separately shows the snapshot and canonical guards are live.

One integration seam remains for final review. The catalog and resolver support trusted `ownerDebateId` and `publicDebateRef` values, but `SupportAnswerPort.respond` receives only `signedIn` and the route passes no trusted debate projection. This is safe because owner/public dynamic actions are dropped, but the evidence does not establish whether CP1 intentionally leaves them unavailable or omitted a trusted projection adapter. Final review should resolve that expectation from the integrated UI/request context before treating dynamic action reachability as complete.

The response-policy unit matrix covers malformed JSON, extra keys, raw links, HTML, credentials, codes, control obfuscation, secret echo, false reset claims, forged sources/actions and duplicate/missing sources. The route integration proves rejected text is absent from HTTP and decrypted storage, usage remains recorded, relay health remains available and replacement responses are not rateable. The focused degraded test covers successful screened model transport and the existing circuit behavior.

The main supported blocker candidate is a composed-cap mismatch. CP1-R11 and the approved plan specify an initial 24,000-code-point system cap, while the frozen answer service retains `MAX_SYSTEM_CODE_POINTS = 12_000` and gives the context builder only 11,200 code points. The direct context tests pass 24,000 themselves, so they do not protect the value used by the real answer composition.

## Efficiency findings

- The pre-UI inventory and per-owner manifests reduced this pass to exact committed bytes and named tests. Keeping that inventory machine-readable avoids rediscovering scope after UI lands.
- The final-review packet should state whether dynamic owner/public actions are expected to be reachable in CP1. A single sentence plus one interface-level oracle would prevent repeated catalog-to-route archaeology.
- Put the system/context cap in one exported policy constant and test it through `createSupportAnswerService`; the current helper-only tests allowed the approved 24,000 value and the composed 12,000 value to diverge.
- Snapshot lookup is performed once as a guard but the resulting snapshot object is not passed onward; the answer service looks it up again by version. Passing the resolved immutable snapshot would encode the requirement directly and remove a second lookup seam, although current composition uses one immutable in-memory map.
- Test evidence is strongest when each mutation names the exact test title it defeats. The current counts prove sensitivity but make later reviewers inspect source to map failures to properties.

## Measurements and limitations

- Frozen source/interface files traced: `apps/api/src/main.ts`, `apps/api/src/support/{index,answer,classify,response-policy,security-guidance}.ts`, `packages/support-kb/src/{context,navigation,catalog}.ts`, and `packages/db/src/support.ts`.
- Targeted oracle files inspected: Support routes, metrics, degraded state, escalation, response policy, security guidance, knowledge context and navigation.
- NAV evidence reports all nine packet suites evidenced, latest aggregate 8 files/549 tests, remaining exact frame 2 files/21 tests, and restored mutation frame 2 files/23 tests.
- No tests, builds, services, browsers, providers or databases were run in CORPREP; this is a static preparation artifact and makes no final PASS claim.
- UI stale-session retry, response rendering, action clicks and integrated dependency behavior await final REV1 evidence.
- The exact Forgot password destination and click path remain **UNVERIFIED** and checkpoint-blocking.
- Product state may advance independently after the frozen revision; final REV1 must inspect only changed dependencies and UI against this preparation trace.
- Exact model-token usage is **UNAVAILABLE** from this harness.

## Skills actually read in this reviewer session

- `superpowers:using-superpowers`
- `.claude/skills/heartbeat-protocol/SKILL.md`
- `.claude/skills/heartbeat-reviewer/SKILL.md`
- `superpowers:verification-before-completion`
