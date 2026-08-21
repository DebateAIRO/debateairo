# SELF-REPORT — Opus seat, REQ-MFA-OPUS

**Mission:** `2026-08-17-mfa-recovery-requirements` · **Loop:** H0-REQUIREMENTS · **Filed:** 2026-08-18

## What went well

1. The brief was the best-constructed research brief I have been handed in this repo: numbered RQ ids, an explicit answer format, and an evidence law with teeth. Structuring by RQ id made the work parallelisable inside my own head and will make synthesis mechanical.
2. The read-order in the goal packet (packet → brief → intake → wave-1 baseline) was correct and saved real time. Being told *"do not rediscover the no-auth baseline"* was worth more than it looks — I would have burned an hour confirming it.
3. Naming a seat strength (C3/C4/C5/D3/D4) genuinely changed what I produced. I went three levels deeper on the evidence diode and the KBA verdict than I would have on an undifferentiated pass.
4. The evidence law forced a discovery I would otherwise have missed: SP 800-63B-4 **§4.2 is a full account-recovery specification, new in the July-2025 revision**. It answers V's central question directly. I found it only because "cite a section number" made me open the actual standard instead of writing from memory.
5. `UNVERIFIED` being explicitly *respected* rather than penalised is the single best design choice in the brief. I marked ~20 items and did not once feel pressure to guess.

## What fought me

6. **The self-report was never mentioned anywhere.** Not in the packet, not in the brief, not in the intake. I had already emitted `READY FOR HERMES STAGE REVIEW` and stopped. Orchestrator omission, and it means my handoff packet is now factually incomplete.
7. **My contract listed exactly one writable path and declared `forbidden: all_others`.** This report violates that contract on its face. I wrote it because the coordinator instructed it explicitly, but a contract that the orchestrator then instructs you to break is a contract the next seat will trust less.
8. **No Kanban ticket, no token budget, no compaction guidance.** The packet says `compaction checkpoints N/A`, which is fine, but I had no idea whether I was expected to spend 50k or 500k tokens. I chose depth. If that was wrong, nothing told me.
9. **WebFetch failed on several of the highest-value primary sources.** USENIX (403), Apple support pages (rendered truncated, twice), the Google Security Blog 2019 post (body stripped), Stripe's own pricing page (404 on `/identity/pricing`). Concrete cost: I could not extract Apple's published waiting period or Google's full challenge-effectiveness table, and both are now `UNVERIFIED` in the artifact where they should have been quoted.
10. **Real dead end, ~20 minutes:** hunting for a citable recovery-code retention statistic. Every crisp percentage in circulation ("49% of users forget 2FA recovery monthly", "29% reuse backup codes insecurely") traces to SEO content farms with no methodology. I believe several are fabricated. I flagged this in the artifact because I expect at least one other seat to cite them in good faith.
11. **The "requirements only, no architecture" line is genuinely hard to hold for RQ-D3.** An evidence diode *is* an architectural object. I kept it at the level of properties-and-prohibitions, but I was guessing at the boundary the whole way through and the brief gave no worked example of where the line sits.
12. **RQ-C4 names six IDV vendors as if all six publish prices.** Two do not publish anything at all (Onfido/Entrust, Jumio). The brief's phrasing — *"state what document/biometric verification actually costs per check"* — presumes an answer that partly does not exist.
13. **Subagent receipts, since the orchestrator did not capture them.** I spawned **2** subagents directly, both `general-purpose` with web access, both for parallel fact-gathering while I did the threat modelling myself: (a) messaging-channel OTP APIs for all five platforms; (b) IDV vendor pricing plus large-platform recovery mechanics. One of them **delegated further without being asked** — its first return was the single line *"Waiting on the two Topic 2 research agents"* and no findings — so there were roughly **2–3 additional nested agents** beneath it that I neither commissioned nor could read. I had to `SendMessage` it back with an explicit "do not delegate again, return the dossier as your final message". **Total: 2 direct, ~4–5 including nesting.** Rough token cost is not visible to me.
14. **Blind-seat shape has an uncosted failure mode:** I cannot warn the other seats about the fabricated statistics in (10), and they cannot warn me about anything. Divergence-as-signal only works if the divergence is judgement, not one seat having cited a content farm.

## What I would change

15. **Put the self-report in the brief.** It is a deliverable; deliverables belong in the artifact list and in the verification block, not in a message after the handoff marker.
16. **Make the contract's `allowed` list include every file the seat is expected to produce**, including harness files. If the harness needs a report, the harness's path belongs in `allowed` at dispatch time.
17. **Give seats a token or wall-clock budget in the packet.** One line: `budget: depth-first, ~N tokens`. Depth-vs-breadth is the single biggest uncalibrated decision I made.
18. **Add a "do not sub-delegate" clause to research subagent prompts by default**, or have the orchestrator provide a fact-gathering subagent type that cannot spawn. I lost a round-trip to a subagent that fanned out instead of working.
19. **Add one worked example of the requirements/architecture line** to the brief — one paragraph that is a requirement and one that is architecture, on the same topic. It would have removed all my guessing on D3.
20. **Add a cross-seat "poisoned evidence" channel that does not break blindness**: a single append-only file where any seat may record *"this widely-cited figure has no primary source"* without recording any conclusion. Blindness should protect independent judgement, not force four seats to independently fall for the same content farm.
