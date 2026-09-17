# [unassigned] F-T9-LANDING-SUPPORT-WIDGET · the landing route now mounts SupportWidget and the oracle forbids it

```yaml
state:
  ticket: F-T9-LANDING-SUPPORT-WIDGET
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from Task 9's drafted ticket **D-T9-1** (SDD ledger :95;
`task-9-report.md` §Drafted tickets). **NEEDS A V RULING FIRST** — a row in `V-DECISIONS-PACKET.md`
(2026-09-16 section B) carries it.

`apps/ui/app/page.tsx:22` returns `<><LandingPage /><SupportWidget /></>`; the oracle regex at
`tests/render/t9-landing.test.tsx:133` pins a bare `return <LandingPage />;`. The mount is
**merge-caused and deliberate** — V mounted the widget on the landing on purpose — so the row is red
because the mission-line oracle is stale by V's own choice, and the mission's `DECISIONS.md` carries no
ruling on the widget's surfaces.

**The two arms:** (a) the landing route must not carry the widget → remove the mount; (b) the widget is
intended there → widen the regex to tolerate a fragment **while still pinning that the branch is
immediate**. Do not simply delete the assertion; what it protects is the immediacy of the anonymous
branch. The row stays red with this ticket until V rules. STRENGTH: entailed.
