# FIX_P1 implementation design

Status: bounded author design before product changes  
Product base: `6e5ab5fc41acebbff4264efc7d481df3db8dce44`  
Scope: final-review-pass-one union F1–F6 under `CP1-R14-ALIASES.md`

## Invariants and interfaces

The model keeps the exact four completion keys `kind`, `text`, `sourceIds`, and `actionIds`, one attempt, and the current model/relay. The server will create a cryptographically random request namespace and derive one-to-one source and action aliases from that namespace. `buildSupportKnowledgeContext` will continue to select at most three whole reviewed source sections and at most three currently available requested actions under the exact 24,000-code-point system limit, but its model-facing text will contain only human capability/action labels and request-local aliases. Canonical source/action/capability IDs, routes, repository metadata, and evidence fields remain in server memory only.

The context result will carry an immutable server-only alias map alongside its canonical selections. The draft parser will retain the four-key wire vocabulary, validate aliases as opaque identifiers, reject duplicate or unknown values, reject aliases from another request because their namespace is absent from the current map, screen narrative text against both request aliases and the complete closed canonical ID set, then translate accepted aliases to canonical IDs. Existing canonical source membership and trusted action resolution run after translation. Public sources and actions therefore retain their canonical server-owned labels and hrefs. A fixed `S1/A1` scheme is forbidden because it cannot distinguish requests.

The shared credential analyzer will keep original-span input rewriting separate from output semantic screening. Labelled values will support a finite bounded grammar: quoted values close at a matching quote within the bound; unquoted values consume a bounded number of words/code points and stop at punctuation or declared clause coordinators. The complete captured value span is replaced before sealing, persistence, model transit, legacy reads, E3 snapshots, advisory transit, and case reply projection. Benign intent-only questions retain their original text.

Operation negation will be governed by the nearest coordinated scope. Modified coordination and causal transitions such as “and also,” “and then,” “so,” “therefore,” Romanian `și de asemenea`, `apoi`, `așa că`, and `deci` open a new operation scope. Negative operation lists governed by one modal remain safe, while a positive operation in a later scope binds to a credential term or bounded pronoun reference from the prior scope/sentence and rejects.

Output screening will consume a bounded canonical-view result shared by credential, link/path, secret, code, redaction-echo, and narrative-ID checks. It will apply NFKC/control normalization and URI decoding to a fixed point, subject to a maximum of four decode passes and the existing 8,192/4,000 code-point limits. Any remaining well-formed percent-encoded octet at exhaustion rejects as `ENCODED_LINK_OR_PATH`; malformed structural escapes reject, while ordinary percentages such as `50%` remain valid. Every canonical view is credential-analyzed, closing encoded credential-noun solicitation through the bound and failing closed past it. All exact hyphenated machine IDs, including `forgot-password`, `privacy-preferences`, `sign-in`, and `support-status`, reject in narrative; spaced and localized human labels remain valid.

## Finite transformation matrix

- aliases: valid current request, duplicate, unknown, prior-request source/action, alias in prose, canonical ID in prose, natural EN/RO labels, canonical mapping and trusted action resolution;
- model projection: capability labels and availability facts preserved; canonical capability/source/action IDs, routes, repository paths, and verification metadata absent; selected article bodies remain whole; composed system stays at or below 24,000 code points;
- supplied values: EN/RO quoted and unquoted multiword values, compatibility/control-obfuscated labels, closing punctuation, harmless forgot-password intent, complete absence at every canonical sink;
- negation: `and also`, modified subject/modal, `and then`, causal `so/therefore`, Romanian `și de asemenea/apoi/așa că/deci`, negative lists, unrelated feature instructions, and pronoun continuations;
- canonical views: raw, single/double encoded credential nouns, compatibility/control forms, raw through deeper encoded links, malformed structural escapes, termination at the pass/size bound, and benign percentages;
- identifiers: every catalog action/capability/article ID in exact hyphenated prose versus human labels with spaces and Romanian labels, plus structured navigation through the resolver.

## Verification sequence

1. Add focused tests that fail on current bytes for the independent review classes and request-bound alias invariants. Use inert values only and capture the RED before product changes.
2. Implement the request-local reference map and model-safe context projection, then demonstrate valid canonical mapping and strict unknown/duplicate/stale/cross-request rejection at the answer service.
3. Implement bounded value spans, operation scopes, canonical views, and exact-ID screening. Exercise answer and advisory-summary parsers plus cipher/persistence/model-transit/legacy/E3/case sinks, distinguishing in-memory ports from loopback/embedded-DB fixtures.
4. Temporarily restore each repaired class and capture a failing oracle for alias isolation, complete value redaction, operation-governed negation, canonical-view exhaustion, and exact-ID prose; restore final bytes before GREEN.
5. Run only the affected focused suites on current bytes, one final typecheck compared byte-for-byte with the attributed 76-diagnostic baseline, and `git diff --check`. Commit only actual packet-authorized product/test paths and emit exact SHA-256 receipts.

The author makes no active-preview, browser, real Support HTTP, relay/provider, model, account/reset, or original-service request. Isolated inert loopback/embedded-DB tests are fixture evidence, not real traffic. LIVE_P1 owns the supported reload, the exact integrated union, and the same seven real prompts once. Final pass-two review and the owner-supplied Forgot-password destination remain required; this correction does not claim checkpoint readiness or acceptance.
