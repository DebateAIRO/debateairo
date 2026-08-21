# H3 MERGE — C2 plan-review rework packet (rework_round 1 of 3)

Router (Claude-Router) merged the two blind plan-review lenses. Both returned
CHANGES REQUESTED; the findings are COMPLEMENTARY, not contradictory — no
opposed verdict required a single-finding re-check. This packet unions them and
routes to the SAME C2 planner session.

- Lens A — requirements fidelity: `reviews/H2-plan-fidelity-opus.md` — FID-01
  BLOCKER, FID-02..14 MAJOR, FID-15..17 MINOR.
- Lens B — systems red-team: `planning/PlanReview.md` — RT-01..42, 12 BLOCKER,
  28 MAJOR, 2 MINOR. All Plan.md repo citations independently re-verified as
  HOLDING (the attacks are on the designs).

## How to consume

READ BOTH verdict files in full — every FID-nn and RT-nn is itemized there with
severity, evidence, and the smallest required change. This packet gives you the
MERGE STRUCTURE so you fix themes, not 59 disconnected items. Address every
finding; where a fix collapses several, say so and cite the ids.

## Five themes (Router's dedup map)

**THEME 1 — Zone-boundary leaks (BLOCKER).** FID-09, FID-10, RT-07, RT-08,
RT-09. The classifier stores stack frames carrying zone file:line in SHARED
captures (reopens the S3b enumeration oracle at trace granularity), a
branch-asymmetric capture-cost timing oracle on the zone path, splits ordinary
shared-code errors into their own incident (opposite of OBS-R131), and
default-to-excluded silently DISCARDS (uncounted) every no-usable-frame throw.
Redesign: frame-scrub + cause-chain stop before store, equal-work on the
classify path, and a decision-table row for (no context, no frame) that counts
a CAPTURE_GAP rather than dropping. This is the R-E5 / U-09 core.

**THEME 2 — Fix-agent containment (BLOCKER, most safety-critical).** FID-01,
RT-19, RT-22, RT-28, RT-29, RT-25, RT-26. The spine §9 floor (OBS-R093) and
E6-11 are UNCITED, "forbidden-surface touch" is undefined, and "production
file / ~20 lines" has no definition — so a one-line `package.json`/register-
seed/`compose.dev.yaml`/`tools/` edit clears the floor. Worse, the
internet-reachable `/v1/obs/client-report` (auth = sha256 of any header) lets a
client mint a fingerprint, clear E6-12 maturity, and drive a QUICK UI-copy fix
to an auto-merged PR into `dev`; and the fix worker has no sandbox, so QUICK's
ratified "1 test file" + `pnpm test` = arbitrary code executed as V (defeats
dual-control + kill-switch + OBS-R104). Grant containment (RT-28) is vacuous
(NOLOGIN roles, everything connects as `debateai`). And the canary (RT-25) is
inert under merge-only, so G5's auto-revert can never fire. Redesign: cite and
enforce the §9 floor as the dominating gate; define "production file"
enumeratively and put dependency/config/register/tools edits ABOVE QUICK;
authenticate/rate-scope client-report and treat its `component` as untrusted
(cannot seed fingerprints that grant fix authority); specify a real fix-worker
sandbox; make the canary observable or drop the claim.

**THEME 3 — Capture completeness + fail-CLOSED (BLOCKER).** RT-01, RT-04,
RT-09, FID-05, RT-03, FID-02. Boot/import-time throws precede
`installProcessCapture` (RT-01); the gap counter is in-memory and the
auto-trip reads only absence-shaped signals, so on disk-full/crash the
fix-agent authority fails OPEN exactly when R-E6-13 requires it OFF (RT-04);
OBS-R061 chaos cases (queue full, recursive-writer failure, crash-during-flush)
and OBS-R012 suspicious-success are dropped. Redesign: durable gap counter +
authority defaults-OFF unless a positive health proof exists; enumerate and
handle the full OBS-R061 set; recover the OBS-R012 class.

**THEME 4 — Dual-source integrity.** RT-14, RT-16, RT-20, RT-21, FID-08. The
two "independent" sources share one Postgres container (RT-16); Hatchet
`retries` inflate E6-12 maturity (RT-14); the daemon board write reads OBS-R127
on a passive-voice loophole and targets a board whose global pointer sits on
the live docker-hatchet mission (RT-20 + wayfinder T05); ticket text reaches
Hermes/other orchestrators OUTSIDE the OBS-R102 injection wall (RT-21);
`obs.occurrence_detail` is specified two incompatible ways (FID-08). Fix the
independence claim, the maturity inflation, the OBS-R127 seam, and the
injection-wall boundary around board writes.

**THEME 5 — Rollout + vocabulary fidelity.** FID-11, FID-12, FID-13, FID-14,
RT-33, RT-41, FID-03, FID-04, FID-06, FID-07. SPIKE-U06 triggers on
docker-hatchet publishing → violates the ROW-TOPOLOGY "no hard cross-mission
ordering" ruling (FID-11); the OBS-R122 ladder was renumbered and G6 dropped so
rollback darkens the notification path (FID-12); G2's tracer acceptance is
vacuous (INSUFFICIENT_EVIDENCE is a valid vocab member with no rate ceiling —
RT-33); severity `>=` over unordered CONDITION_MARKS is not evaluable and FATAL
isn't a member (RT-41); R-BIGGER is unreachable for NON-severe above-QUICK
incidents because notify/approve is severity-gated and the allowlist starts
empty (FID-06); §K DECIDE-V table is incomplete (FID-14). Fix the gate
acceptance criteria to be falsifiable, restore the ladder, make severity
orderable, and route non-severe above-QUICK through R-BIGGER.

## Rework rules

1. Same C2 session (same-terminal law); this is rework_round 1 of 3.
2. Fix in Plan.md; keep OBS-Rnnn / ruling-id traceability; re-run your own
   §K/§L closure so no cited-but-unimplemented id remains (FID-13).
3. If ANY finding cannot be resolved without REOPENING a V ruling (e.g. RT-25
   if you conclude the canary is incompatible with E6-01 merge-only), DO NOT
   guess and DO NOT contact V — put it in the Plan.md DECIDE-V table as an
   ARCH->REQ return with options + your recommendation, and the Router routes
   it to V in the next packet.
4. Held-not-charged items (both lenses): QUICK mechanics faithful to
   R-E1/R-E2, R-E4 user-id exclusion mechanical, apps/ui sole-client correct,
   U-07 closed, OBS-R127xR-E6-09 precedence exemplary — do NOT churn these.
5. Re-handoff with READY FOR HERMES STAGE REVIEW; the two lenses re-review
   (disagreement-only where possible).
