# FIX_P1 author case report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Scope and result

- Seat/session: `FIX_P1` / `/root/requirements`; ticket `t_ad0185b6`; final-review pass 1 correction, rework round 1.
- Product base: `6e5ab5fc41acebbff4264efc7d481df3db8dce44`; final product commit: `e0dcfe77f49655bea774bdfacf988b911be4ff06`.
- Actual product/test scope: 16 of the 20 allowed paths. No UI, article, catalog, model, relay, preview, or original-source path was changed.
- The final current-byte affected union passed 381/381 tests in 10 files. The final typecheck remained the already-attributed 76-diagnostic baseline byte-for-byte, SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`.

## Causes and upgrades

1. **Canonical identifiers crossed the model boundary.** The prior context used repository IDs and routes as prompt vocabulary, then expected the model to copy those same values into the response. That made internal identifiers both model-visible and likely to leak into prose. The correction creates cryptographically request-bound aliases, keeps an immutable alias-to-canonical map on the server, screens prose against aliases and canonical IDs, and translates only after strict draft validation. This is the architectural fix; adding more prompt wording would have preserved the leak.
2. **Credential value detection stopped at one token.** A labelled supplied value such as a quoted phrase or several unquoted words could be only partly redacted, leaving fragments at storage, model-transit, legacy, case, or E3 sinks. The shared analyzer now returns the whole bounded value span, with matching EN/RO quote forms and a six-word/160-code-unit ceiling. Every existing sink continues to consume the same canonical analyzer.
3. **Negation scope recognized too few coordinators.** A safe clause could incorrectly govern a later positive credential operation across causal or modified coordination. The finite EN/RO coordinator set and bounded pronoun references now split those scopes while retaining safe limitation statements and negative lists.
4. **Canonical screening was shallow and fragmented.** Two decode passes plus selected structural checks left deeper encoded credential nouns and paths outside the semantic screen. One bounded canonical-view helper now feeds every response-policy consumer, performs four fixed-point passes, and fails closed if any encoded octet remains. Malformed structural escapes fail closed; benign percentages remain accepted.
5. **Four human-looking machine IDs were exempted.** Those exceptions contradicted the internal-ID rule. The closed catalog sweep now rejects every exact hyphenated action, capability, and article ID in narrative while accepting spaced/localized display labels and structured navigation.

## Price and repeated costs

- The first implementation frame failed 42 tests because of one construction typo plus three real semantic gaps. A smaller compile/import check immediately after introducing the context result would have caught the typo before the broader frame.
- The sandbox integration attempt produced an environmental listener denial and no product verdict. The identical escalated fixture run passed 335/335; future packets should label embedded-database suites as requiring the granted host listener from the outset.
- Six useful restored mutants were needed because the findings spanned independent trust boundaries. Request binding, multiword capture, coordinator scope, canonical exhaustion, exact IDs, and encoded credential views all went RED when their protection was removed. This cost is justified because each mutant proves a distinct invariant.
- The max-decode-passes-only mutant stayed green: the independent exhaustion guard still rejected its fixtures. Treating that run as refutation evidence would have overstated the test. Disabling both the additional pass and exhaustion guard produced the meaningful 7-failure oracle.
- After the first final 380-test frame, a static boundary review found that a fifth-layer encoded credential noun could remain as a valid `%xx` octet while the exhaustion predicate only named structural bytes. A new focused RED reproduced it, the guard was generalized, and the final current-byte union became 381/381. Catching this before commit avoided another live-review cycle.
- Actual token/cost usage is unavailable in this environment. Captured command durations are preserved in the immutable logs rather than estimated here.

## Near misses and dead ends

- I nearly treated the first final suite as sufficient. Reading the helper as a state machine exposed the residual valid-octet case that the deeper-link fixtures did not cover.
- I nearly counted the passing max-pass mutant as evidence. It was a non-discriminating probe because a second mechanism preserved the property; the report keeps it as a dead end.
- Fixed `S1/A1` aliases would have satisfied superficial unknown-ID tests but not stale or cross-request isolation. The request namespace and prior-request test prevent that shortcut.
- Arbitrary text replacement and deterministic answer generation were rejected because they would change the owner-approved model and response behavior rather than repair the boundary.

## Making the next run closer to one prompt

- Put the reviewer union into a machine-readable matrix with columns for producer, transformation, canonical consumer, sink, benign control, hostile control, and required mutant. The author could generate the exact affected test argv and evidence manifest without reconstructing the union from prose.
- Define one reusable request-reference fixture that issues two namespaces and exports current, stale, duplicate, unknown, narrative, and canonical-mapping cases. That removes repeated hand-built alias setup across unit and route suites.
- State the embedded-database escalation expectation directly beside the test argv, and include the attributed typecheck baseline path/hash in the packet. Both remove discovery commands and one failed environmental run.
- Add a bounded canonicalization invariant to the shared security contract: after the pass limit, no valid encoded octet may remain. That single statement would have prevented the narrower structural-byte implementation and the late corrective cycle.

## Packet clarity

The allowed path list, internal R14 alias amendment, and real-traffic versus inert-fixture clarification were concrete and sufficient. The only operational tension was the generic three-run worker rule versus the packet's direction to avoid repeated unchanged broad runs; I used distinct focused GREEN frames plus one final current-byte union and retained every failure. No additional scope was required.
