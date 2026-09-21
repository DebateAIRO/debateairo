# Testable Support preview — 17 September 2026

Open https://localhost:3100/help. Branch: `codex/support-conversation-cp1`; exact revision: `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9`. The supported local preview remains running. This is a testable demonstration of the implemented CP1 functions. Full CP1 remains incomplete because the existing Forgot-password destination has not been verified or connected.

1. Ask **How do I create a debate?** Expect a useful answer, named sources and **Start a debate**. Click the action: while signed out, it opens `/login?next=%2Fnew`.
2. Return to Help. Ask **What can I change in Settings?** and **How does JSON export work?** Expect grounded descriptions and source labels. These anonymous checks do not execute signed-in Settings or export operations.
3. Select **RO** and try **Cum creez o dezbatere?**, **Ce pot schimba în Setări?**, and **Cum funcționează exportul JSON?** Expect Romanian guidance and labels.
4. Open https://localhost:3100/, expand Support, select RO, and ask **Cum creez o dezbatere?** Tab to **Pornește o dezbatere** and press Enter; expect the same login destination.

The exact-revision suite passed all 25 files: **1,126 tests passed, one existing Forgot-navigation TODO**. Separate Sol correctness and security reviews passed their bounded scopes after fixes. The separate Sol product reviewer found all seven actual English/Romanian full/compact replies useful and materially accurate, with matching API/DOM text, sources and actions; both pointer and keyboard navigation passed. All seven sampled replies were accepted model drafts. These finite results do not establish unrestricted model quality. The runtime Support model is unchanged.

Known limitations: the Forgot-password link is unresolved and unavailable; no route was invented. Typecheck retains the same 76 attributed baseline diagnostics. The compact Romanian sample has a minor `debata` typo. Fifteen HTTP401 console-event origins remain unknown. Anonymous live evidence does not validate signed-in authority; existing integration evidence covers that boundary. Captured screenshots have documented scroll/size limits; complete per-row text is recorded in the actual receipt. Historical source custody qualifications remain unchanged.

Evidence: `reviews/REV1-p5.md`, `reviews/REV2-p5.md`, `reviews/REV3-p4.md`; repository-relative `.hermes/reports/support-conversation-20260914/evidence/LIVE_P3.md`, `LIVE_P3-manual.md`, `LIVE_P3-consumption.json`, `REV3-p4-consumption.json`, and `HANDOFF-PREVIEW-CUSTODY.json`.

Awaiting user testing or corrections to this demonstration. No checkpoint acceptance, knowledge owner-ratification, CP2/CP3 advancement, push, publication or production deployment is inferred.
