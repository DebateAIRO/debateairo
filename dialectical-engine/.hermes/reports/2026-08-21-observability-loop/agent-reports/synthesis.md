# SELF-REPORT — synthesis seat (REQ-OBS-SYNTH)

- **Seat:** synthesis, separate Opus SDK subagent, fresh session (not any blind seat).
- **Artifact:** `docs/missions/2026-08-21-observability-loop/research/SYNTHESIS-requirements.md`
- **Inputs:** all three blind artifacts read in full (2,266 lines total), brief, intake,
  opus-handoff, wayfinder map + T01-T04, the goal packet **including its LIVE ADDENDUM**.

## Went well

1. The three seats converged far harder than I expected — 54 substantive requirements
   agreed independently. That made the disagreements genuinely informative rather than
   noise, which is exactly what the blind-seat shape is supposed to buy.
2. Spot-verification paid for itself immediately. Seven checks settled five disputes and
   caught two things no seat knew, the most useful being that `core.reject_mutation` is
   attached per-table via an explicit 19-table `DO` block — which dissolved DIV-03 from a
   forced choice into a false dichotomy.
3. Confirming the runner mis-wiring (`apps/runner/src/main.ts` omits `judgementPolicy`)
   turned a single-seat claim into a verified live defect. It is the best G1 acceptance
   fixture this mission could ask for: a real bug the new layer must surface on day one.
4. Verifying that `buildSchemaRepairPacket` already interpolates raw parse text into a
   provider prompt moved Codex's prompt-injection thread from "reasonable caution" to
   "documented current behaviour," which is why I adopted his stricter position on
   free-text messages over the other two seats.

## Fought me

5. Opus's artifact repeatedly argues against its own picks. His A1.3/C3 evidence supports
   throw-site capture while his R18 forbids it; his registration constant-time citations
   undercut his own E5-b choice. Resolving those honestly meant contradicting the seat
   whose evidence I most trusted, on the strength of that same evidence.
6. The numbers were the hardest discipline. Grok and Codex both named plausible figures
   (20 evt/s, €50/month, 30-day windows) and every one is ungrounded by their own
   admission. Writing "DECIDE-V" instead of averaging three guesses is correct but it
   hands V three incompatible proposals; I answered that by recommending Codex's QUICK-FIX
   *shape* on a structural argument (it is the only one that permits adding the RED test
   it mandates) while refusing to ratify any line count.
7. Noticing that Opus's "0 added files" makes his own QUICK-FIX tier nearly empty took
   longer than it should have. It is the kind of internal inconsistency that survives
   review precisely because each clause reads fine alone.
8. E4 (retention) is the one row where I declined to recommend. It turns on a legal
   reading of DR-188, not an engineering trade, and Opus's own counter — "it's only
   telemetry is how every preservation law erodes" — is the strongest sentence in the
   three artifacts. Declining felt like shirking; recommending would have been overreach.

## Would change

9. I should have run the Hatchet surface check *before* drafting, not after the mid-run
   steer. Discovering that nothing in the repo reads Hatchet state back
   (`runNoWait` fire-and-forget only) reframes the dual-source requirement from
   "integrate an existing feed" to "build a read path that does not exist" — that belonged
   in my structure from the start, not folded in.
10. The addendum arrived while I was mid-verification and I revised rather than restarted.
    Block H is sound but it is bolted on; a from-scratch pass would have threaded
    cross-source dedup through the store and trace blocks instead of concentrating it.
11. I did not read `packages/serve` or `packages/evaluator` myself and inherited both
    seats' partial coverage of them. U-14 records that honestly, but a synthesis that
    silently inherits a gap is weaker than one that names its own.

## Honest risk statement

12. My highest-confidence claims are the verified ones (§6 items 1-7) and the 54-row
    agreement set. My resolutions of DIV-07 (classify zone errors by producing module) and
    DIV-08 (dispatcher sits in ops) are new positions no seat held; both carry real
    counter-arguments I wrote out in full and neither should be treated as settled by my
    saying so.
13. I introduced no research claim that is not either a seat's claim or a repo fact I
    checked myself. No dollar figure, retention window, rate cap or latency bound is
    asserted anywhere in the spec as a requirement.
14. `reviews/H1-integrity-qa.md` did not exist when I ran. Per V's T02 order I did not
    block, and nothing in my artifact is self-certified — the integrity verdict remains
    owed and unclaimed.
