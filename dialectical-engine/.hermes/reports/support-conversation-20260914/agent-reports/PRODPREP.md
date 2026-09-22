# PRODPREP case file — frozen UI and product-truth preparation

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — a valid catalog did not eliminate stale shell navigation

The CP1 action catalog correctly permits `/settings#consent-privacy-heading` and rejects unknown fragments. The established full Help shell still offers **Privacy policy** at `/settings#privacy` and **Cookie preferences** at `/settings#cookies` in frozen `Assistant.tsx:881-882`. The frozen Settings implementation exposes `consent-privacy-heading`, but neither legacy fragment. These links were inherited from baseline, yet CP1-R04 explicitly says they must not be offered as working destinations. The full EN/RO screenshots make both controls user-visible.

**Price.** The UI author, receipt consumer, and this preparation reviewer each validated the new server-resolved action path while the two pre-existing shell links remained outside that finite catalog check. This created a separate correction cycle after 194 passing tests and four browser captures. Actual model-token usage is **UNAVAILABLE**.

**Upgrade.** Generate a static list of every Support-owned anchor and button destination, including established shell shortcuts, and compare it to the canonical navigation catalog plus an explicit reviewed-opener allowlist. The check should fail for a missing DOM target, an unverified opener, or a label that promises a different destination.

## Finding 2 — the capture matrix omitted authentication state

The four real compiled-UI captures cover full/compact × EN/RO, but the harness forces every `/api/v1/session` request to 401 and creates `identity_bound: false` sessions. They are all signed-out evidence. The signed-in full and compact inventory from `DONE.md` therefore lacks rendered evidence for consent controls, owned-debate selection, identity labelling, and the signed-in `/new` action destination.

**Price.** The omission requires another bounded synthetic capture after the UI correction. It does not justify repeating the 194-test cluster or the entire browser audit.

**Upgrade.** Make the UI capture matrix declarative: `{mode: full|compact} × {language: en|ro} × {identity: guest|signed-in}`. Every frame should record the session endpoint result, `identity_bound`, visible consent/own-context controls, canonical action href, viewport, and screenshot hash. Synthetic identity evidence must remain labelled synthetic and must not be presented as proof of private-data authorization.

## Finding 3 — evidence labels must separate rendering from product behavior

The UI receipt is strong for real compiled React/CSS, DOM structure, canonical client-side action validation, action activation, and stale-session browser behavior. Its Support API is synthetic. It cannot establish actual relay quality, live source selection, real signed-in ownership, or the unresolved Forgot destination. Keeping this distinction explicit prevents a polished screenshot from becoming an accidental whole-product claim.

**Upgrade.** Require every browser receipt to name independently whether the shell, authentication, Support API, relay, data, and navigation destination are real or synthetic. Final acceptance should reject a receipt that collapses those layers into one `browser passed` label.

## Near misses and efficiency notes

- The immutable consumption receipt avoided rehashing a growing active stack log: the historical copy remains fixed at SHA256 `d2cfd5ca88768d376633ef36c04c7ad010d0f2399cfbcf23698e620102076a04`.
- The separate editorial PASS and ATTEST manifest allowed exact-byte reuse. Re-auditing 24 language article files would have spent another review cycle without changing product-truth confidence.
- The browser action activation covers only the full English signed-out **Start a debate** anchor. Native anchors provide keyboard semantics, but compact and signed-in activation remain useful finite probes rather than grounds to repeat all captures.
- The client parser safely normalizes absent `sources` and `actions` to immutable empty arrays for any parsed reply. Contextless terminal paths additionally reject non-empty actions. The UI evidence phrase “only for legacy terminal shapes” is narrower than the implementation; the server's ordinary message path does emit both arrays, so this is an evidence-precision note rather than an observed unsafe user outcome.

## One-prompt machine upgrade

Package the final review input as one immutable matrix: reviewed commit and blobs; every screenshot dimension; all Support-owned destinations and verified targets; real-versus-synthetic layer flags; provenance counts; and unresolved acceptance rows. A deterministic preflight can then say exactly which cells are proven, which changed, and which remain to run. Reviewers should receive only changed cells plus the frozen manifest instead of reconstructing the entire mission from logs.

## Measurements

- Agent: `/root/baseline`; ticket `t_bee73d8c`; `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`; `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.
- Frozen revision: `1ed6c29d327db535259bb428eb181e1e97081c99`; base `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`.
- Independently matched: 4/4 committed product blobs, 10/10 artifact hashes, 14/14 log hashes, UI manifest SHA256 `c3d29165f1b18c838875d141aad7fbd2470bb918bffb5d569b6d9f5fa2a6fbfa`.
- Existing automated evidence: 5 files, 194 passed, 1 Forgot TODO; UI package TSX check `rc=0`; root typecheck has 76 inherited diagnostics and 0 introduced.
- Existing browser evidence: four signed-out full/compact EN/RO captures; real compiled UI/CSS; synthetic Support API; full-English keyboard action reaches `/login?next=%2Fnew`.
- Provenance: 18 shipped pairs; 12 peer-reviewed preview pairs; 6 owner-ratified pairs; 24 review records; owner acceptance false.
- Routed gaps: `PROD_LINKS=t_60f2ec16`; `PROD_SIGNEDIN=t_e5e62435`; correction author ticket `UIFIX1=t_9e40cdeb`.
- Heavy commands, browser launch, code edits, services, final verdict, and owner ratification: none.
- Actual model-token usage: **UNAVAILABLE**.
