# GUIDE_HARNESS_REVIEW21

Verdict: **REWORK_BOUNDED_SUCCESSOR_CUSTODY** at exact clean product revision `456cafb9e56a737de550570b5736ec52d79ddf48` and KB version `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`.

The two corrections requested by this node are technically sound, but the prepared successor still has two narrow evidence-custody defects. No runtime, browser, status, capacity, database, Support, or model activity is authorized until those defects are corrected and separately rebound.

## Explicit correction of REVIEW20

My prior `PASS_FINAL_BINDING` missed both real defects later preserved by LIVE20:

1. I inspected the UI producer and the wrapper independently but failed to compare their private-control field schema. The actual producer emits `privateControls[*].passed === true`; BIND20 required `privateControls[*].result === "PASS"`.
2. I accepted the arithmetic label “five capture sessions plus two owner sessions” as simultaneous headroom. The immutable configured hourly limit is five, so capture can require five free slots now; the two owner slots must be measured later after natural expiry.

LIVE20 remains a valid zero-traffic failed attempt: the actual UI producer completed five transitions with zero forwarded Support requests and five `passed:true` private controls; the wrapper then failed. Readiness, capacity, gate, row proof, capture and idle did not run. Support/model/capacity/database traffic remained zero.

## Intended BIND21 corrections — PASS

### UI result shape

`preflight-ui-contract.mjs` now consumes the actual producer field `passed`. The correction proof uses the immutable LIVE20 producer output through the real exported validator. It proves:

- the old `result === "PASS"` consumer rejects the actual producer shape;
- the corrected consumer admits the exact five-control actual output;
- `passed:false`, a missing control array, and any forwarded Support request still reject;
- all five transitions, verdict, completion state, guarded create/send/other counts, and exact revision remain required.

This closes the field mismatch without weakening traffic or private-control safeguards.

### Simultaneous versus deferred capacity

The capture validator now requires five free hourly sessions, matching the immutable measured limit of five. The real validator is exercised using the immutable LIVE8 capacity fields, with only time/revision/KB rebound for a current static fixture. It proves:

- BIND20's seven-slot simultaneous rule rejects the valid five-limit fixture;
- BIND21 admits five free capture slots;
- one used slot prevents the five-session capture;
- stale capacity, KB mismatch, insufficient 31+6 daily-message reserve, and insufficient 27+6 daily-call reserve still reject;
- freshness remains 120 seconds and all other admission constraints remain unchanged.

The later owner capacity is correctly separated from capture. Its prepared validator requires the exact current KB, expected model, current freshness, at least two naturally available hourly session slots, six anonymous messages, six model calls, no cooldown, no live waiter, and relay availability. It performs one supported status read and one identifier-free aggregate query, does not serialize the connection string, and does not read the private runtime log.

## Remaining bounded rework

### GH21-R1 — stale row provenance and proof labels

The fresh artifact paths are correctly renamed to `GUIDE_LIVE21` and `GUIDE_LIVE_GUIDE21`, but `capture-public-guide.mjs` still emits every future row as:

`provenance: "FRESH_GUIDE18_FIXED31"`

The focused and binding proof names likewise say “fresh GUIDE18” while their assertions inspect GUIDE21 paths. This creates a false lineage label inside the actual successor receipt even though the path namespace is current.

Minimum correction:

- emit `FRESH_GUIDE21_FIXED31` for every fresh row;
- rename both proof descriptions to GUIDE21;
- add a control that inspects the row-provenance literal, rather than proving only the receipt pathname;
- rebind the harness digest, control proof, gate template, command contract, manifest and receipt in a new append-only namespace.

No matrix, product, KB, screenshot, plan, response, or capacity behavior needs to change.

### GH21-R2 — deferred owner output collision is detected after traffic

`owner-capacity.mjs` performs the supported status read and counts-only database aggregate before its final `writeFile(outputPath, ..., {flag:"wx"})`. If `GUIDE_LIVE21-owner-capacity.json` already exists, the command makes both reads and only then fails on collision. The final binding proof also omits this deferred output from its future-output absence set.

That ordering violates the prepared command's single-frame/fresh-output custody: a stale output can cause an otherwise prohibited extra capacity sample before the collision is reported.

Minimum correction:

- reserve or reject the exact output path with exclusive-create semantics before the status or database read;
- ensure any later failure is preserved as a failed attempt without making a second favorable sample;
- include the exact owner-capacity output in the final binding's future-output freshness check;
- add a negative proving a pre-existing output causes zero status and zero database reader invocations;
- retain exact `wx`/0600 final custody, the literal command/cwd, and all current 2-session/6-message/6-call/KB/model/freshness negatives.

## Retained PASS dispositions

- All 47 BIND21 manifest artifacts and all 96 REVIEW21 indexed inputs match their recorded SHA-256 and byte counts.
- Canonical58 current-product proof remains retained current evidence, not a rerun by this reviewer.
- The fixed31 matrix, five groups, exact row order, 14 EN/17 RO split, all20 families, all8 affected cases, owner4 cases, 27 model ceiling and 31-second pacing are unchanged.
- API/DOM/source/action/outcome observation code, session lifecycle, row verifier, matrix, controls and screenshot successor are unchanged by hash except for necessary namespace callers.
- The screenshot successor remains byte-identical at `696dc176b7a6e1bbd6f5c8b5714bbf2519c7be7809af5fda8f45ca3f085a0b7c`.
- Runtime7 custody and the existing private `GUIDE_LIVE20-stack.log` are inputs, not fresh-output collisions. No reload is required by this review.
- Earlier 151 control purposes remain historical with explicit supersessions; BIND21's focused controls are separate current executions.

## Corrected future invocation prerequisites

After GH21-R1/R2 are fixed and separately rebound, execute the seven successor phases exactly from the new command contract. Stop at first failure. The capture capacity frame remains a single pre-capture measurement requiring five free sessions plus 37 daily messages and 33 daily calls. Fresh31 quality and screenshots still require independent review.

Only after capture, actual-answer review, and natural hourly expiry may the deferred owner-capacity command run once. Its output must be absent and exclusively reserved before any read; `GUIDE_COUNTS_ONLY_DATABASE_URL` remains environment-only. The exact prepared BIND21 command, to be successor-rebound without semantic change, is:

`/Users/vladmihaimiron/.local/bin/node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND21/owner-capacity.mjs 456cafb9e56a737de550570b5736ec52d79ddf48 7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE21-owner-capacity.json`

This verdict establishes neither a successful live run nor runtime answer quality. Forgot remains unresolved and actionless. CP1 is not ready, complete, or accepted; CP2 remains gated.
