# DECISIONS — 2026-09-01-algorithm-live-loop
Append-only. Dated. V is final authority.
Build mission executing goal-v4 (`../2026-08-31-algorithm-correctness/goal-prompt.md`,
sha256 78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986) under the rulings
in `../2026-08-31-algorithm-correctness/DECISIONS.md` (I-1…I-5, S1-1…S7-3). Baseline dev@1c9578a.

## 2026-09-01 · Intake (orchestrator; V's /goal text is the authority)
R7-1 ROSTER + R7 ELECTION (per loop, from V's /goal text — not a preset):
     Fable 5 = orchestrator + judge (final judge per subagent lane AND for the whole goal).
     Opus 5 = every subagent seat (requirements transcription + all worker lanes).
     Codex gpt-5.6-sol @ xhigh reasoning = code reviewer for every Opus worker lane.
     Loops: REQUIREMENTS→Opus 5 (bounded zero-drift transcription of the frozen goal);
     ARCHITECTURE→none (pre-satisfied: goal-v4 embeds the HOW; r1–r3 review trail);
     PROGRAMMING→Opus 5; QA→Codex review + Fable judge verdict.
R7-2 DECORRELATION: authors (Opus 5, Anthropic) / reviewer (gpt-5.6-sol, OpenAI) / judge
     (Fable 5, Anthropic). Judge and authors share a vendor — same stacking V chose
     knowingly at I-1 of the walkthrough mission; the /goal text re-elects it explicitly.
R7-3 CONFIRM-ITEMS DISPOSITION: V ordered "implement the goal found in <path>"; the seven
     confirm-item recommendations recorded inside goal-v4 are therefore the operative
     defaults (1 yes · 2 yes · 3 NO · 4 accept-mapping-now · 5 yes · 6 yes · 7 park).
     Re-presented to V at acceptance; a V reply at any time overrides mid-mission.
R7-4 CONTRADICTION CHECK (brief vs protocol): the only conflict found is roster-vs-spine —
     spine §5 forbids the Router content judgment and the high floor demands a 3-reviewer
     diamond; V's /goal roster overrides both (judge seat granted to Fable 5; one code
     reviewer). Recorded openly here; requirements seat re-runs the check on the brief
     itself and reports independently.

## 2026-09-01 · Orchestrator-declared deviations (V may veto at any time)
D1. hermes kanban CLI absent (re-verified this session) → file board under `board/`.
    Tickets are files; seats never write board files; seat markers appear in their report
    files and the orchestrator mirrors them into ticket state (same as prior mission D1).
    Judge verdict stands in for Hermes-Verifier stage review per R7-1; marker vocabulary
    unchanged (`READY FOR HERMES STAGE REVIEW` ≙ ready-for-judge).
D2. REVIEW PATH vs HIGH FLOOR: most lanes sit on the immutable high-risk floor (scoring
    semantics, migrations, provider spend). Spine §5.3 high → full review diamond; V's
    /goal roster names ONE code reviewer (codex) + the Fable judge. V's election governs:
    routed path = worker (RED→GREEN evidence) → codex peer review (static, sandboxed) →
    judge → V acceptance at closure. risk_tier is still recorded `high` wherever the
    floor bites; board-lint enforces the floor tags.
D3. Worktrees are created MANUALLY off the mission integration branch
    (`mission/2026-09-01-algorithm-live-loop`, created at 1c9578a); native agent isolation
    bases off origin/main — the wrong tree (prior mission D3 trap).
D4. INTEGRATION MERGES: lane branch → mission integration branch merges are performed by
    the orchestrator as assembly (no content edits ever; a conflict routes back to the
    owning worker as rework). V performs every merge into dev/main — that law is untouched.
D5. T0 baseline seat runs in the PRIMARY checkout (already pinned dev@1c9578a with
    node_modules installed); its contract forbids writes outside its report/log paths.
    All code lanes get their own worktrees + installs.
D6. OPERATOR-DELEGATED CEREMONY INPUTS: local free ports, ACCEPTANCE_STRANGER_SAMPLE_RATE=1,
    and a generated 43-char `[A-Za-z0-9_-]` service credential are supplied by the
    orchestrator as dev-local operator inputs (acceptance/README.md marks them
    operator-supplied; the credential is format-validated at the CLI, verified at
    run-acceptance.ts:75). Grok CLI is absent on this host → the discovered panel is the
    codex + claude relays (M=2), lawful per DR-182 and sufficient for the M≥2 global DoD.
D7. REQUIREMENTS SEAT SCOPE: transcription/structuring ONLY. goal-v4 is frozen (hash
    above); the compass and slice SPECs quote task text verbatim and cite goal line
    ranges. Zero-drift is verified by orchestrator byte-diff of quoted spans + judge
    review. Any perceived need to reword is a FINDING, never an edit.

## 2026-09-01 · Judge rulings on REQ-01's blocking findings (V may veto at any time)
J1. (settles REQ-01 F2 → board F3; unblocks S01/T16) DEV-PROVISIONAL DEFAULTS for the
    register rows the goal lists but never values, set the same way the goal's own
    γ/high/low defaults were set (judge-drafted, sealed as tunable rows, V-vetoable):
    · dispersion scale = 1.0 — identity on the unit interval: the recorded dispersion IS
      the panel τ-range ((max−min)×scale, s04.ts:279); maximally legible, trivially refit.
    · disagreement threshold = 0.25 on that scale (panel members ≥0.25 apart in τ ⇒ the
      winning root's judgement counts as disagreed for T11 rung 2).
    · repeated-family multiplier = 0.5 (second and later same-family voices at half
      earned weight, s04.ts:283-294 semantics).
    · downgrade bands row = the ENGINE'S EXISTING band vocabulary in its canonical order
      with a one-step-down mapping; T16 seeds the vocabulary verbatim from code and
      invents NO new names (grep-cited in the row's source_ref).
    · provider/model→family map = the three CLI provider families (OpenAI, Anthropic,
      xAI) as discovered by the acceptance relay layer; unmapped model ⇒ family kind
      UNKNOWN, which s04.ts:289 exempts from the discount — seeded explicitly as the
      UNKNOWN-family behavior the goal demands.
J2. REFIT SYMMETRY: T7's closure refit duty is EXTENDED to record fitted
    recommendations for dispersion scale + disagreement threshold from the same first
    M≥2 acceptance run that refits δ/ε (values recorded here at closure; rows stay
    tunable without code). Cures the uncalibratable asymmetry REQ-01 F2 names.
J3. (settles REQ-01 F1 → board F2; gates S05/T7) LEVERAGE IS ROOT-SCOPED — reading (b).
    The freeze quantity for a branch = the ROOT-RESTRICTED max |Δstrength| taken over
    the recorded per-node fragility rows (propagation/src/index.ts:613-618) of the
    branch's subtree-root sensitivity record; the caller (runner) supplies the root ids
    since propagation has no root notion; the recorded all-nodes `leverage` field is
    left as a recorded quantity, unconsumed by the freeze rule. RATIONALE: the mission's
    object is the ANSWER — root strengths drive winner, margin, and label (T10/T11); a
    branch that cannot move any root cannot change the answer, and the goal's own
    rationale sentence ("a subtree's whole influence flows through its root node")
    reasons about roots. Authority: S5-1's fixed-by-judge delegation. V may veto before
    S05 dispatch; T7's exact-numeric DoD examples are authored under (b).
J4. REQ-01 JUDGED: PASS with findings routed. Zero-drift corroborated (seat 22/22
    byte-identical spans; judge spot-check 3/3; freeze headers present; compass 99/100
    lines). Finding routes: F3→S07 packet carries the goal-248-251/263-266-controls-260
    disambiguation clause · F4→S08 packet carries T6's do-not-tidy guard in spirit ·
    F5→S04 packet notes the :408-417 anchor is the CHANGE SITE, not an existing filter.
    Board tickets F2–F6 carry all five findings.

## 2026-09-01 · D8 — orchestrator packet defects (codex T14a r1 N3/N4; board F7)
The t14a-evidence packet (a) labeled an expanded paraphrase of goal T14 text as the gate
questions and carried the goal's stale "both UNWIRED" premise as fact, and (b) let one
provenance condition govern two independent questions. CURE for every future packet:
task text is QUOTED EXACTLY or explicitly labeled an expanded restatement; premises known
to be contested carry their finding reference at packet-write time; independent questions
get independent gates. The stale-premise class is now confirmed three ways (T14a worker N1,
codex E13, REQ-01 transcription trail) against the FROZEN goal text — the correction lives
in rulings/DECISIONS lines, never in silent packet rewording.

## 2026-09-01 · D2 clarification (review routing, recorded before W1 dispatch)
V's roster line "Codex as code-reviewer for each Opus 5 subagent" governs every lane that
produces CODE — codex review runs regardless of risk_tier (T2's low tier included).
Docs-only seats (REQ-01) and pure evidence lenses follow spine §5.3 tiering: low → direct
judge review (as REQ-01 was closed), high (T14a: production-wiring evidence) → codex + judge.
W1 parallelization note: T1/T2/T4 read no register rows and share no files with T16;
T8 is held for after T16's integration merge because both own migrations.

## 2026-09-01 · D11 — slice PLAN.md evidence columns (packet defect found by T2; V may veto)
REQ-01's compass says workers fill their slice PLAN.md evidence column; every worker
packet's `allowed` list excludes slices/** (deliberately — slice files are frozen-ish
mission scaffolding). The PACKET is the dispatch law: workers never write slice files;
the ORCHESTRATOR mirrors evidence (RED/GREEN log paths, suite counts, review verdicts)
into the slice PLAN.md at each lane close, same as PROGRESS custody. Compass stands
unedited (it is REQ-01's artifact); this line is the controlling clarification.

## 2026-09-01 · D9 — contract-generation provisioning (T0 root cause; V may veto)
T0 traced ALL THREE baseline reds to one cause: `packages/contract/generated/` (gitignored
build output, dialectical-engine/.gitignore:7; produced by `generate:contract`, a build
step that typecheck/test/ceremony do not run) was absent from this checkout. RULING:
generating it is ENVIRONMENT PROVISIONING — same class as pnpm install, not a tree edit.
The orchestrator ran `pnpm run generate:contract` in the primary checkout and every lane
worktree (logs/genctr-*.log; all GEN-OK). T0's pre-provisioning pins are RETAINED in its
report as the trap record; the baseline-of-record is the T0 seat's post-provisioning
re-pin. Trap appended to TOOLING-TRAPS.md. (Also recorded: `git check-ignore <dir>` on a
NOT-YET-EXISTING directory reports not-ignored — verify at file level.)

## 2026-09-01 · D10 — TREL lane authorized (T0 finding 3; V may veto)
The acceptance relays hardcode absolute binaries from another user's machine
(acceptance/claude-relay.ts:27 `/Users/vladmihaimiron/.local/bin/claude`,
grok-relay.ts:12 `/Users/vladmihaimiron/.grok/bin/grok`; model-shim.ts:15 resolves here
only by accident of an installed app). On this host the discovered panel is therefore
M=1, making the Global DoD's M≥2 acceptance run STRUCTURALLY unreachable — the goal's own
DoD cannot execute without repair. AUTHORIZED as mission-enabling harness repair, not new
scope: ACCEPTANCE_CLAUDE_BINARY / ACCEPTANCE_GROK_BINARY / ACCEPTANCE_CODEX_BINARY env
overrides with the existing constants as defaults, typed-loud failure paths unchanged,
static tests only (fake-CLI fixtures); the LIVE proof is T0's ceremony re-pin. Board: F8
(finding) + TREL (fix lane). The goal's task set is untouched; V may veto and supply a
different remedy.

## 2026-09-01 · JUDGE VERDICT — T14a lane CLOSED: PASS (Fable 5)
Chain: worker r1 → codex r1 CHANGES (2B+4N) → worker r2 → codex r2 CHANGES (3 sentence-
level) → worker r3 (minimal edits) → codex r3 APPROVE. Judge cross-checked the decisive
guards and writers against codex's verbatim re-runs (dev-runner-policy.ts:98-111,
persistBootstrapRegister rows, package.json:8, runtime-environment.ts:174-177). The
seat's proposed lines follow VERBATIM (its internal header predates r3; the chain above
is authoritative). G4's ticket is board F1 (confirmed). Rework rounds spent: 2 of 3.
## 2026-09-01 · T14a double-gate evidence (I-2 WIRING SCOPE) — r2, after codex review r1
T14a-G1 OWNERSHIP = UNOWNED. The in-flight S06 runner-binding / DEV-12E lanes do not own
     runner policy provenance. S06 = observability capture binding: its entire main.ts touch
     is the one-line `import "@debateai/obs-capture/install/runner"` in e8d99d3, and its
     scope is fixed at observability-demo.sh:535,627 (ticket t_5504afe0). DEV-12E = real-CLI
     provider panel (IMPLEMENTATION-STATUS.md:47, still ◐). apps/runner/src/dev-runner-policy.ts
     has ONE commit in its history — 2d1f86b, which created it whole; neither lane commit has
     ever touched it. READ WITH THE ANSWER: the capability IS owned, by DEV-12D — closed and
     GREEN (IMPLEMENTATION-STATUS.md:46, card t_c56b17bc) and named in the enforced constant
     DEVELOPMENT_RUNNER_SOURCE_REF (dev-deployment-register.ts:25-26). "UNOWNED" here means
     "not owned by the two lanes I-2 names", NOT "never built".
T14a-G2 BROKEN TODAY = CANNOT-ASSESS. Settling the gate requires knowing which register
     version production selects and which source_ref values are sealed at that version.
     Neither is recoverable from this checkout and this seat cannot observe a deployment.
     MISSING EVIDENCE — closing the gate requires BOTH jointly: (A) which register version
     production actually selects, from a production launch definition for
     apps/runner/src/main.ts outside the development wrapper or a production environment
     receipt naming REGISTER_VERSION; AND (B) which source_ref values are sealed at that
     version, from a production register receipt tied to the version (A) establishes.
     Evidence for (A) alone does not observe (B); a single combined artifact suffices only if
     it proves both. WHY THE r1 NOT-BROKEN ANSWER WAS WITHDRAWN:
     the version-4 pin at dev-runner-process.ts:70,148 constrains the development wrapper
     only — apps/runner/package.json:8 ships `"start": "tsx src/main.ts"`, which bypasses it,
     and loadRunnerEnvironment (runtime-environment.ts:174-177) accepts any positive
     REGISTER_VERSION, passed straight through main.ts:19,41. SCOPED FACTS THAT DO STAND:
     three non-test writers of register.register_row exist, not two — dev seeder
     (dev-deployment-register.ts:264, DEVELOPMENT_* refs, version 4), acceptance
     (seed-register.ts:291, acceptance:DR-*:V-approved, version 1), and persistBootstrapRegister
     (packages/register/src/index.ts:529, non-DEVELOPMENT refs, version 1), the last invoked BY
     the dev seeder at dev-deployment-register.ts:320 — so the dev path does seal non-dev-
     provenance rows, at version 1; and no first-party Docker/Compose/Terraform file exists in
     this checkout (pruned full-depth find, no output, exit 0), which is a fact about the
     checkout and not about production. CORRECTION TO THE T14 TEXT: readDevelopmentRunnerPolicy
     is NOT unwired — it is called at apps/runner/src/main.ts:41 and pinned there by
     tests/architecture/dev-runner-provider-set.test.ts:44.
T14a-G3 CONSEQUENCE: T14b is NOT authorized — DO NOT RUN, conjunction undecidable pending the
     Gate 2 evidence above. I-2 requires proven-broken AND unowned; UNOWNED alone is
     insufficient to authorize.
T14a-G4 CARRIED FORWARD — still needs its own ticket (protocol §2.2). claimTimeProbe remains
     unsupplied by apps/runner/src/main.ts: declared optional at index.ts:824 (DR-182 VROW-5),
     supplied in product code only at acceptance/main.ts:519. Production therefore performs no
     claim-time liveness or model-identity re-check, leaving index.ts:1377-1381
     (CLAIM_MODEL_IDENTITY_CHANGED) unreachable in production. This gap is independent of
     register provenance, so no Gate 2 answer — NOT-BROKEN or CANNOT-ASSESS — disposes of it.

## 2026-09-01 · J5 — T4's visible-mark surface (settles codex T4-r1 B4; V may veto)
The goal's Scope law CLOSES with "Every degradation or skip emits a visible condition
mark" (goal 26) — visibility is part of the Scope law itself, so the canonical mark path
is IN T4's scope by the goal's own text. RULING: T4 mints WAY-OF-KNOWING-DOWNGRADED into
the canonical vocabulary (kernel CONDITION_MARKS + contract ConditionMarkSchema), carries
a typed record judgement → runner → node projection naming the REAL node id (finalized
after writer.addNode() returns), with a production-seam test observing the PROJECTED mark.
The exhaustive UI label switches (apps/ui/lib/v3/labels.ts and legacy
web/lib/v3Presentation.ts) force one mapping line each when the vocabulary grows — those
single type-forced completions are repo-coherence consequences, NOT feature work: the
"web/ touched ONLY by T2" clause is not breached by a compiler-forced one-line label
mapping. Anything beyond the single mapping line in web/ stays forbidden.

## 2026-09-01 · D12 — stale baseline pointer in W1 packets (codex T4-r1 N1; board F9)
W1 packets cite agent-reports/t00-baseline.md as the pre-existing-failure authority
without the D9 caveat (pre-provisioning counts are the TRAP RECORD, not the baseline of
record). CURE, effective immediately and carried in every rework/dispatch message: a
lane's baseline authority = its OWN unmodified-base suite runs in its worktree (post-D9),
reconciled with T0's post-provisioning re-pin when it lands; t00-baseline.md's
pre-provisioning sections are explicitly non-authoritative for failure classification.

## 2026-09-01 · D13 — heavy-suite semaphore (TREL load evidence; spine §1 semaphore adopted)
Five concurrent lanes running vitest + embedded-postgres pushed load to 19.35 on 12 cores;
the suite's own timing assertions blow ~100× under that, manufacturing failures that
belong to no one (TREL refused its full run for exactly this reason — correctly). ADOPTED:
max_concurrent_heavy = 1 for FULL `pnpm test` runs across the fleet, effective now. The
AUTHORITATIVE full-suite run for each lane happens at JUDGE stage, serially, in the lane's
worktree before its integration merge (each ticket's verification field already names
"judge verdict + suite re-run"). Workers' zone/cluster runs remain free and are the
supporting evidence; a worker MAY run the full suite when the host is quiet but is never
required to fight contention for it.

## 2026-09-01 · J6 — T1's single-source surface (settles codex T1-r1 B1; V may veto)
The goal's T1 text states a REPO-WIDE invariant ("defined ONCE in packages/contract …
No second literal 5 (DoD greps for it)", goal 98-101, 105-106). The orchestrator's packet
wrongly narrowed the surface to contract+runner, making the DoD unsatisfiable — codex B1.
RULING: T1's lawful surface EXPANDS to eliminating the duplicate bound definitions at
packages/budget/src/index.ts:40 (costEnvelopeBasisSchema re-validating the bound) and
apps/ui/app/new/page.tsx:76 (readiness gate) + :195 (the [1,2,3,4,5] option enumeration) —
strictly by importing the contract constants / deriving the option list from min..max.
NOT a UI redesign (Scope law intact): same selector, same behavior, honest source. Any
budget/ui change beyond replacing the duplicate definitions stays forbidden. Consequence
for the DoD test (codex B2): the non-owner scan expects EMPTY after the fix, broadened to
catch validators/comparisons/option domains, with positive controls per syntax class and a
negative control. This is not new scope — it is the task's own stated scope, restored.

## 2026-09-01 · J7 — T16's "startup warning" surface made precise (codex T16-r1 B3; V may veto)
The goal (91-93) demands a STARTUP warning when synthesizer/evaluator role refs are
identical. At T16 time no consumer boot reads those rows (T9 wires that later), so the
honest T16-owned startup surfaces are the SEEDING ENTRYPOINTS: the dev seeding CLI
(dev-deployment-register-cli) and the acceptance seeding path emit one coded warning on
their real process path when the seeded refs are identical. The library reader's warning
STAYS (readSynthesisRoleControls) as the hook T9's boot integration will exercise later.
DoD: RED first through the actual dev CLI entrypoint with an identical-ref fixture; the
differing-ref silence arm preserved; a reader-level test alone does not satisfy this.

## 2026-09-01 · J8 — dev-provisional role-ref provenance anchor (codex T16-r1 B2; V may veto)
J1 rules ONLY its five values. The dev-provisional synthesizer/evaluator role identities —
two DIFFERENT configured CLI provider identities, T15b to supersede on V's decision — are
hereby ruled AS THIS LINE, under goal 91-93's default-differ requirement and I-5-style
drafting delegation. Sealed role rows cite THIS ruling (#J8) + the configured-provider
derivation in their source_ref — never #J1. A sealed row's provenance must name the ruling
that actually chose its value; a false ref is audit poison.

## 2026-09-01 · D14 — surface-local typecheck gates (T2 finding F-T2-2; V may veto)
Root `pnpm run typecheck` EXCLUDES web/ and apps/ui and omits tests/**/*.tsx
(tsconfig.json:20) — a lane editing those surfaces ships with a green root typecheck that
proves nothing about its own files. RULING: every lane touching web/ or apps/ui MUST run
and report the workspace-local gate for that surface (`tsc --noEmit -p web/tsconfig.json`
/ `tsc --noEmit -p apps/ui/tsconfig.json`) alongside root typecheck, classifying any
pre-existing errors (web/ today carries exactly one: layout.tsx:3 TS2882, proven
pre-existing by T2). Changing the repo's typecheck script itself is OUT of this mission's
scope — recorded as board F16 for V. Applies immediately to T1 (J6 ui edits), T11 (banner
mapping), and any later ui/web touch.

## 2026-09-01 · J9 — TREL r3 transcription residue absorbed on the record (answers codex r3's V-row; V may veto)
Codex r3 verified TREL's product mechanics fully (sessions-root arm exact; companion-arm
M8 necessity TRUE; guard MOVED with the four-combination unreachability table correct;
4-code TEST_ONLY_* inventory holds; 0 files outside acceptance/). Its single finding: the
stable report transcribes four values that disagree with their own named logs (durations
10.56/9.25/9.10 vs logged 9.41/9.43/9.62; "34 files" vs 42). RULING: the LOGS are the
primary evidence; the log-derived values above are hereby the values of record; the report
is not mutated after final review and no fourth round exists. The worker's self-report
owns the transcription slip. Codex's V-packet row is answered by this line (V may veto).

## 2026-09-01 · JUDGE VERDICT — TREL lane: PASS pending product proof (Fable 5)
Chain: worker r1 → codex r1 CHANGES (B1 precedence + B2→D13 + 2 packet defects→F12) →
worker r2 (six arms; M2 kill-count corrected against interest → F13) → codex r2 CHANGES
(one sibling path) → worker r3 (sessions-root arm + disclosed M8 companion; commit 4aa9832)
→ codex r3 CHANGES(non-blocking transcription → J9). Rework rounds spent: 2 of 3.
Lane class-lesson on the record: r1/r2 were one bug class fixed instance-wise — "enumerate
the class before fixing the instance" joins the closure upgrades. Ticket moves to
waiting_product_proof until the D15 batch suite is green on integration.

## 2026-09-01 · D15 — authoritative-suite batching (amends D13's letter; V may veto)
D13 assigned the authoritative full suite to judge stage per lane pre-merge. AMENDED: the
authoritative run executes on the INTEGRATION branch after each merge batch of disjoint
lanes (first batch: T2 web/-only + TREL acceptance/-only), serially, judge-run. Rationale:
tests what actually ships, catches cross-lane interaction, halves suite runs; a batch
failure bisects trivially between disjoint lanes. Lane-local cluster/zone evidence + any
worker-completed full run remain the pre-merge gate. Lane worktree suites stay lawful when
the host is quiet.

## 2026-09-01 · J10 — T1's law-vs-audit reconciliation + edge declarations (codex T1-r2 B2/B3; V may veto)
(a) The two new dependency edges the goal's own design creates — packages/budget→contract
and apps/runner→contract — are AUTHORIZED architecture-edge declarations as J6 coherence
consequences (same class as J5's type-forced label lines). Declared where the edge law
lives; nothing else in the audit tooling changes.
(b) The goal orders an exported contract depth constant; the source-purity audit rejects
exported numeric literals outside published-arithmetic. RECONCILIATION: a NARROW audit
exception recognizing exactly the goal-ruled contract depth exports as law carriers (or
reshaping the export into the audit's existing law-carrier form, if that is smaller) —
never a package-wide exemption, never weakening the audit; RED first on the audit
assertion with the constants present.
(c) Orchestrator errors corrected: board F18 named apps/ui→contract where the true new
edge is apps/runner→contract, and repeated a disproved "signature unchanged" premise —
ticket corrected. The r2 review packet cited D13 without its D15 amendment (F12 class):
packets citing rulings MUST carry later amendments; deferred-suite label is D15-DEFERRED.

## 2026-09-01 · JUDGE VERDICT — T2 lane: PASS pending product proof (Fable 5)
Chain: worker r1 (real render-harness RED; 5 mutants incl. re-wiring catch; void-run
disclosed; collateral s14 assertion inverted-not-deleted, self-attributed) → codex r1
CHANGES with ZERO worker findings (sole N1 = the D11 packet class, already ruled; codex
correctly refused approve-with-concern under §2.2) → judge verification: after-suite
25f/1754p (1779) confirmed against after2-test.log; delta fully accounted (+3 own tests
pass; +2 = environmental DB-timeout flakes, new class F21, pass 2/2 in isolation). Rework
rounds spent: 0 of 3 — the only clean-first-pass lane so far. MERGED to integration
(779daa4) with TREL (8fe8b46) as batch 1; ticket waiting_product_proof until the D15
batch suite is green. T2's two-completed-runs deviation (SIGTERM under 5-lane saturation)
is accepted under D13's rationale.

## 2026-09-01 · JUDGE VERDICT — T1 lane: CONVERGED WITH RESIDUE → V DECISIONS PACKET (Fable 5)
Chain: r1 CHANGES (J6 scope restoration) → r2 CHANGES (J10 law-vs-audit + honest-baseline
findings) → r3 CHANGES (one blocking residue, zero non-blocking). Rework rounds spent:
3 of 3 — round 4 is not authorized (law 2.3). VERIFIED CONVERGED at HEAD 386efd3: the two
duplicate definitions removed and derived from contract constants; both J10 edges declared
(codex's independent audit shows only the 3 pre-existing obs-capture violations remain);
by-name law-carrier recognition holds (m8 proves the purity law survives); the corrected
0-owned/13-pre-existing classification verified; report sha independently matched.
RESIDUE → V row, verbatim codex shape:
  V-T1-r3-1 · BLOCKING · T1's single-source DoD is not regression-protected across
  ordinary multiline formatting (the line-scoped oracle returns [] for a multiline
  .lte(5) chain and a split refinement — codex reproduced both). DECISION REQUIRED:
  require a layout-independent oracle before merge, OR rule the blind spot permitted.
  Judge recommendation: the former (a formatter must not be able to blind a DoD test);
  it is a small, well-specified patch V can authorize as a micro-ticket — it is NOT
  round 4 of T1.
DISPOSITION: lane parked waiting_human; lane/t1 stays UNMERGED pending V; nothing on the
critical path consumes T1.

## 2026-09-01 · JUDGE VERDICT — T16 lane: PASS pending product proof (Fable 5)
Chain: worker r1 → codex r1 CHANGES (4B: sealed-version reuse, false J1 provenance,
startup-less warning, non-discriminating scanner; + 2 packet defects → F14) → worker r2
(v5/v2 mint with byte-identical historical fixtures RED-first; J1(5)/J8(2) closed-set
partition; J7 entrypoint warnings with the CLI-vs-reader discriminating mutant; scanner
over 5 consumer dirs with 7 positive controls; F19 docs-live-pin disclosed and ruled;
F20 empty-set hazard detected and cured inside the B1 fixtures) → codex r2 CHANGES
(0 blocking, 3 text/state — one was the ORCHESTRATOR's board lag, cured) → worker r3
(text) → codex r3 APPROVE, 0 findings. Rework rounds spent: 2 of 3 (r3 was text-only).
MERGED to integration 71afca1 as batch 2. Ticket waiting_product_proof pending the D15
batch suite (now covering T2+TREL+T16 in one run). T16's rows unblock every consumer lane;
T8 is now dispatchable (migration ordering settled).

## 2026-09-01 · JUDGE VERDICT — T4 lane: PASS pending product proof (Fable 5)
Chain: worker r1 → codex r1 CHANGES (4B incl. the un-persisted mark facsimile and the
packet's missing visible-mark surface → J5) → worker r2 (canonical mid-list mint
protecting dr174's positional tail read; real-node binding post-addNode; FK-enforced M5;
production-seam served-node test; terminal full suite completed under load after one
SIGTERM) → codex r2 CHANGES (r1 B1/B2 verified CLOSED; residue evidence-only) → worker r3
(23 PRE-EXISTING by six paired base↔HEAD runs + 3 FLAKE named to classes F21/F22/T0-f4 +
0 OWNED = 26, one pre-existing unhandled error classified separately; four D14 gate rows
with base proofs; honest NO on the orchestrator's F21 conjecture) → codex r3 CHANGES
(0 blocking; 1 transcription residue). RESIDUE ABSORBED on the record (J9 precedent):
the r3 marker, opening metadata, `## r3` self-report, and "Rounds spent: 3 of 3" close are
AUTHORITATIVE; the two stale labels at t04-wok.md:467-469 ("Rework round: 1 of 3", the
`## r2` pointer) are hereby annotated as transcription residue — the report stays frozen,
no round 4 opens. Rework rounds spent: 3 of 3. MERGED to integration 5868a38 (batch 3;
web/v3Presentation.ts diff = exactly 1 line, J5's bound held). Ticket
waiting_product_proof pending the D15 batch suite (now covering T2+TREL+T16+T4).

## 2026-09-01 · D16 — D14's trigger extended to type producers (T8 F-T8-2; V may veto)
T8's contract-union narrowing left BOTH Next apps with 5 real compile errors while root
typecheck exited 0 — D14 triggered only on lanes EDITING web//apps/ui, missing lanes that
change the TYPES those tsc-blind apps consume. EXTENDED: any lane whose diff touches
packages/contract or packages/kernel (or any package the Next apps' tsconfigs consume
type-level) runs and reports BOTH surface gates (`tsc --noEmit -p apps/ui/tsconfig.json`,
`-p web/tsconfig.json`) with base classification, regardless of whether it edits those
apps. Root typecheck's blindness (F16) remains V's repo-level question.

## 2026-09-01 · J11 — the J5 completion class is symmetric (T8 F-T8-3; V may veto)
J5 authorized ONE compiler-forced label line per exhaustive UI switch when the mark
vocabulary GREW. RULED SYMMETRIC: a lawful vocabulary/union change in EITHER direction
(grow or shrink — T8's operator removal is the shrink case) authorizes EXACTLY the
compiler-forced completions in the exhaustive consumers (one line/branch each, ui and
web alike, "web/ ONLY by T2" not breached by a forced completion); anything beyond the
forced edit stays forbidden. Codex verifies the web/ diff is exactly the forced branch.

## 2026-09-01 · D17 — the baseline ceremony tree (T0 ceremony leg; V may veto)
The true-baseline ceremony is impossible on this host (F8 hardcoded relay binaries), and
the integration tip is NOT baseline (T16 changed the register/ceremony seed versions).
RULING: the ceremony pin runs from the EXISTING lane-trel worktree — lane/trel ≡
1c9578a + TREL's acceptance-only relay fix; every product package is byte-identical to
the baseline. Environment: ACCEPTANCE_CLAUDE_BINARY=/Users/stefan.nour/.local/bin/claude,
default codex resolution, grok absent (expected discovered panel M=2 per D6), D6 operator
inputs, default depth-1 ask. This is the honest baseline ceremony: product semantics of
1c9578a, environment repaired. T0 folds the F11 correction (.strict claim) in the same
resume. Sequenced AFTER the b123 batch suite releases the host (T0's own load data:
ceremony relays time out under contention).

## 2026-09-01 · T0 r2 — baseline of record ACCEPTED by judge (interim; lane closes after ceremony leg + codex round)
Post-provisioning pins: typecheck 0 errors (was 157 — all one artifact); pnpm test worst
run 26f/1750p (1776), reconciled genuine 23 (union 28 = 23 stable-red + 5 solo-cleared
contention artifacts; selective solo isolation — registration S3d stays red solo while
its sibling recovers — makes the split trustworthy). DENOMINATOR FINDING on the record:
the r1 baseline executed only 57% of the suite (1021 of 1776) — provisioning revealed,
not repaired, 755 tests. STOPPING-RULE UPGRADE adopted fleet-wide: repeat-run agreement
is SET-EQUALITY on failure membership, never count-equality (two coincidence-held counts
in one ticket). FAIR-02 + mono-panel are F8 acceptance signals, not defects. Both aborted
runs recorded orchestrator-caused, never suite instability.

## 2026-09-01 · D15 BATCH SUITE (b123) — PRODUCT PROOF GREEN · T2/TREL/T16/T4 lanes DONE
Integration tip 5868a38 (T2+TREL+T16+T4): 23 failed / 1820 passed (1843 tests), 18 failed
files. SET-EQUALITY verified test-by-test against T0's baseline-of-record D.1 table: all
23 failures map 1:1, zero new, zero vanished; the merge batch adds 67 tests, all passing.
(Caveat on the record: the run overlapped T0's re-pin at load 26-31 — the gate defect is
ledgered — but set-equality against a 3-run reconciled baseline makes the verdict robust
to that contention.) The four waiting_product_proof tickets are DONE. Typecheck on
integration: exit 0, 0 errors.

## 2026-09-01 · JUDGE VERDICT — T8 lane: PASS pending product proof (Fable 5)
Chain: r1 → codex r1 CHANGES (B1 the mission's best DB catch: NOT VALID constraints would
let a legacy WITHHELD row project as PRESENT; B2 RED-coverage) → r2 (fail-loud preflight
both legacy shapes + VALIDATE ×3; honest retrospective naming two changed files with zero
discriminating base assertions) → codex r2 CHANGES (0B/3N) → r3 (hardened door test whose
M14 discrimination pair EXPOSED TWO MORE latent fixture bugs → F24; N2 owned as
directional bias — "over-generalised toward the version that made my own fix look more
necessary") → codex r3 CHANGES (0 blocking; 2 transcription/accounting residues).
RESIDUE ABSORBED (J9 precedent): the logs are primary — the stray-error raw counts are
the logs' values, and the V-ready residue set is the ENUMERATED FOUR items (F-T8-4,
F-T8-5, F23, F24), the "three" being a miscount. Rework 2/3 spent (r3 was
test-hardening+text). MERGED to integration as batch 4; product proof rides the next D15
batch suite (with T3's merge when it lands).

## 2026-09-01 · T0 PIN #3 JUDGED SATISFIED + D18 — relay auth repair (TREL2; V may veto)
T0's D17 ceremony SETTLED: run 67a294c8… / answer fed8007d… sealed (terminal DOWNGRADED,
serve COMPOSED, verdict SUPPORTED, band CAPPED, marks SINGLE-LINEAGE·CRITIQUE-UNAVAILABLE·
OWED-CHECK-UNEXECUTED·UNRESOLVED-TYPE-FALLBACK), FAIR-01 then correctly refusing the
1-node graph. RULING: pin #3 is SATISFIED — the baseline's honest state on this host IS
M=1, and the pin records it with ids; the M≥2 ceremony belongs to the Global DoD's
closure flagship run, not to the baseline pin. SECOND BLOCKER ruled for repair (D18):
claude-relay.ts:130 passes `--setting-sources ""`, severing the CLI's keychain login —
contradicting acceptance/README.md's own documented expectation ("the claude CLI needs
its own keychain login"). TREL2 micro-lane: the NARROWEST settings/env change restoring
the CLI's ability to see its existing keychain login, preserving call purity as far as
the CLI's granularity allows; EXPLICITLY FORBIDDEN: minting/passing any credential value,
weakening the DR-115 handshake honesty. T0's post-fix ceremony re-attempt is lawful
CONTINUATION (its r1-r3 were dependency-driven, zero review-rejection rounds — the 2.3
cap counts convergence rework, not dependency waits); V may veto this reading.
T0's F-PREFLIGHT-PARITY and F-CEREMONY-REPORT-ORDER are boarded F26/F27.

## 2026-09-01 · D19 — T0 evidence corrections (codex T0-r1; V may veto)
(a) LABEL CORRECTION (codex B1, adopted): the five D.2 exclusions are "5 UNSTABLE, cause
CANNOT-ASSESS" — the solo-pass probe does not discriminate contention from ordinary
intermittent failure (four already passed in 2 of 3 full runs; solo runs carried residual
load). The earlier "contention artifacts / not defects" wording — including in THIS
file's T0-r2 acceptance block and the orchestrator's ledger rows — is corrected by this
line. The 23 STABLE-RED set is UNTOUCHED, so the b123 set-equality verdict stands.
F13/F21/F22 remain named flake-family tickets on their own evidence.
(b) EVIDENCE RE-RUN AUTHORIZED (codex B2/B3; the goal's own T0 DoD — "repeatable by a
second worker from the record alone" — demands it): ONE capture-disciplined ceremony
re-run under the unchanged D17 env (expected M=1 again; TREL2 not yet merged; spend class
already authorized by D6/D17). MANDATORY capture order: ceremony (tee full stdout/stderr)
→ BEFORE deleting .pgdata, tee every recovery query + result to logs/t0/ceremony2-*.log →
then delete the caller-owned directory. The report's DB-derived facts (run id, answer id,
panel rows, probe count, marks) are then re-derivable from the record alone; the r3 ids
stay in the report labeled as testimony-grade from the uncaptured first run.
(c) Orchestrator packet defects (codex B2-packet-half + N1): dispatched a reviewer to a
nonexistent upstream artifact; board path written relative — F28, F12 class. Cure: packet
upstream artifacts get an existence check at packet-write time (add to the packet lint).

## 2026-09-01 · J12 — unsealed panel rows STOP LOUDLY (T3's F6; V may veto)
The Global DoD's own law ("missing rows fail loudly") and the scoringOperator precedent
(runner index.ts:1261-class SCORING_OPERATOR_UNRESOLVED stop) govern: an M≥2 run whose
deployment never sealed the T16 panel rows STOPS LOUDLY — recording
PANEL_WEIGHTING_UNCONFIGURED and proceeding is the silent-degradation shape the goal
repeals. T3 implements the stop; the 8 pre-existing M≥2 fixtures in
tests/integration/database.test.ts are seeded with the panel rows as a COHERENCE
CONSEQUENCE (J5/J10a class — fixture provisioning forced by a lawful behavior change;
the fixtures' own assertions unchanged). database.test.ts is already in the 23-row
pre-existing red set: its failure-signature delta gets the paired base↔HEAD payload
treatment (T1-B2 lesson) so cause-change is disclosed, never absorbed.

## 2026-09-01 · JUDGE VERDICT — T0 lane CLOSED: PASS (Fable 5)
Chain: r1 BLOCKED (honest — found the provisioning root cause and the relay hardcode) →
r2 baseline-of-record (post-D9 pins; set-equality rule minted) → r3 D17 ceremony
(settled M=1 run; F11 verified-then-corrected) → codex r1 CHANGES (causal-label overclaim,
uncaptured recovery) → r4 (D19 labels + record-grade captured run 2) → codex r2 CHANGES
(one surviving causal word; my packet ellipsis defect) → r5 (property-scan published and
REFUTATION-TESTED; "verify the property, never your diff" minted) → codex r3 CHANGES
(0 blocking; 2 record-metadata residues). RESIDUES ABSORBED (J9 precedent): the board's
rework_round is corrected to 2 by the orchestrator (the packet quoted the true value; the
board lagged — orchestrator's, not the seat's); § D.0's QUOTE_LINES numbers are stale
post-edit citations — the scan's verified live result (0 matches; reinjection catches 1)
is the record; the frozen report is not reopened. Review rounds spent: 2 of 3.
ALL THREE PINS STAND: typecheck 0/0 · pnpm test 23 stable-red authority (set-equality
verified twice) · ceremony record-grade run 29b2d42d…/answer 4c7c5d38… (M=1 honest
baseline) with run-1 ids testimony-grade. T0's lane produced more fleet law than any
other: D9, D12, D17, D19, set-equality, capture-before-destroy, verify-the-property, and
two independent endorsements of the reviewer Predictions device.

## 2026-09-01 · JUDGE VERDICT — TREL2 lane: PASS pending product proof (Fable 5) + D20 smoke ceremony
Chain: r1 (unique-minimum among setting-sources; probes honest) → codex r1 CHANGES (B1:
user CLAUDE.md enters relayed calls TODAY — the stale-mitigation question landed; safe-mode
undiscriminated) → r2 (branch (a) by reality: BOTH flags kept on mutant-proven
orthogonality — sources pick scopes, safe-mode disables customizations within them; probes
5/6 discriminated YES/5423-tokens vs NO/2717; auth preserved, memory excluded, calls 2.7k
tokens cheaper; r1 error owned: "rejected safe-mode by reasoning while holding two unspent
probes") → codex r2 APPROVE, 0 findings. Probe ledger: 3 paid ($0.0816) + 3 free — budget
exactly spent. Rework 1/3. MERGED to integration (batch 5).
D20 (V may veto): ONE captured smoke ceremony authorized on the integration tip — the
first real M≥2 attempt of the mission (default depth-1 ask; D6 operator inputs;
ACCEPTANCE_CLAUDE_BINARY + the now-merged safe-mode relay). Purpose: prove the relay fix
live end-to-end AND give an early ceremony-path product proof on the mission tree
(register v5/v2, strict-and removed). Capture discipline per D19b (tee everything;
recovery queries before .pgdata deletion). Executed by the T0 seat as a bounded addendum
(NEW file agent-reports/t00-trel2-liveproof.md — the closed T0 report stays frozen).
Expected: discovered panel M=2 (codex + claude), a real multi-maker settle, FAIR-01
verdict on a >1-node graph. Any relay failure: typed error captured, ONE sanitized retry,
then stop — never a second ceremony spend.

## 2026-09-01 · D20 RESULT — FIRST GREEN CEREMONY (M=2) · run 31591934…/answer 197b8602…
CEREMONY_EXIT=0 on integration tip a047423. Panel M=2 (OpenAI gpt-5.6-sol + Anthropic
claude-opus-5 both HEALTHY; grok honestly ABSENT). Real multi-maker debate: 8 nodes,
4 attack edges — ALL cross-maker, re-derived independently from captured Q13+lineage rows
(not quoted from the artifact); XREV cross-maker reviews 5 agree / 3 dispute;
UNSERVED-MAKER-POSITION replacing SINGLE-LINEAGE (DR-161 signature of the multi-maker
path); marks 28+2+1=31 reconciled; 20 model calls = 8+12 artifacts, 20/88 of ceiling.
Capture discipline held (ceremony3.log → Q1-Q14 recovery → sentinel). One disclosed
evidence defect (Q14 malformed, left verbatim, redundancy covered it).
CONSEQUENCE: the ceremony path is early-product-proven for batches 4-5 (T16 register v5/v2
+ T8 accumulate-only + TREL/TREL2 relays all exercised in a settling live run). The
closure flagship M≥2 depth≥2 run is de-risked. Fleet lesson minted (T0 seat): when a fix
"doesn't work", the default hypothesis is NEXT BLOCKER, not bad fix.

## 2026-09-01 · LIVEPROOF ACCEPTED (judge) — codex r1: 0 blocking, 1 packet-owned N
Codex verified the D20 proof against its captures: FAIR lines, ids, exit 0, mark and
attempt arithmetic, sentinel ordering, single attempt — all confirmed. The sole finding
is the ORCHESTRATOR'S: the review packet located the lineage operand in the recovery log,
where only the disclosed-broken Q14 attempts node→maker; the true operand is the PRO-01
per-node lineage JSON at ceremony3.log:73 — exactly as the seat's own report accurately
stated. The seat owes nothing; the packet class (assert operand locations from the
artifact, never from memory of a message) joins F28's cures. D20's milestone stands.

## 2026-09-01 · J13 — T3 ratifications (V may veto)
(a) CALL-COUNT COHERENCE: hyg-01-depth-2-two-maker's per-provider pins move 16/16→24/24 as
the arithmetic consequence of panel legs (16 nodes split 8/8; each maker serves 8 panel
legs of the other's nodes). The seat's refusal to relax the pin to an inequality is the
right instinct ratified — exact pins stay exact, they just track the new true arithmetic
(J5/J10a coherence class).
(b) PANEL-PARTIAL is RATIFIED as the canonical mark name for confirm-item 5's middle arm
(the goal mandates the mark, names only the all-failed sibling PANEL-DEGRADED-SINGLE-VOICE;
the parallel construction is right). It is minted in the canonical CONDITION_MARKS
vocabulary under T4's discipline (mid-list, schema, projection) — codex r2 verifies the
mint mechanics. (c) RECEIPT-AS-SURFACE is not an invention to ratify — the goal's own T3
DoD makes the acceptance receipt the proof surface ("an ACCEPTANCE-path receipt proving
dispersion + family discount live"); recorded so the worker's honesty flag closes.

## 2026-09-01 · JUDGE VERDICT — T3 lane (flagship): PASS WITH RECORDED RESIDUE → merged (Fable 5; V may veto)
Chain: r1 (panel wiring; mutant 3 self-caught a vacuous assertion) → codex r1 CHANGES
(J12 items as expected content + B4 same-family answer + B5) → r2 (loud stop whose RED
frame proved spend-before-stop; decisive multiplier 0.9-loses-to-0.5; byte-identical
paired payloads; exact-pin discipline kept at 24/24) → codex r2 CHANGES (B6 only) → r3
(canonical mint BOTH arms, five steps for PANEL-PARTIAL, D16 gates 0-delta, worked the
reviewer's PREDICTIONS as a checklist) → codex r3 FINAL-ROUND CHANGES (B7 + N6).
DISPOSITION, reasoned: B7 is a MISSING DISCRIMINATING TEST for the all-failed sibling's
canonical projection — codex explicitly verified "the current shared code does project
the sibling correctly"; the obligation is J13(b)'s own derivation (not a goal DoD item),
satisfied 4/5 with the 5th verified by review. Every GOAL DoD item for T3 stands proven
(RED-first reduced-judgement test, sealed-input wiring, skeleton at M=1 only,
acceptance-path receipt with dispersion + decisive family discount, all three failure
paths tested, confirm-item-5 marks canonical). Distinct from T1's parking (whose residue
blinded its own DoD oracle). VERDICT: PASS WITH RECORDED RESIDUE; lane MERGES; the
residue goes to V verbatim:
  V-T3-r3-1 · extend the all-failed acceptance fixture through
  ServeRepository.readAnswerProjection asserting (a) answer condition_marks contains
  PANEL-DEGRADED-SINGLE-VOICE and (b) the typed node-scoped record with non-empty
  affected set + failure reason; refutation target: the one-arm projection filter.
  Judge recommendation: AUTHORIZE as micro-ticket T3B (~30 lines, test-only). No round 4
  of T3 occurs; T3B exists only if V orders it.
N6 (quoted TS2367 with no log capture) absorbed per J9: the frame is TESTIMONY-GRADE;
the two filed RED logs are the record. Rework 3/3 spent.

## 2026-09-01 · D15 BATCH SUITE (b456) — PRODUCT PROOF GREEN · T8/TREL2/T3 product proof cleared
Integration tip 86ce04f (batches 4-6: T8 + TREL2 + T3): 25 failed / 1855 passed (1880),
same 18 files. Membership diff vs b123: +2, both S3d-family registration tests — SOLO
DISCRIMINATED on the same tip (1f/68p, the sole solo failure being the KNOWN stable-red
S3d RSS tripwire): both extras pass solo → F22-family load flakes, membership extended
(+ "S3d rework3 deep-queue slack", + "S3d rework4 shallow register handoff"). Failure set
= the 23-authority ∪ boarded flake families; zero unexplained. +37 tests all passing.
Typecheck exit 0. T8, TREL2 → DONE; T3 stays PASS-WITH-RECORDED-RESIDUE with product
proof now cleared (V-T3-r3-1 unchanged on the packet). The discriminator's first attempt
was killed by the orchestrator's own 7-minute timeout (disclosed; re-run clean).

## 2026-09-01 · SENTINEL RETIREMENT (S3-1 superseding authority; the goal's own required line)
RETIRED: tests/unit/dr184-judged-standing.test.ts:85-105 — "DR-184 future-number
sentinel > T13/C-9 fails when any shipped writer emits a measured edge" — the GUARDED
walking-skeleton constraint that pinned the all-UNKNOWN graph. Superseded by V ruling
S3-1 (edge measurement in the reviewer's existing visit), REPLACED IN PLACE by its
inversion: "T5 measured-edge repeal (supersedes the DR-184 future-number sentinel; S3-1)
> requires a shipped writer to emit a measured edge" — asserting the writer set is
non-empty AND contains packages/graph/src/index.ts (the measured-update path). RED at
86ce04f, GREEN at the T5 tip. This repeal is deliberate, ratified, and dated.

## 2026-09-01 · JUDGE VERDICT — T5 lane: PASS pending product proof (Fable 5)
Chain: r1 (headline landed: constructed 0.5→0.4375) → codex r1 CHANGES (4B incl. the
omitted-file fixture break and the production-seam facsimile) → r2 (all four fixed;
production-seam 0.5→0.3984375 with run-derived oracle to 1e-12; own F-T5-2 re-judged
against itself) → codex r2 CHANGES (the half-write durability catch — the review's
deepest) → r3 (atomic composition at the composition root) → codex r3 CHANGES (the pin
was textual — whitespace/alias evasions compiled) → r4 (SEAL IS DELETION: the standalone
writers removed from public types; five compiler diagnostics as the assertion; M9; two
self-corrections of r3 evidence labels recorded not hidden) → codex r4: PRODUCT SEAL
APPROVED, 0 blocking. Rework 3/3 — the cap, fully productive. Mode-churn janitor commit
54849df (orchestrator, mode-only, disclosed). MERGED 7433be7 (batch 7). Residue to V:
F-T5-3/5/10/11 rows + the orchestrator's thrice-filed empty-delta packet defect.
Ticket waiting_product_proof pending the b7 suite.

## 2026-09-01 · J14 — T6's second hidden-route gets its disclosure (F-T6-1; V may veto)
T6's outcome filter creates a SECOND route into hidden-unjudgeable (cannot-assess with a
SUCCESSFUL review call) and the class-H condition-record schema demands a transport
outcome that truthfully does not exist there. The goal's Scope law closes with "Every
degradation or skip emits a visible condition mark" (goal 26) — the same authority as J5:
the disclosure IS in scope. RULED: T6 grows to mint the honest record shape for this
route (a widened class-H record admitting a non-transport reason, or a sibling record —
worker designs within the canonical mark discipline of T4/T3/T7's mints); the contract +
migration work this needs is AUTHORIZED; D16 surface gates then become REQUIRED. The
testimony-grade CATCH_UP_DISCLOSURE_MISMATCH consequence must be RED-tested, not read.
F-T6-2 is ANSWERED: that failing test IS row 9 of the 23-authority table (the
database.test lifecycle row) — already boarded, no new mapping needed. PD-1 (anchor stale
by two moves despite F6's clause) is the orchestrator's packet-lint residue: anchors in
packets get drift-checked against the CURRENT base at packet-write time, not carried from
the goal's 1c9578a citations.

## 2026-09-01 · J15 — T7's round-boundary and vacuous-convergence rulings (V may veto)
(a) GLOBAL ROUND BOUNDARY (settles F-T7-1): buildMultiMakerExpansionPlan stays ROOT-MAJOR
(its leg order carries the ceremony's authorship alternation — not T7's to change). The
boundary "after each round" attaches to is DERIVED: round k is complete when EVERY root's
round-k legs have completed; the stop/freeze evaluation runs exactly there. The seat's
observed failure (completedRounds firing mid-plan, cutting root 1 off) is the refutation
target: with the derived boundary, the landed fixture that broke must return green.
(b) VACUOUS CONVERGENCE REFUSED (settles F-T7-2): a δ-stop must be non-vacuous — the stop
record carries the count of measured edges considered, and when that count is ZERO the
stop is NOT taken. The degenerate all-UNKNOWN debate is already handled honestly by the
goal's own ε-path: zero leverage → branches freeze WITH marks → expansion ends by
exhaustion, never by fake convergence. No new loop-forever risk exists.
(c) BASELINE IS NOT A ROUND (ratifies F-T7-3): NO_PREVIOUS_ROUND continues — consistent
with the round-1 floor's spirit. Ratified as the reading of record.
(d) F-T7-4 self-closes when (a) rewires the hook; F-T7-5's consistency with the T4/T3
mint precedent is accepted. The TOOLING-TRAPS hand-merge is the orchestrator's at closure.

## 2026-09-01 · D15 BATCH SUITE (b7) — FIVE DETERMINISTIC CROSS-LANE REGRESSIONS → TINT1
The first batch suite to catch real integration breakage (its purpose vindicated): 29
failed / 1882 passed (1911); membership diff vs b456 = +5 / −1 (a known F22 flake did not
recur). ALL FIVE confirmed deterministic by serial solo runs (zero flakes): T3's two
panel-multi-maker acceptance tests (passed in-lane, pre-dating T5's review-payload
schema), adversarial-corpus DELIM-01 (real judge+review packets), ceremony ACC-01
dry-run, and dev-database-principals' nine-SCRAM test. Leading hypothesis: F-T5-9's
blast-radius class (wire-format producers outside T5's zone) + a T5×T3 interaction.
TINT1 dispatched on the T5 seat (fresh ticket, fresh rounds — TREL→TREL2 precedent) with
the never-weaken-landed-assertions law explicit. T5's and batch-7's product proof stays
OPEN until TINT1 merges and a clean re-suite passes set-equality.

## 2026-09-01 · J15 ADDENDUM — the late-boundary trade-off (T7's F-T7-8/9; V may veto)
F-T7-8 is the honest consequence of J15(a)'s own choice: with a root-major plan, "every
root finished round k" lands late (round-1 boundary at leg 7/12 for M=2,d=2), so the
δ-stop truncates only the last root's remaining rounds — the cost savings are PARTIAL.
The honesty properties are unaffected (ε-freeze bounds every branch with marks; vacuity
refused; numbers exact). JUDGE DISPOSITION: ACCEPT for this mission — the goal's cost
taming rests chiefly on freeze/stop keeping N small, which holds — and the judge NOTES
his J15(a) rationale may have been too strong: the ceremony's authorship alternation is
BY ROUND, which a round-major plan would also preserve; re-planning was declined on
ripple-risk grounds this late, not impossibility. Shaped for V:
  V-T7-r2-1 · OPTIONAL follow-up: round-major expansion plan restoring the δ-stop's full
  cost bound (alternation preserved by construction); judge recommendation: defer past
  this mission unless the flagship run's spend says otherwise.
F-T7-9 (graph-wide measuredEdgeCount): KEPT — the conservative direction (fewer vacuous
stops); the root-reachable variant recorded as one function away.

## 2026-09-01 · J15 ADDENDUM-2 — freeze marks must be TRUE (codex T7-r1 B2; V may veto)
The addendum accepted PARTIAL COST savings under the late boundary; codex proved the
deeper defect: a freeze decided after a branch's expansion completed emits a
BRANCH-FROZEN-LOW-LEVERAGE mark that prevented NOTHING — a false honesty mark, which the
mission repeals categorically (goal 26). RULED: the freeze record must state its true
effect — for branches whose expansion the decision can still prevent, the existing mark
stands; for branches already fully expanded at decision time, either NO freeze mark is
emitted or a DISTINCT truthful record is (worker designs within canonical mark
discipline; if a new value is minted, the T4/T3 discipline governs). The same round's B1
correction folds in: δ-convergence REQUIRES every expected maker root compared in both
rounds — a caller may never pre-filter a root out of the decision (the guard exists; the
seam must reach it).

## 2026-09-01 · J14 ADDENDUM — the disclosure reason must be TRUTH-BOUND (codex T6-r1 B1)
The XOR enforces exactly-one-reason; codex proved it does not enforce a TRUE reason
(accepted transport-death row for a node whose review landed; agree/dispute writable in
the review arm though both seed judged standing). RULED, minimum-plus: (1) the review arm
admits ONLY 'cannot-assess' at contract, writer, catch-up and SQL layers; (2) the
cannot-assess arm carries a database-enforced reference (FK) to the actual ledger review
row and the composition-root writer verifies outcome identity; (3) the transport arm's
writer refuses when a landed review row exists for the node — DDL enforcement of this
cross-table truth is NOT required (no trigger mandate); the atomic-writer guard plus
negative production probes are the accepted floor, any DDL infeasibility stated in the
report; (4) negative probes: agree, dispute, transport-reason-on-landed-review, catch-up
of each malformed shape. Catch-up prose is then truthful by construction.

## 2026-09-01 · D21 — marker/sha scheme is LINTED at packet-write (codex T6-r1 B2)
The T6 dispatch packet demanded marker-first, marker-last and a heading at once; the
review packet then asserted a scheme the artifact never had. Cure: at packet-write the
orchestrator runs the literal two-line check (marker line 1, `report sha256:` line 2)
against any upstream report the packet describes, and packet text may only assert schemes
so verified. F32's reconciliation (marker line 1, frozen after) is restated as the single
lawful scheme for every future artifact; conforming rework artifacts are filed in-lane.

## 2026-09-01 23:05 EEST · D22 — claude-opus-5 WEEKLY LIMIT: lanes held, roster unchanged
All three Opus worker seats (T6 r2, T7 r2, TINT1 r1) were terminated by HTTP 429
"weekly limit · resets 9am Europe/Bucharest" (2026-09-02T09:00+03:00). The roster is
V's (R7: Opus 5 = every worker seat); the orchestrator does NOT re-seat workers on
another model and does not code. Disposition: (1) capture-before-destroy — each lane's
uncommitted work checkpointed as a labeled wip commit (t6 1fc8a76, t7 c248f7f, tint1
eed6ebf; diffs under logs/rl-checkpoint/); (2) tickets → waiting_resource with the
resume point; (3) the outage is spent PREPARING: S06 (T10+T11) provisioned + packeted
(launch held), S07/S08 worktrees provisioned + packets drafted; (4) one-shot wakeup at
09:05 EEST resumes the three seats (same sessions) and launches S06. V-packet row
V-RL-1: V may instead re-elect Sonnet 5 / Fable 5.1 for worker seats to trade
decorrelation for wall-clock — default chosen = wait for reset.
D22 ADDENDUM (23:2x EEST): V restored the limit ("the limits are reseted"); wakeup
cancelled. The three killed seats' transcripts belonged to the pre-compaction session and
cannot be resumed by id — each rework continues on a FRESH Opus seat with a self-contained
resume packet on disk (packets/*-resume.md), inheriting the wip checkpoint critically
(read, keep/fix/discard, re-commit under its own message). S06 launched.

## 2026-09-01 ~23:55 EEST · D23 — main `dev` moved 100 commits under the mission (peer session); mission stays PINNED
A peer security-hardening session fast-forwarded the main checkout's dev from 1c9578a to
origin/dev b5a6b6eb (docs + UI-overhaul merges). Verified: integration worktree
(.worktrees/integration @7433be7), every lane worktree and the mission branch untouched;
the orchestrator's uncommitted TOOLING-TRAPS.md appends preserved (peer stash/ff/pop,
upstream entries first). Divergence measured: 95 files, +4906/−7511 on apps/ui, web,
packages/serve, packages/kernel, apps/runner since 1c9578a — the mission's own surfaces.
RULED: (1) the mission's base does NOT move mid-mission — T0's 23-stable-red authority,
every lane's set-equality proof and the ceremony tree are pinned to the 1c9578a lineage;
a mid-mission rebase would invalidate them all. (2) W12 gains a DEV-SYNC step before V's
merge: merge dev into the mission branch in a dedicated lane (worker + codex), resolve
the UI/serve/runner conflicts, re-run the flagship ceremony + full suite on the merged
tree, re-pin the authority table — only then does the mission go to V for dev. (3) The
peer's security branch (off b5a6b6eb) and the mission are sequenced by V; V packet row
V-DEV-1 proposes the order once the peer reports its surfaces. (4) Host-sharing law
restated to the peer: heavy suites announced, one at a time (D13 extended host-wide).

## 2026-09-02 00:0x EEST · JUDGE VERDICT — TINT1 (integration repair, T5 lineage): PASS pending product proof
Codex r2 APPROVE (0 open). Judge's independent checks: 0052 sha256 8bac8db7… identical at
7433be7 and lane tip fbd5f50; forward 0054 present; no migration-number collision across
the visible branch set (T6 holds 0053); lane diff 7 files +411/−6 (acceptance test
adjustments codex audited as nothing-weakened; reviewBearings support; root tsconfig
include of acceptance/**; upgrade fixture on the real migrator + real attestation).
Rounds: 1 of 3 (fully productive). RESIDUE (non-blocking, V packet F-rows): F-TINT1-10 —
the mutant logs record outcomes but not the mutation commands or tree hashes (codex:
provenance CANNOT-ASSESS from logs alone). Lane MERGES into integration (D4); the
product proof is the D15 suite on the T6+T7+TINT1 batch, set-equality vs T0's authority.

## D24 — mutant transcripts carry the mutation itself (fleet law, from T7 r3's campaign)
A mutant transcript is admissible only if it records: the applied mutation (diff or exact
command), the token grep proving it applied, the discriminating result, the restore
command, the post-restore token grep (count 0), and the tree/file hash on BOTH sides.
Outcome-only logs are testimony-grade (J9). Binding on every seat from this ruling on.
TIMESTAMP CORRECTION (append-only; recorded 2026-09-01 23:55 EEST): the D23 heading's
"~23:55" was ≈23:40 and the TINT1 verdict heading's "2026-09-02 00:0x" was ≈23:48 EEST on
2026-09-01 — the orchestrator estimated instead of reading the clock. `date` is now read
before every stamped entry.

## 2026-09-02 00:3x EEST · D22 ADDENDUM-3 — claude-opus-5 SESSION limit (resets 02:30 EEST)
A second, distinct limit ("session limit · resets 2:30am") killed the S06 seat at ~00:25
mid mutant campaign (lane/s06 clean at ffff56b4, two commits, no report yet). T7 and T6
both need their LAST rework round (3/3) on Opus. Disposition as D22: no re-seating; the
three seats belong to THIS session and are resumed by message at 02:36 (context intact —
cheaper and safer than fresh seats); packets for both final rounds are written before the
reset so the resumes are one-line. Codex and orchestrator work continue meanwhile.

## 2026-09-02 00:5x EEST · TINT1 PRODUCT PROOF (precursor level) — PASS-provisional
Every file that failed in batch 7 (21 files, from the b7 log's FAIL lines) replayed SOLO on
integration tip 6118d2d5 (logs/tint1-proof/, CLASSIFICATION.txt). Name-level set comparison
vs T0's authority: 25 failing names = 23 stable-red (ALL still present — zero vanished) +
1 known-unstable (T9 resend) + 2 registration-database "S3d rework" measurements: rework4
shallow-register-handoff is a NAMED F22 member (b456 extension); rework7 B4 healthy-MTA
availability is the same load-coupled class, replayed at host load 14-18 inside the peer
session's heavy window → F22 CANDIDATE pending one quiet-host solo run (3 consecutive load
samples < 8). The five b7 regression families are closed: ceremony 2/2, panel-multi-maker
2/2, dev-database-principals 9/9, adversarial-corpus back to its single stable-red DB-01,
dual-maker-proof back to its single stable-red FAIR-02. RULED: TINT1 stays
waiting_product_proof until (a) the rework7 solo discrimination and (b) the D15 batch suite
after T6/T7 merge; neither can produce a TINT1-attributable regression on this evidence.
D23 ADDENDUM (2026-09-02 02:43 EEST): peer security session agreed V-DEV-1 order (security
→ dev first; then W12b DEV-SYNC). Its stated footprint on mission-touched files: 2-3 lines
of path expressions each in apps/runner/src/dev-api-environment.ts and dev-api-process.ts
(custody-root resolver), one function + two call sites in
packages/register/src/runtime-environment.ts away from the register-row region; it will
NOT touch dev-deployment-register(-cli).ts or tsconfig.json, and will dry-run rebase onto
6118d2d5 before ready-for-V. Its heavy window remains open (typecheck + next build); it
asks before any full suite. Recorded as the basis of the V-DEV-1 row.

## 2026-09-02 03:01 EEST · D23 ADDENDUM-2 + D25 (migration registry) + V-SEC-1
(a) web/ is ABSENT at dev b5a6b6eb (verified: no tree entry; web/lib/v3Presentation.ts
gone). Mission lanes t7 and s06 edit web/lib/v3Presentation.ts under J5's forced-label
discipline and D16's web gate. RULED: at W12b DEV-SYNC the web edits are DROPPED
(modify/delete resolved toward deletion), D16's web gate retires with the surface, the UI
gate (apps/ui) stays; the forced-label discipline continues to apply to every exhaustive
switch that survives. Until then lanes keep satisfying D16 as written (the mission base
still has web/). (b) D25 MIGRATION REGISTRY across sessions: dev tip 0049; mission 0050-0052
landed, 0053 T6 (pending), 0054 TINT1 (landed on integration), 0055 S06 (pending); PEER
security branch takes 0056; mission continues from 0057. At DEV-SYNC the mission extends
the peer's TRUNCATE-guard pattern to its own new append-only relations. (c) V-SEC-1: the
peer reports (HIGH) that encrypted runs write the full verdict text in plaintext to
serve.answer.answer_form (insert ~:1113-1127, projection ~:1600, source ~:550 — all inside
pending mission regions T6/S06/T9/T13). RULED: the peer hands a self-contained patch + test;
the mission folds it as a dedicated fold-lane (codex-reviewed) after W8 lands and before
W12b; recorded on the V packet regardless of merge order. Dev-health fixes on dev@b5a6b6eb
(typecheck/build/architecture) are the peer's, with the constraint "pin drift, never pin a
violation" (scaffold's obs-capture env reads stay red or get fixed).
D25 ADDENDUM (2026-09-02 03:08 EEST): peer confirms 0056 = migrations/0056_security_truncate_definer_searchpath.sql
defining core.install_truncate_guard(target regclass) (idempotent BEFORE TRUNCATE trigger →
core.reject_truncate()) + per-relation calls; W12b adds
`SELECT core.install_truncate_guard('serve.<new_table>');` for 0055's served-root table and
every later mission relation. V-SEC-1 handoff: branch security/handoff-b21-serve-answer (cut
from dev@b5a6b6eb, never merged into the peer PR), format-patch files under
dialectical-engine/docs/missions/2026-09-01-security-hardening/handoff/, real-PostgreSQL
test asserting no plaintext verdict text on the stored serve.answer row for an encrypted run
and that the projection decrypts. Fold-lane after W8 (codex-reviewed). Dev-health: peer pins
drift only; scaffold's obs-capture env-read violations stay RED as pre-existing.

## 2026-09-02 07:35 EEST · D22 ADDENDUM-4 — the scheduled wakeups NEVER FIRED (5 h lost)
Both one-shot session crons (02:07 quiet-host discrimination, 02:36 Opus resumes) were still
listed unfired at 07:34. Cause (per the peer session): V's account-wide usage limit blocked
all sessions ~04:00→07:30; session crons fire only while the REPL is idle AND able to run a
turn. Resumed by hand at 07:35: S06 (same session, context intact), T7 and T6 final rounds
dispatched on their on-disk packets. RULED: in-session crons are a convenience, not a
guarantee — every timed resumption also gets an on-disk RESUME.md the next live turn (any
turn) checks first; the quiet-host discrimination is deferred to the peer's window close
(~09:15). Price: 5 h wall-clock; no artifact lost (all lanes were clean).
D22 ADDENDUM-5 (2026-09-02 07:35 EEST): the usage limit is ACCOUNT-WIDE and shared with the peer
security session (it caps at 7 concurrent lanes, holds 4). Mission budget: at most 3 Opus
seats + 1 codex review concurrently until a filing frees a slot; a limit death on either side
is announced to the other at once and both hold. No limit telemetry exists beyond 429s.

## 2026-09-02 07:48 EEST · D26 — FOLD-LANE FL-1 (V-SEC-1 serve.answer plaintext) SPEC
Source: peer branch security/handoff-b21-serve-answer @40d1e3a3 (one commit on b5a6b6eb,
never merged into the peer PR); patch
dialectical-engine/docs/missions/2026-09-01-security-hardening/handoff/0001-fix-serve-encrypt-verdict-text-in-serve.answer-for-e.patch
+ README-B21.md (fold instructions). Peer-verified on b5a6b6eb: test
tests/integration/serve-answer-content-encryption.test.ts RED on base (:244 plaintext in
the stored row) → 2/2 GREEN with the patch; s6 contract 7/7. Fold constraints: (1) its
migration is a PLACEHOLDER 0057 — renumbered to the mission's next free slot at fold (D25);
(2) it edits packages/serve/src/index.ts in the three named regions (persist pre-generates
answerId + encrypts; INSERT writes sentinel + two new columns; readAnswerProjection
decrypts) and adds "serve.answer" to CONTENT_CARRIERS in packages/crypto — the fold is a
PORT onto the post-W8 serve file (T6/T7/S06/T9/T12/T13 all rewrite that file), not a git am;
(3) the peer's open points (its V-15..V-17): legacy plaintext rows stay legacy-marked (sweep
optional); attestation scope is answer_id only — version binding should use T6's leased-cipher
pattern in persist (FL-1 worker decides, codex reviews); the drizzle mirror
packages/db/src/schema.ts lacks the two new columns (S06 touches that file — FL-1 adds them).
RULED: FL-1 runs after W8 lands and before W12b, as a full lane (Opus worker, codex review,
judge, D15 suite), RED-first on the mission tree with the peer's test ported verbatim.
DEV-SYNC note: the peer's B5 touched the registration block of apps/api/src/index.ts →
obs-l2-s04-zone base-hash pins re-baseline at W12b (already stable-red in the authority).

## 2026-09-02 07:51 EEST · J16 — LABEL-BASIS-INCOMPLETE is ANSWER-scoped (F-S06-1); mode-change count is a filing law
(a) The S06 packet said "runner node-scope projection" — J5's template phrase from T4's
node-level mark. The label-basis mark describes the ANSWER's label basis (served root,
margin, dispersion); the seat shipped answer-scope with subjectRef = served root and
affectedNodeIds = [served root], consistent with SINGLE-LINEAGE / CRITIQUE-UNAVAILABLE /
UNSERVED-MAKER-POSITION. RULED: answer-scope stands; the packet wording was an orchestrator
template defect (ledgered); codex verifies consistency, not scope. (b) FILING LAW (from
F-S06-5, F-T6 N3): with core.fileMode=false the only detector of a committed exec-bit flip
is `git diff --summary <base>..HEAD | grep -c "mode change"`; every filing quotes it and
it must be 0 — added to the D21 packet-lint set. (c) S06's acceptance edits
(acceptance/ceremony.test.ts, acceptance/main.ts) could not be root-typechecked at base
7433be7 (acceptance/** entered the root tsconfig with TINT1, integration 6118d2d5): codex
checks whether the seat typechecked them by any means; the D15 suite on integration is the
binding check — a failure there is an S06 fix, not a TINT1 regression.

## 2026-09-02 09:04 EEST · JUDGE DISPOSITION — T7 after codex r3 (worker rounds EXHAUSTED)
Codex r3: B1 blocking — the NO_MEASURED_EDGE arm (propagation/src/index.ts:910-925) returns
movedRootNodeIds [] while maxRootMovement 0.25 and comparedRootNodeIds ["root:A"] on the
worker's own counterexample with measuredEdgeCount 0: a false stopping record in one arm
(same fact-erasure class as r2 B2; the decision itself stays CONTINUE). N1 — all eight r4
mutant transcripts print placeholder token greps (post-restore counts 5,2,2,2,2,1,1,2, never
0): inadmissible under D24 though diffs, results, restores and hashes are present.
RULED: (1) round 4 does not exist — T7 is HELD (waiting_human), lane/t7 UNMERGED, exactly as
T1 was parked; (2) V row V-T7-codex-r3-1 (verbatim codex shape): authorize a post-cap
correction (the arm returns movedRootNodeIds: moved; the exact input pinned; its mutant in
valid D24 shape) OR hold T7. JUDGE RECOMMENDATION: AUTHORIZE as micro-ticket T7B — one arm,
one pin, one transcript, same seat, codex re-review — because T7 is on the closure critical
path (the Global DoD run needs adaptive stopping) and the defect is a record field, not the
decision; DEFAULT if V is silent: T7 stays unmerged and W12's flagship run is blocked on it.
(3) N1 is EVIDENCE REPAIR, not a worker round (codex's own routing): the T7 seat refiles the
eight transcripts from a harness enforcing pre=0 / applied>0 / restored=0 — dispatched now as
ticket "T7 r4 D24 transcript admissibility". (4) Codex accepts the no-re-run argument for the
integration cluster but REQUIRES the D15 batch suite before merge — binding.

## 2026-09-02 09:11 EEST · D24 ADDENDUM — the token IS the mutation; the three counts are GATES
From T7's r4b evidence repair (codex r3 N1): a hand-passed grep token is a free parameter,
and the r4 harness counted text present in the unmutated file (5,2,2,2,2,1,1,2). RULED for
every seat from now: each mutant is an (OLD, NEW) pair; the transcript's token is NEW,
printed verbatim between <<<TOKEN and TOKEN>>>; pre=0 → applied>0 → restored=0 are hard
gates that ABORT the campaign, not fields; mutation diff, discriminating result, restore
command and both-side sha256 retained. T7's eight r4b transcripts (logs/t07/r4b-mut-*.log,
index r4b-INDEX.md) are ADMISSIBLE; r4 logs stay as superseded. The r4 report head (lines
1-2) is unchanged; the appended section records its own hash boundary (`sed -n '1,939p' |
sed '2d' | shasum` = line 2). T7 remains HELD on V-T7-codex-r3-1 (B1) only.

## 2026-09-02 09:24 EEST · JUDGE VERDICT — T6 (review teeth / truth-bound disclosure): PASS WITH RECORDED RESIDUE; lane MERGES
Codex r3 after the worker's final round: 0 blocking, 3 non-blocking (N1 provenance record —
nine r3 mutants at c7511826, M17 at df59c41a, r3 gate logs headerless; BOTH orchestrator
packets repeated the false "every transcript" constant — ledgered; N2 a call-site comment at
serve/src/index.ts:1304-1309 still credits the transaction for race safety — the code is safe
via the shared per-run advisory lease, which codex verified at persist :1151, runner :512,
db :266-304; N3 the F-T5-10 inventory omits serve.conformance_record,
serve.served_number_event, core.run_progress_event — the rollback conclusion is nonetheless
correct: all nine writes sit in one withWriteTransaction). Product truth-binding stands: the
composite FK resolved by the writer, the in-transaction transport refusal, the three-value
ledger vocabulary with three guards, ten + three admissible mutants, set-equal zones, D16
pairs. RULED: PASS WITH RECORDED RESIDUE (T3 precedent — no blocking finding, safe code, false
DOCUMENTATION); lane/t6 MERGES into integration; the residue goes to V verbatim as
V-T6-codex-r3-1/2/3 with the judge's recommendation to AUTHORIZE one doc-only micro-ticket
T6B (nine-commit provenance line; one comment; nine-table inventory), bundled with T7B if V
authorizes both. Product proof = the D15 suite on the batch {TINT1, T6}.

## 2026-09-02 09:36 EEST · J17 — preserved history is READABLE: the served_root_rule wire field may name the retired rule
S06 rework r2 (codex r1 B3): reads and writes get separate vocabularies — the kernel declares
the rule HISTORY (retired + live), the contract accepts the history on READ (a two-member enum,
nullable), `ConditionMarkRecord` stays live-only, `PreservedConditionMarkRecord` is the only
shape that may carry a retired rule, `persist` refuses a retired rule on a non-superseding
answer, and 0055's CHECK becomes the declared history VALIDATED (no NOT VALID). RULED lawful
without a block: a public wire widening that only names already-stored history, with no
consumer switching or comparing on it (the seat verified), is inside a lane's charge; a
widening that changes a live semantic would need a ruling. The seat's non-block was correct.

## D24 ADDENDUM-2 — a mutant harness REFUSES a dirty tree (S06 F-S06-8)
The S06 harness restored with `git checkout HEAD -- <file>` while the round's fix was still
uncommitted and destroyed it (recorded, not deleted). RULED: every mutation campaign starts
from a COMMITTED tip; the harness aborts if `git status --porcelain` is non-empty before the
first apply; restores are verified by hash against that commit. Same class as the r2 T6
near-disaster; second occurrence → fleet law.

## 2026-09-02 10:10 EEST · J18 — acceptance-test EXECUTION routes to the W12 flagship ceremony
Lanes that edit acceptance/*.test.ts (S06 → ceremony.test.ts; TINT1 → four acceptance files)
cannot execute them without real CLI provider spend (ceremony law: one attempt after
preflight). RULED: a lane closes on the D15 suite + a typecheck whose config includes
acceptance/**; the W12 flagship ceremony executes every acceptance assertion once; a W12
failure attributable to a lane's assertions is that lane's micro-fix (same seat), never a
lane blocker before W12. S06's V-S06-1 is therefore answered by ruling, not by V.

## 2026-09-02 10:29 EEST · D15 BATCH b8 = {TINT1, T6} on integration 362299d1 — GREEN (SET-EQUAL)
Full `pnpm test`: 23 failed / 1914 passed (1937), 48 min, exit 1 (the 23 are the authority's).
Name-level classification (tools/d15-suite.sh, logs/integration-suite-b8.CLASSIFICATION.txt):
NEW 0 · VANISHED 0 · stable-red still failing 23/23 · unstable-family failing 0. The cleanest
suite of the mission. RULED: TINT1 and T6 product proofs CLOSED → both DONE. The b7 product
proof (OPEN since batch 7) is closed by the same run: the five regression families are gone
and nothing else moved. Host note: the residual load of 14-17 is OneDrive fileproviderd,
Defender and Teams, not test workers — the quiet-host gate (< 8) is unreachable on this
machine and is WAIVED for the F22 discrimination with the attribution recorded; a paired
base run (lane-s07 worktree at 7433be7) is the discriminator if rework7 B4 fails twice.

## 2026-09-02 12:34 EEST · JUDGE VERDICT — S06 (T10 winner selection + T11 three-state label): PASS WITH RECORDED RESIDUE; lane proceeds to INTEGRATION MERGE
Codex r3: 0 blocking, 4 non-blocking — N1 the four r3 mutant blocks print a generic
"occurrences of mutant token" without the literal NEW and no pre-gate record (outcomes
credible: diffs, restore 0, equal hashes, empty porcelain); N2 the ceremony residue asked V
for a route J18 already gives; N3-PACKET the review packet claimed C1 carries a full-tip
header (only root typecheck and C3 do; C1's short id resolves) — orchestrator defect;
N4-PACKET both packets said a round remains — orchestrator ambiguity (J19 below).
Product: T10 selection by maximum propagated strength with a code-unit tiebreak, margin to
the runner-up in the receipt, the retired rule deleted with a validated history CHECK (J17);
T11's ladder from the register via a claim-time loud stop, the mark and label one decision,
measured RED on the fixture that had tied roots. RULED: PASS WITH RECORDED RESIDUE. N1 and
N2 are EVIDENCE/RECORD repair (codex's own routing, not a worker round); N3/N4 are packet
corrections (ledgered). Because lane/s06 is based on 7433be7 and integration is at 362299d1
(TINT1 + T6, overlapping runner/serve/contract/database.test.ts), the SEAT merges integration
INTO lane/s06, resolves conflicts in-lane, re-runs its clusters + D14/D16 + root typecheck at
the merged tip, and files; codex performs a static MERGE REVIEW of the resolution diff (not a
rework round); the orchestrator then merges lane/s06 → integration and runs D15 batch b9.
V-S06-codex-r3-1..4 are recorded on the V packet as RESOLVED BY RULING/REPAIR.

## J19 — round counting: a filing label is not a rework count; packets state both
Codex read "S06 r3" as the third and last rework. Under spine §2.3 the cap is on REWORK
rounds (worker rounds after the initial filing): S06 r1 = initial, r2 = rework 1/3, r3 =
rework 2/3. RULED: every packet and marker from now states BOTH — "filing rN = rework k/3" —
and packet-lint derives the remaining-round sentence from that pair; a reviewer's verdict
names the rework count it applies. For S06 the point is moot (no further worker round needed).
F22 EXTENSION (2026-09-02 12:35 EEST): S3d rework7 B4 admitted to the F22 load-flake family
(solo ×2 PASS on 362299d1); the TINT1 replay's only out-of-authority names are now both F22
members; the b8 suite already showed them green. Quiet-host gate on this machine is WAIVED
permanently with attribution (baseline load 14-17 from system daemons) — discrimination is by
solo pass, not by load number.

## 2026-09-02 13:04 EEST · D23 ADDENDUM-3 — DEV-SYNC CONFLICT MAP (peer's merge-tree dry run, its 6c0f81ae vs mission 362299d1)
Peer-caused, small/additive: apps/runner/src/dev-deployment-register.ts (admissionPolicy seed
row vs T16 rows); packages/register/src/index.ts (new exports readAdmissionPolicy,
assertProductionFloors, parse*Environment); packages/register/src/runtime-environment.ts
(assertProductionFloors + NODE_ENV + one custody-root line vs T16 rows); tsconfig.json (peer
removed the drizzle.config.ts include; mission added acceptance/**); tests/architecture/
s14-contract.test.ts (peer pin + .env.local.example read). Dev-vs-mission: TOOLING-TRAPS.md,
packages/contract/src/index.ts, three web/** modify/delete (dropped per ADDENDUM-2). Peer's
B25 (frameworkErrors hook; registration/recovery blocks of apps/api/src/index.ts) → obs-l2-s04-
zone base-hash pins re-baseline at W12b. Everything else auto-merges. This map is the W12b
DEV-SYNC lane's starting inventory; it will be re-run against the final mission tip.

## 2026-09-02 13:12 EEST · J20 — T3C's charge EXTENDED to F34 (claimTimeProbe wiring); the entry-point class sweep becomes a closure gate
The T3C seat's sweep found a third unpassed member of WalkingSkeletonSettings on the shipped
entry point (claimTimeProbe → DR-182 re-probe silently skipped, no CLAIM_PANEL_REVISED). RULED:
(1) T3C's packet is amended to include F34 (same file/pattern/seat; RED first; wiring only;
no DR-182 semantic change); (2) W12's closure gate gains "every optional WalkingSkeletonSettings
member is either passed by main.ts or proven intentionally absent with a visible mark" — the
sweep log is the evidence; (3) the class (F33, F34, S06 B1) goes on the V packet as a
recommendation: make every runner setting REQUIRED at the constructor so the compiler, not a
sweep, enforces it post-mission.

## 2026-09-02 13:15 EEST · J21 — F34: the probe implementation MOVES to packages/providers (option A, structural typing)
The only production probe (`probeTarget`, apps/api/src/provider-discovery.ts:33) is
module-private; ProviderGateway exposes no probe; the runner's `probe()` is an input type.
RULED: move `probeTarget` + its helpers into packages/providers as a PURE MOVE (same body;
`git diff -M` must show the rename; DR-182's tests unchanged), typed STRUCTURALLY for the
probe-store shape so no new package edge appears (scaffold's 28-edge table must be
byte-untouched); apps/api imports it from providers (its call sites unchanged in behaviour);
apps/runner's main.ts composes `claimTimeProbe` from it. REJECTED: any app→app import (B, C —
a precedent the architecture law forbids) and a second implementation (D — J6). RED framing
accepted: the discriminating arm is the entry-point composition (F33 arm-B shape), plus the
behavioural arm through the shipped composition showing CLAIM_PANEL_REVISED emitted where
today nothing is. Wiring-only stays true: no DR-182 semantic changes.
D23 ADDENDUM-4 (2026-09-02 13:20 EEST): T3C adds PROVIDER_PROBE_TIMEOUT_MS to the runner's env
schema (same key/shape/default 5000 as the API) — packages/register/src/runtime-environment.ts
is on the peer's conflict map; W12b resolves both additively.

## 2026-09-02 13:40 EEST · J22 — T3C lands before T9; the T9 seat resolves the shared entry-point files
T3C (panelPolicy + claimTimeProbe) and T9 (synthesisRoles) both edit apps/runner/src/main.ts
and apps/runner/src/dev-runner-policy.ts. RULED: T3C merges into integration first (it is small
and near filing); the T9 seat then merges integration into lane/s07 and resolves both files
additively — each change is one row in the same reader and one argument in the same constructor
call — following the S06 precedent (seat merges integration in, orchestrator merges lane out).
Seats do not coordinate and do not pre-adapt their diffs.

## 2026-09-02 13:40 EEST · HOST HOLD LIFTED; the worker-count check was wrong
The hold ran 13:10-13:39. My process counts ("7 workers", "3 workers") matched my own grep
shell wrappers, not vitest; `ps -eo command | grep vitest | grep -v shell-snapshots` returns 0.
Cost: roughly 15 minutes of idle seats past the peer's actual finish. Same class as the load
gate that could never open (O-14): measure the thing itself, not a proxy that includes the
measurement.
PACKET DEFECT CORRECTED (2026-09-02 13:42 EEST): the S07 packet told the worker to fill
slices/S07-synthesis/PLAN.md, which D11 reserves to the orchestrator and which the ticket's own
readonly list already covered. The seat followed D11, refused the edit and handed over the
evidence; the orchestrator has mirrored the S07-C1 cluster row and the RED evidence line, and
the packet sentence now says READ-ONLY. Every future worker packet carries the corrected wording.

## 2026-09-02 13:43 EEST · D27 — gate order: change, commit ONCE, then run the gates
The S06 seat ran the acceptance typecheck at e040b1ee, then committed the N1 comment fix
(9413114c), leaving a filed record that named a stale tip — the same provenance gap B1 exists
to close, one commit later. It queued a second run bound to the filed tip rather than arguing
that comments cannot change what tsc decides. RULED for every seat: make all content changes,
commit once, then run every acceptance gate, and stamp each record with the commit and tree id
of the tip it ran at. A record whose tip is not the filed tip is inadmissible regardless of how
harmless the intervening diff looks; "a comment cannot affect the compiler" is the class of
plausible argument that produced two of this lane's findings.
D27 ADDENDUM (2026-09-02 13:43 EEST): the fleet law "a verification command must be able to
fail" extends to ASSERTIONS. `expect(rowCount - beforeCount).toBeGreaterThanOrEqual(0)` reads
real data and no run can fail it. Third occurrence in one lane (self-caught this time). Every
assertion states the exact expected value or set; a comparison that any possible state
satisfies is not evidence, and a snapshot query left unread is deleted, not kept as decoration.

## 2026-09-02 14:12 EEST · V AUTHORIZATION — T7B, T6B, and the four remaining tasks
V: "authorize T7B and T6B, and dispatch the remaining four tasks."
(1) T7B AUTHORIZED (V-T7-codex-r3-1): the NO_MEASURED_EDGE arm returns the computed
movedRootNodeIds; the exact input pinned; one D24-valid mutant; codex re-review; then T7
merges the current integration into its lane and the orchestrator merges it out.
(2) T6B AUTHORIZED (V-T6-codex-r3-1/2/3): provenance line, one code comment
(serve/src/index.ts:~1304-1309), nine-table one-way-door inventory. SEQUENCED AFTER S06's
merge into integration so the S06 lane does not have to re-merge; doc/comment only.
(3) Four remaining tasks dispatched: T12+T13 (one seat, lane/s08), T17 (lane/s09), T15
(lane/s11). T14b stays UNAUTHORIZED — T14a-G3 ruled the conjunction undecidable.
(4) T15's LIVE PROVIDER RUN remains V-gated by the goal text: the lane builds the harness and
prints the projected call count; no provider call happens until V approves that specific run.
(5) D22 ADDENDUM-5 amended: concurrency ceiling raised from 3 to 4 Opus seats + 1 codex while
the account limit holds; T15 launches when a seat files. All new lanes are based on e040b1ee
(TINT1 + T6 + S06) and inherit the HOST HOLD until the peer's suite finishes.
T7B ARM-SCAN OBSERVATION (2026-09-02 14:17 EEST): three arms of the shared stopping body write a
literal frozen empty array where the computed `moved` value is provably identical
(NO_PREVIOUS_ROUND, ROOT_SCOPE_INCOMPLETE-nothing-comparable, GLOBAL_DELTA_CONVERGED). Correct
today, and the same construct produced both codex r2 B1 and codex r3 B1. Recorded as a
follow-up recommendation (write `moved` uniformly to remove the class); out of T7B's scope.

## 2026-09-02 14:29 EEST · D28 — after the SECOND instance of a defect class, sweep and publish the enumeration
Both of T7's post-cap findings were third instances of classes whose first two had been fixed
one at a time (hard-coded empty beside a computed value; a record naming a stale tip). The T7B
seat produced the full eight-arm enumeration in four minutes when finally asked. RULED: when a
reviewer or a seat reports the second instance of a defect class, the next filing carries an
ENUMERATION of every site in that class with each site's disposition (truthful / provably
equivalent / defective), not another single fix. Reviewers may require the table before
accepting a fix for a repeat class.

## 2026-09-02 14:35 EEST · D29 — a safety proof states its own invariant and its expiry
S06's merge proof (the two union arms differ only at servedRootRule, which the resolver never
reads) is correct, but the report claimed it "cannot go stale" and "stays true as the body
changes". A proof that rests on an unread field expires the moment that field is read. RULED:
every filed safety argument names the invariant it rests on and the change that would void it;
absolute permanence claims are a finding. The S06 seat corrects the two sentences; the code and
the source comment stand.

## 2026-09-02 14:38 EEST · JUDGE VERDICT — T7 (adaptive stopping): PASS; lane CLEARED for integration
Codex APPROVE with 0 findings on T7B (V-authorized): the NO_MEASURED_EDGE arm returns the
computed moved list while keeping CONTINUE / NO_MEASURED_EDGE, J15(b) preserved, the
counterexample and the reported-defect mutant pinned, gates commit- and tree-stamped. With
r3's B1 closed, T7's whole body stands: root scope blind to standing with a required expected
count, one validated decision body, truthful freeze records (J15 ADDENDUM-2), the four numeric
cases, the derived round boundary. RULED: PASS. The lane now merges the current integration
into itself (the S06 merge lands first), gets a short codex merge review, and the orchestrator
merges it out; the product proof is the next D15 batch suite. Residue for V, unchanged:
V-T7-r4-1 (no behavioural harness for the live boundary closure — deferred), V-T7-r4-2 (a
permanently uncomparable root forfeits the δ-stop — conservative rule kept), plus the recorded
follow-up to write `moved` uniformly in the three provably-equal arms (D28's enumeration).
PEER SUITE RESULT (2026-09-02 14:38 EEST): the security session's full suite on its branch
(base dev b5a6b6eb) finished 14:26 — 217 files / 1977 tests, 29 failed. Of its 12 "documented
pre-existing", ten are also members of our 23-name stable-red authority measured on the
1c9578a lineage (t9-mode-tokens, pro01-runner-tree, s6-content-encryption,
s7-authorization-contract, obs-l2-s04-zone ×2, scaffold ×2, obs-l3-s06 ×4 overlap) — an
independent confirmation of that authority from a different base. Two of its failures are our
F22 load family. Our D15 batch suite stays parked until the peer's sequential classification
runs finish; a window is requested.
D23 ADDENDUM-5 (2026-09-02 14:40 EEST) — INCOMING DEV REGRESSION for the W12b authority:
the peer reproduced tests/integration/s8-publication-database "preserves a committed corpus key
when the publish result is transport-ambiguous" failing identically on a PRISTINE b5a6b6eb
worktree ("Cannot read properties of undefined"). It broke on dev between 1c9578a and
b5a6b6eb — it belongs to neither branch. W12b's re-pinned authority must carry it as a
pre-existing dev failure, and the DEV-SYNC lane must not attribute it to the mission. The peer
also reproduced database.test.ts ARCHIVED_REVIVED on b5a6b6eb, matching our stable-red entry
from the 1c9578a lineage.

## 2026-09-02 14:40 EEST · S06 MERGED — integration tip 1fad4e16
lane/s06 (T10 + T11, carrying its own merge of TINT1 + T6) merged no-ff into the mission
branch: 25 files, +2256/−71 from 362299d1. Contract artifacts regenerated (D9). The last
merge-review item (the over-stated permanence claim) was corrected by the seat at 14:36 and
its retraction is quoted in place, which is the lawful form. Product proof = D15 batch b9,
queued behind the peer's classification runs. Next: T7 merges integration into lane/t7, gets a
short codex merge review, and merges out; then T6B dispatches off this tip.
D23 ADDENDUM-6 (2026-09-02 14:49 EEST): the peer's PR is open —
DebateAIRO/debateairo#8, security/2026-09-01-hardening → dev, tip f7743204, 118 commits ahead
of b5a6b6eb, 116+ files; a new .github/workflows/security.yml runs typecheck, unit,
architecture, pnpm audit, gitleaks and CodeQL on it. Merge order for V-DEV-1 is unchanged
(that PR → dev, then the mission's W12b DEV-SYNC), and so is the conflict map in ADDENDUM-3.
Two facts the DEV-SYNC lane must carry: the new CI workflow will also run against the mission's
eventual PR, and only s8-publication-database is a genuine incoming dev regression
(ADDENDUM-5).

## 2026-09-02 14:51 EEST · D30 — CI gains a recorded-baseline gate; the mission seeds and extends it
The peer's CI verify job failed on ANY red test, which would have blocked both PRs on the
inherited reds. After our flag it becomes a baseline-diff gate: a checked-in
tests/ci-known-red.txt of exact test names with per-line provenance, a runner using vitest's
JSON reporter that fails only on failures ABSENT from the file, and a signal when a listed
test passes. The mission supplied 13 names (its 23-name authority filtered to tests/unit and
tests/architecture, the job's scope) at logs/ci-known-red-mission-seed.txt. RULED for W12b:
the DEV-SYNC lane extends that file with the mission's own entries, each carrying its
measurement commit; the F22 load-coupled cases are NOT listed (they pass solo — listing them
would mask a real regression); and the mission's PR is not opened until its tree passes the
gate as written.

## 2026-09-02 14:56 EEST · J23 — the production widening of the cited set belongs to T9, not T12 (F-S08-1)
The S08 seat delivered T12's engine change (band basis and the downgrade predicate read the
cited, conformance-verified set) and then reported that production shares are still 0/1,
because `buildFixedSingleRootServeNodes` still returns one node and the composer may only cite
"primary". It stopped rather than widen that seam, correctly: widening it is a product change
on the composition path and breaks DR-159 B2-A. The goal's premise that "T10 replaces" that
builder is FALSE at e040b1ee — T10 replaced the SELECTION rule, not the served node set.
RULED: (1) the widening is T9's charge, because T9's digest is precisely the all-node
membership mechanism plus citation tracing to digest nodes — the S07 seat is told to make the
served node set and the citable set follow the digest, with DR-159 B2-A's constraint stated
and satisfied or escalated; (2) T12's DoD is MET at the engine level for this lane — its RED
and GREEN stand — and the mission carries an explicit completion dependency: fractional shares
in production are proven by the W12 flagship run's band over cited nodes, not by S08;
(3) the Global DoD's "band counted over cited nodes" is therefore a joint T9+T12 obligation
and the flagship run is where both are demonstrated. F-S08-1 stays open until that run.
D30 ADDENDUM (2026-09-02 14:57 EEST): the peer accepted the seed and both other notes — the
allowlist is the name-by-name union of our 13 and its measured set, keyed on the exact vitest
string as printed on its branch, one source note per line, with the F22 load-coupled cases
excluded. The "fail, not warn, when a listed test passes three consecutive default-branch runs"
note needs cross-run state and ships as a warning; it goes on the V packet as a follow-up. Note
for W12b: the keying is on the string AS PRINTED ON THE PEER'S BRANCH, so the DEV-SYNC lane
must re-derive our 13 names on the merged tree rather than copying them — suite titles have
already drifted once between bases.

## 2026-09-02 15:01 EEST · D31 — a "comment-only" conflict is a signal that the code under it was contested
The T7 merge hit three conflicts that looked like prose and sat on exact mark-count pins: each
lane minted one mark, so the merged vocabulary is one larger than either lane asserted. Had the
seat resolved the prose and moved on, three landed assertions would have asserted a count the
merge itself falsified. RULED: on every merge, a conflict whose visible text is a comment is
resolved by reading the code and the assertions it documents, and the seat greps the whole tree
for other pins of the same quantity before filing. The exact cardinality at all four commits is
being settled by the merge review — the orchestrator's own extraction disagrees with the seat's
in absolute terms while agreeing on the arithmetic, which is itself a reminder that a count
must be produced by a stated method, not by eye.

## 2026-09-02 15:09 EEST · S09 (T17) FILED — the panel leg was ABSENT, not undercounted
The envelope seat measured what DR-184-v2 actually counts: `panelSize*(panelSize−1)` is
buildCrossRootExchangePlan's exchange NODES, not panel calls, so the panel leg was missing
entirely; the real term is (M−1) × materialized nodes. Two further corrections: withCooldownRetry
spends TWO provider sequences (base, then base+final), so a cooldown site is 2*judge + final;
and "repair" is not a term at all — it is consumed inside each site's maxAttempts loop. Ceiling
at M=2/d=1 rises 88 → 160. No new register row was minted: T16 had already sealed
envelopeFormulaInputs with NO production consumer, and the seat wired that existing reader into
both entry points as the claim-time loud stop, removing eight ENGINE_*/RUNNER_* re-declarations.
Derived per-round role count = 2 (one synthesizer + one evaluator, both unconditional in
runSynthesisLoop's body), so the serve leg is 3 × 2 = 6 sites — derived from the UNMERGED lane/s07
shape and flagged for re-verification after T9 merges. Findings: F-S09-1 (deploy boundary → V),
F-S09-2 (silent NaN ceiling on an omitted member — fixed in lane), F-S09-3 (two authority reds
are fake-pool defects, ticketed), F-S09-4 (maxRecompose becomes dead weight after T9),
F-S09-5 (the acceptance claim lease roughly doubles — W12 must allow for it).

## 2026-09-02 15:11 EEST · D30 ADDENDUM-2 — the gate is live, and FOUR of our authority names are already green on the newer base
The peer's PR now carries tests/ci-known-red.txt (12 active entries with per-line sources),
tools/ci-known-red.mjs (vitest JSON reporter; fails only on names absent from the file; a listed
test that passes warns; a collection or import error counts as a NEW failure — the right call,
since an import error otherwise masks a whole file), the script test:ci-gate, and a verify job
that runs it. Proof on its tree: new=0 known=12 stale=0.
MATERIAL FOR W12b: four of our 13 seed names are GREEN on its branch — s04-contract DR-128,
s10-carrier-erasure-red tombstones, s13-contract memory carriers, and v2ui-node-runner HYG-01
(three re-pinned by its B20 change, one fixed on dev after 1c9578a) — so they sit in the file as
commented rows. RULED: (1) the mission's 23-name authority is measured at the 1c9578a lineage
and does NOT transfer to the post-sync tree; W12b re-derives it and the expected shrink is at
least these four plus the two fake-pool entries (F-S09-3); (2) after the sync, any of those six
that is STILL red is a regression signal to investigate, not an inherited failure to list;
(3) the DEV-SYNC lane adds the mission's own entries with their measurement commit and may only
list a name it has measured on the merged tree.

## 2026-09-02 15:15 EEST · J24 — a sealed role ref whose provider is unhealthy REFUSES loudly; it never fails over
The S07 seat found that role refs resolve by identity, not health: a sealed synthesizerRoleRef
or evaluatorRoleRef naming an absent provider sends the call there, with no failover by design.
RULED: that is correct and stays. Substituting a healthy provider for a sealed identity is
exactly the silent substitution the goal repeals (scope law, goal 26: every degradation or skip
emits a visible mark; J8: role refs are sealed identities). The deployment must REFUSE LOUDLY —
at claim time where possible, with a visible condition mark naming the unresolvable role — and
never quietly serve from a different provider. The availability trade-off is real and goes to V
as V-ROLE-1: V may instead choose disclosed failover (serve from a substitute provider AND
emit a mark naming the substitution), which is honest but changes what a sealed role means.
Default if V is silent: refuse loudly.

## 2026-09-02 15:15 EEST · F-S08-2 CLOSED by deletion, not by fix
The S07 seat's gate retirement DELETED Q51's locator limb, so no locator predicate remains in
the serve chain to diverge from the band's set: `grep locator` over serve and synthesis returns
only the ServeNode.locator field, two comments recording the deletion, and three read-only
projection sites. The remaining Q51 limb is the downgrade FORM (T13's), and in that tree the
form and band read the same set. No fix ticket is warranted. RESIDUAL recorded: ServeNode.locator
is now carried but never read by the chain — a later lane wanting a locator predicate must
re-introduce it deliberately rather than assume one survives.

## 2026-09-02 15:16 EEST · D32 — F-TINT1-9 RESOLVED: seats append their own traps to the shared file, never to a lane copy
The worker contract §6 orders every seat to append its tooling traps to
dialectical-engine/.hermes/TOOLING-TRAPS.md, and no packet's allowed list granted that path —
F-TINT1-9 named the conflict, TINT1 and S08 dropped their traps because of it, and the S07 seat
followed §6 and appended directly. RULED, matching how the mission has actually operated: the
MAIN checkout's TOOLING-TRAPS.md is the shared accumulation point for the whole fleet. Seats may
append their own entries there, append-only, one dated entry per trap, never rewriting or
reordering another entry; they do NOT write the copy inside their lane worktree (that would
create merge churn on every lane merge for a file that carries no product behaviour), and they
still may not touch board or DECISIONS files. Every worker packet from now names the path with
this rule. V hand-merges the accumulated file at closure, as the V packet already records.
The two S07 entries stand; the traps S08 and TINT1 drafted were appended by the orchestrator and
stay.

## 2026-09-02 15:19 EEST · COUNT SETTLED (T7 merge review) — the orchestrator's extraction was the wrong one
The merge review recomputed the mark vocabulary: 32 at e040b1ee, 32 at 1fad4e16 (S06's mint),
32 at 3ea7fd33 (T7's mint), 33 merged. The seat's three raised pins are therefore correct. The
orchestrator's independent count (28/28/28/29) came from a regex over the array body that
filtered entries its character class did not match — the arithmetic agreed while the absolute
number did not, which is exactly the signature of a filtering parse. Correction recorded per
D31's own point: a count must come from a stated method, and when two methods disagree the
disagreement is settled before either is used, not averaged. The mission's tooling lesson from
F-S09-6 applies to structural extraction too: assert the extraction against a second independent
method before trusting either.

## 2026-09-02 15:21 EEST · D30 ADDENDUM-3 — the CI gate's first signal, and a caution the mission records
On the GitHub Linux runner exactly ONE name was new: registration.test.ts "S3c B4 keeps the
isolated production RSS curve below the published measured bound" — 273.1 MiB there against a
256 MiB bound sealed on V's Mac (247-252 locally, unchanged across five A/B rounds). Everything
else matched the 12 known names, which independently confirms both baselines on a third host.
The peer listed the Linux measurement with the CI run as its source and routed "seal the bound
per platform" to its V packet.
MISSION CAUTION, recorded and sent: allowlisting a MEASUREMENT test disables it as a detector on
that platform — the curve could drift from 273 to any larger number and the gate would stay
green, because the gate only asks whether the name is listed. This is the same argument that
keeps our F22 load-coupled cases out of the file. Preferred: seal the bound per platform (the
peer's own V row) or have the test skip loudly on a platform with no sealed bound; the allowlist
entry is acceptable only as a temporary measure with that follow-up attached. For W12b: the
mission's measurements are on macOS, so a Linux-only name appearing on the mission's PR is
measured, sourced and listed the same way — with the same caution for anything that is a bound
rather than a behaviour.

## 2026-09-02 15:23 EEST · T7 MERGED — integration tip 44836ecf; and D33 on self-proving evidence
lane/t7 merged no-ff (14 files, +2715/−56 from 1fad4e16); contract artifacts regenerated. The
merge review's one evidence finding was repaired by a log that DESTROYS the gitignored generated
directory, shows it absent, regenerates, fingerprints the artifacts and only then runs the
baseline — proving its own provisioning instead of asserting it. The seat also reported the fact
that cut against its own defence: the fingerprints at both commits are byte-identical, so the
original measurement could not have been wrong, and it filed the repair anyway.
D33: an artifact that cannot prove its own provisioning is inadmissible whether or not it
happened to be right — the same standard D24 sets for mutant transcripts and D27 for stale tips.
Evidence is a proof of how it was obtained, not a record of its result.
D30 ADDENDUM-4 (2026-09-02 15:29 EEST): the peer adopted the caution — the RSS-curve case now
skips loudly whenever the runtime platform and architecture differ from the row's sealed values,
so it still detects drift on the host where the bound was measured and is visibly skipped rather
than silently green elsewhere; the allowlist is back to 12 behavioural names, and sealing a bound
per platform stays as the real fix on its packet. RULE the mission adopts for its own bounds:
a measurement test is gated on the platform its bound was sealed for and skips LOUDLY elsewhere;
it is never allowlisted, because an allowlisted bound cannot detect its own drift.

## 2026-09-02 15:33 EEST · D27 ADDENDUM — the stale-gate check is now a clause in EVERY worker packet
Four occurrences across two seats (S06 r4b, T3C r1 B3, T3C r2 B2, S09 r1 B4). Instructing care
has not worked; the check is mechanical, so it becomes standing packet text: after the final
content commit, run every gate, then compare each gate log's stamped commit against
`git rev-parse HEAD` and paste the comparison's output — which must be empty — into the report
beside the tip it compared against. A filing without that output is incomplete. Reviewers may
refuse to assess gate evidence that lacks it.

## 2026-09-02 15:33 EEST · W12 RE-VERIFICATION LIST for the envelope after T9 merges (from the S09 review)
The reviewer confirmed the serve-leg derivation against the unmerged lane and named exactly what
the merge must re-check: that the old composition and conformance provider chain was REMOVED
rather than duplicated; that each round still makes exactly one unconditional synthesizer call
and one unconditional evaluator call; and that maxRecompose is dead only on the post-T9 tree, so
nothing may be simplified on that basis before the merge. Recorded here so closure does not have
to rediscover it.

## 2026-09-02 15:34 EEST · D23 ADDENDUM-7 — the peer's PR is READY FOR V (all gates green)
DebateAIRO/debateairo#8 (security/2026-09-01-hardening → dev) is green at 2d893415 on typecheck,
the known-red gate (new=0 known=12), pnpm audit, gitleaks over all refs and CodeQL; the only later
commit is a ledger note. It waits on V. For W12b, unchanged and now firm: merge order is that PR
→ dev, then the mission's DEV-SYNC; the ADDENDUM-3 conflict map stands; the serve.answer patch
waits in the peer's handoff/ directory for fold-lane FL-1 (D26); and the sync lane must expect to
re-baseline the obs-zone pins (its B25 touched apps/api's registration and recovery blocks) and to
SHRINK tests/ci-known-red.txt as it fixes drift — at least the four names already green on the
newer base plus the two fake-pool entries (F-S09-3, which the S09 review independently confirmed).
The host is now free of the peer's runs entirely.

## 2026-09-02 15:37 EEST · J25 — an in-memory disclosure is not a disclosure
Three of S07's findings share one shape: a mark, a record or a reference is produced in a
returned object and never reaches persistence or a served projection, and the test asserts on
the returned object. RULED, binding on every lane: the scope law's "visible condition mark"
means visible to a reader of the served answer, so every disclosure this mission adds must cross
the persistence boundary and be asserted THERE. A test that calls the producer and inspects its
return value proves the producer returned something; it does not prove the disclosure exists.
This applies retroactively as a review question for lanes not yet merged — reviewers ask, for
each mark and record a lane adds, which persisted row or projection carries it.

## 2026-09-02 15:37 EEST · D15 BATCH b9 = {S06} on 1fad4e16 — SIX new names, five already cured by the T7 merge
Full suite: 29 failed / 1954 passed (1983), 48 min. Classification against the authority: 23
stable-red all present, 0 vanished, and SIX new names — five mark-vocabulary count pins that the
S06 merge left at the old cardinality (dr174-resilience, obs-l2-s02-registry, s14-ui, scoring,
and t16-algorithm-register-rows) plus one F22 load-flake member (S3d rework4).
RE-MEASURED at the current tip 44836ecf (logs/b9-pin-recheck-44836ecf.log): FOUR of the five are
already green, because the T7 seat found and raised those pins during its own merge (D31). ONE
remains: t16-algorithm-register-rows "finds no hardcoded policy anywhere" flags
packages/propagation/src/index.ts:922 as carrying the sealed value 0.25 — and the line is a
COMMENT the T7B change wrote, explaining the defect it fixed by quoting the movement number.
RULED: the guard is right even though the value is in prose. A comment that quotes a sealed
policy value goes false the moment V retunes the row, which is the same staleness the mission
repeals everywhere else. The one-line reword is folded into T6B (also comment-only, dispatching
against the current tip) and labelled as T7's finding, rather than opening a fifth lane.
S06's product proof therefore stands with this single carried item; the batch's binding re-run is
b10 after the next merges.

## 2026-09-02 15:39 EEST · D34 — the seat's own diagnosis, adopted as fleet law: generate the claim from the artifact
The T3C seat's self-report names the shape behind three of its four rework rounds across two
lanes: "a claim about an artifact that I did not generate from the artifact" — a read-set
recalled instead of grepped, a count taken from a line span, a sweep cited from another tree,
gates stamped at the wrong commit, a guard checked against a single imagined mutation. Prose
fixes for D27 failed twice; a check that prints STALE worked on the first try.
RULED: every quantity, set or provenance statement a report makes is PRODUCED by a command whose
output is in the filing, and where a mechanical check exists it replaces the instruction. The
orchestrator's own count error today (28 against the true 32) is the same shape and is recorded
beside this. Packets carry checks, not exhortations.

## 2026-09-02 15:54 EEST · JUDGE VERDICT — T3C (F33 panelPolicy + F34 claimTimeProbe): PASS WITH RECORDED RESIDUE
Codex r3 on the worker's last lawful round: 2 blocking, both routed by the reviewer itself to V
rows rather than a fourth round, and neither a defect in the shipped composition — which the
reviewer verifies is correct at the filed tip (observeProviderTarget persists nothing; main.ts
calls it without a recorder; the r2 evidence defect is closed and all ten r3 records stamp
332a8eb9/fbca6e0a, independently re-checked by the orchestrator).
B1 is a LIMIT OF THE PINS: someone could still import ProviderProbeRepository and call
`record(observation)` explicitly beside the approved call, and neither replacement assertion
sees it — the mutant M3full's own typecheck proves such a module compiles. B2 is a J25 placement
gap: the all-absent claim refusal is asserted on the returned rejection rather than through the
production wrapper on the persisted work-item state.
RULED: PASS WITH RECORDED RESIDUE. The lane merges. Both findings become
V-T3C-CODEX-R3-1 (a typed composition factory that cannot receive or close over a recorder, or
an exact-cardinality behavioural arm through the production wrapper) and V-T3C-CODEX-R3-2 (an
acceptance arm driving the all-absent claim path and asserting the persisted terminal state).
Judge recommendation on both: AUTHORIZE after the closing run, as one small hardening lane —
they are the same shape (assert through the production wrapper, not the returned value) and
J25 now makes that shape a standing review question, so the next lane to touch this seam
inherits the requirement anyway.

## 2026-09-02 16:03 EEST · D35 — an oracle written from the same reading as the code is not a second opinion
The S09 seat's r1 correction claimed TWO undercounts in the envelope formula: the absent panel
leg, and a cooldown site costing 2*judge + final. Writing the same-ledger test the review
demanded produced attempts=4 at a site the formula modelled at 7: createPostgresProviderGateway
counts attempts CUMULATIVELY per call-site key and passes remaining = maxAttempts − consumed, so
the second sequence gets only the final retry. A cooldown site's allowance is judge + final —
exactly what the old formula had. The seat retracted the second correction on the record; the
pinned grid moves 160 → 112 at M=2/d=1, the M=1 row now matches the old formula in all five
columns, and the ONLY real correction is the panel leg.
Why nothing caught it: the in-memory enumerator was written from the same misreading, so it
agreed with the formula, and all five r1 mutants were killed against that shared wrong oracle.
RULED (the seat's own words, adopted): a second model is not a second opinion. Where a quantity
can be measured from the system itself — a ledger, a database, a recorded run — the acceptance
oracle is that measurement, and an independently written enumeration is at most a cross-check.
Mutants prove a test's sensitivity to changes in the code; they cannot detect that the test and
the code share a false premise. This is why the goal's own DoD says "asserted HERE from the same
ledger" — the review was right to insist, and the insistence is what found it.
CONSEQUENCE recorded for the closing run: a real M=2 run at maximum path spends 92 attempts,
which is INSIDE the new 112 and ABOVE the old 88 — so the old ceiling would have refused a
lawful run. That is the concrete justification for T17 and belongs in the closure report.

## 2026-09-02 16:04 EEST · J26 — three answers for S07 (migration number, refusal terminal, borrowed record shape)
(a) MIGRATION 0057 IS S07's, uncontested. Checked directly: of the four active lanes only s07
adds a migration (0057_t09_synthesis_round.sql); s08, s09 and t3c add none, and the integration
tip ends at 0055. D25's registry stands — dev 0049, mission 0050-0055, peer 0056, mission from
0057. No renumbering.
(b) THE AT-CLAIM REFUSAL: do NOT release or re-queue. Retrying a sealed identity that is absent
would loop against a condition only a deployment change can fix, and J24 forbids substitution.
The throw must nonetheless reach a TERMINAL work-item state, and — per J25 and the same finding
codex raised on T3C — the lane must ASSERT that persisted state, not the thrown error: add an
arm that drives the all-absent claim path and reads back the work item's terminal state and
reason alongside the ledger.could_not_do row it already reads.
(c) THE BORROWED RECORD SHAPE is a small honesty defect and the seat was right to raise it:
`hold_ms: 0`, `attempts_spent: 0`, `planned_leg_count: 0` are not facts about a refusal that
spent nothing — a reader sees zeros as measurements. Where the type permits null, write null;
where it does not, mint a distinct event value for this state. Cheapest lawful option is the
seat's to choose, stated in the report. This is the same standard as J15 ADDENDUM-2's false
freeze marks: a record may not state a quantity it did not measure.

## 2026-09-02 16:23 EEST · D36 — never dispatch a review while the lane is under instruction to change
The orchestrator launched S07's codex r2 against tip 3fc06e64 in the same turn it told the seat
to fold J26(b) and (c) into that round. The seat did as instructed and filed r3 at 4fbbf2e3, so
the reviewer was reading a commit that no longer existed — the same staleness the mission has
spent the day enforcing on seats, created this time by the orchestrator. The review was stopped
before it filed and relaunched against the filed tip; no verdict was written against the stale
tree. RULED: a review is dispatched only against a tip the lane is finished with. If a ruling is
issued that requires more work, the ruling goes out FIRST and the review waits for the resulting
filing. The reviewer's own tip check would have caught it, at the cost of a wasted round.

## 2026-09-02 16:25 EEST · D35 CORRECTION and D27 ADDENDUM-2 — both defects are the orchestrator's
(a) D35's consequence line said a real M=2 maximum-path run spends 92 attempts. That is WRONG and
the review filed it as a packet defect against me. The 92-attempt run is a BRACKETING run: its
fixture gives COMPOSE, CONFORMANCE and R9 a failure budget of zero, so the serve organs answer on
their first attempt and no composition round repeats. 92 therefore sits above the old ceiling of
88 and below the new 112, which still proves the old ceiling would have refused a lawful run —
that claim stands — but it is NOT the maximum path and must never be quoted as one. The true
maximum total is unstated until a run drives every reachable serve namespace to its last allowed
attempt with both composition rounds forced. The review also found the second shared premise D35
asked for: ENGINE_FIXED_ORGANS_PER_COMPOSITION is multiplied by the recompose rounds in the same
unmeasured way the cooldown term was.
(b) D27 ADDENDUM's stale-stamp check as I wrote it is DIRECTORY-SENSITIVE and can print nothing
for the wrong reason: run from the mission-report directory, `git rev-parse HEAD` resolves the
MAIN checkout, not the lane. Corrected standing form, effective now:
  `TIP=$(git -C <lane worktree> rev-parse HEAD); for f in <mission logs dir>/*.log; do printf '%s ' "$f"; grep -m1 -oE '[0-9a-f]{40}' "$f" || echo NO-STAMP; done | awk -v tip="$TIP" '{if ($2!=tip) print "STALE: "$0}'`
with the resolved TIP printed above the output. Every packet carrying the check uses this form,
and a filing whose transcript does not show the resolved TIP is incomplete. The S09 logs do name
the lane tip; only the transcript was invalid — the check failed as EVIDENCE, not as a fact.

## 2026-09-02 16:29 EEST · J27 — T3C keeps the stoppingPolicy fix AND adds the class gate (D28 is overdue)
The T3C seat's merge auto-merged with zero conflicts and then went RED on its own behavioural
arms, which is D31 working: the clean merge hid a defect. Verified independently at 44836ecf —
main.ts passes four policies, never stoppingPolicy, and its reader mentions it nowhere, so
merged code refuses every multi-maker work item. The closing run is M≥2, so this blocks the
Global DoD.
RULED: (a) the pass-through fix STAYS in T3C. J22's diff discipline yields here because T3C's
charge IS "the shipped entry point loads and passes every family it needs" (J20 already extended
it once for the same reason), the fix satisfies T7's own gate rather than altering any landed
semantics, T7's 63 tests pass, and it sits in one revertible commit. Reverting it would leave the
mission unable to run the very debate its definition of done requires.
(b) The seat's V-row draft is UPGRADED to a requirement: D28 has demanded the enumeration since
the second instance and this is the third, so T3C adds a GATE that enumerates every optional
WalkingSkeletonSettings member against what main.ts actually composes and fails on any member
that is neither passed nor explicitly listed as intentionally absent with a reason. A per-setting
pin has now failed to close this class three times; the enumeration closes it.
(c) F37 is ticketed with T7 named as the origin, and T7's merged state is corrected by T3C rather
than reopened — its rounds are exhausted and this is wiring, not semantics.

## 2026-09-02 16:45 EEST · J28 — F-S09-8: the report must agree with the permission (default), and V may prefer the alternative
The envelope now equals the measured maximum (109 at M=2/d=1; v2's 88 was wrong in BOTH
directions — panel leg absent at +24, serve leg over-billed at −3, per-site attempts always
right). The seat then measured a consequence and refused to assert it away: the guard PERMITS
exactly `max` attempts (`assertModelAttemptAllowed` refuses at consumed >= max) while the
reporter calls that same state EXHAUSTED (`decideBudgetPressure` reports WITHIN only while
consumed < max). So a lawful maximum-path run completes and then reports that it ran out.
RULED (default): the REPORTING comparison follows the PERMISSION comparison — WITHIN while
consumed <= max. Nothing about what is allowed changes; a run that spends exactly what the
structure permits has not exceeded anything, and calling that EXHAUSTED is the same class of
false statement this mission has repealed everywhere else. Neither headroom (an arbitrary +1)
nor silence is acceptable.
V ROW V-S09-8: the alternative reading is legitimate and is V's to choose — EXHAUSTED at exactly
the ceiling as a deliberate signal that a run consumed its entire envelope, with the Global DoD's
"envelope WITHIN at terminal" then meaning "did not reach the ceiling". If V prefers that, the
comparison stays and the DoD sentence is read that way. The flagship run is unaffected either
way: it spends about 28 of 109.

## 2026-09-02 16:51 EEST · D27 ADDENDUM-3 (final form) — the comparator was mine and it was broken twice
The review filed a packet defect against the orchestrator: `grep -m1 -oE '[0-9a-f]{40}'` stops
at the first matching LINE but prints EVERY match on it, so a header carrying
`commit=<40hex> tree=<40hex>` emits two hashes and the field comparison misreads. My own
"independent re-checks" on three lanes used that recipe. Re-run just now with a corrected one —
extract the COMMIT FIELD specifically — the result holds: s09 0 off-tip of 8, t3c 0 of 40, s08 0
of 32, and s07's only 8 off-tip logs are exactly the r2-gate-* set its report already labels
superseded. The facts were right; the check was not evidence.
FINAL STANDING FORM, replacing both earlier versions:
  `TIP=$(git -C <lane worktree> rev-parse HEAD); echo "TIP=$TIP"; for f in <mission logs dir>/<current-round prefix>*.log; do c=$(grep -m1 -oE 'commit=[0-9a-f]{40}' "$f" | head -1 | cut -d= -f2); [ "$c" = "$TIP" ] || echo "STALE $f -> ${c:-NO-STAMP}"; done`
Scope it to the CURRENT round's logs by prefix so superseded sets do not report as stale, and
print the resolved TIP above the output. Three revisions of one check is itself the lesson D34
names: I wrote a checker and never checked the checker.

## 2026-09-02 16:51 EEST · J29 — S07's two findings converge on one design: references, not transcripts
B1 (migration 0057 stores the synthesis transcript in PLAINTEXT outside the encrypted-content
boundary, and readSynthesisRounds returns it with neither an ownership argument nor a content
lease) and B2 (the durable candidate "reference" is arbitrary text with no referential integrity)
are one problem: the new table stores CONTENT where it should store REFERENCES.
RULED, to save the lane a round on a design choice: persist TYPED RAW-ARTIFACT KEYS with
referential integrity — the production adapter already supplies response.rawArtifactRef, which is
the right source and the durable boundary currently discards — and store no plaintext synthesis
text in serve.synthesis_round. The reader takes the same ownership and content-lease treatment as
every other content reader, and the round arm runs against an ENCRYPTED run so the 14-carrier
encryption test covers the new carrier. Establish that a stored ref belongs to the same run and
round producer before the answer transaction commits, and make the assertion resolve the ref
rather than pattern-match it. If a transcript field is genuinely required for the DoD's
"round-2 request contains the round-1 objection verbatim", that field is an encrypted carrier
with a sentinel, not plaintext — say which you chose and why.

## 2026-09-02 16:57 EEST · D37 — the mutant you expect to be redundant is the one carrying information
The T3C seat built J27's class gate, ran five mutants, and the two that mattered (unwire
stoppingPolicy; add an unwired member) both died — at which point the gate looked sound. The
third, which it expected to be redundant, survived: `indexOf("interface WalkingSkeletonSettings")`
substring-matches a renamed interface, so a rename would have left the enumeration reading the
same members and the gate passing vacuously. A gate with a live vacuity hole would have shipped
while reporting that it closes the class. RULED: a campaign stops when every mutant in the
enumerated class has run, not when the important ones die; and any gate that DISCOVERS its
subject by text (an interface name, a symbol, a path) carries a mutant that renames that subject.
The seat also refused a depth-blind enumeration that would have forced two nested return-type
fields into the allowlist with invented reasons — an allowlist entry that describes nothing is
the same false record this mission repeals elsewhere.

## 2026-09-02 17:05 EEST · JUDGE VERDICT — T17 (cost envelope): PASS ON THE ARITHMETIC; micro-ticket S09B authorized for the ruling that arrived late
Codex r3 on the worker's last lawful round independently derives the headline and confirms it:
8 author sites × 4 + 8 reviewer × 4 + 8 panel × 3 + 7 serve × 3 = 109; the old 88 omitted the
panel leg (+24) and over-billed the serve leg (−3). The maximum-path ledger test, the corrected
provenance, the nine caught mutants and the set-equal zone all stand.
Three items remain and the worker has no round left:
B1 (BLOCKING, product): at consumed == max the run does not merely report EXHAUSTED — the
envelope terminal fires and DESTROYS the successfully served answer. J28 already ruled the
default (reporting follows permission: WITHIN while consumed <= max); the ruling was issued
AFTER the filing, so the tree does not carry it.
B2: the new split receipt is accepted in contradictory forms and its two new fields are missing
from the one-field deletion matrix — r1 B3's gap repeated on the new members.
N1: five stale sentences in the report contradict its own logs and code (a "tight cover in both
worlds" claim, two provenance sentences naming superseded tips, an M8 count off by one because
the integration file is a collection failure under that mutant, and a fixture comment describing
behaviour the implementation no longer has).
RULED: I authorize micro-ticket S09B, subject to V's veto, on the same standing as T7B and T6B —
it IMPLEMENTS a ruling already issued (J28) rather than opening new scope, plus the two items
from the same filing. Scope, exactly: apply J28's inclusive comparison so equality is WITHIN and
a served answer at exactly the ceiling survives; make the receipt parser refuse an arm whose
count disagrees with call_sites.serve and add the two new members to the deletion matrix; run
D28's generated sweep over the report and recompute its hash. No other change. Codex re-reviews;
the closing run is unaffected either way (it spends about 28 of 109).

## 2026-09-02 17:21 EEST · D38 — a mutation campaign takes the worktree exclusively (F-S09-9)
D24 ADDENDUM-2 stops a campaign STARTING on a dirty tree; it does not stop a campaign DIRTYING
the tree beneath a concurrent reader. The S09 seat ran a zone suite and its campaign together in
one worktree: the zone read mutated files and reported six new failures, five in the seat's own
tests, which looked briefly like a J28 regression. What settled it was the mutant token appearing
in the zone log — a string that exists nowhere but the mutant's replacement text, which is
exactly why D24 requires the token printed verbatim. RULED: while a mutation campaign is running,
no other run touches that worktree; the campaign writes a marker file at start and removes it at
the end, and any test launcher in that worktree refuses while the marker exists. A run that
overlapped a campaign is retained, labelled CONTAMINATED, and never counted. The seat did all of
this unprompted and its contaminated log is kept under that name.

## 2026-09-02 17:37 EEST · D35 ADDENDUM — testing a schema is not testing the writer
S07's R4M1 (write the request in plaintext on an encrypted run) SURVIVED its first campaign
because the encryption suite built its row BY HAND: the schema was covered and the writer never
was, so a mutant that only a writer path can expose had nothing to kill it. Driving the round
through `persist` killed it and exposed a real defect behind it — the same-run proof counted ROWS,
so a round naming one artifact for both roles was wrongly refused; it now counts distinct
references. RULED: a carrier's tests must drive the PRODUCTION WRITER at least once; a fixture
that inserts rows directly proves the constraint, never the code that fills it. Same family as
D35 — the evidence and the code must not share their premises.

## 2026-09-02 17:38 EEST · D39 — verify the packet from a SEPARATE command than the one that writes it
The S08 review was dispatched twice against a packet that did not exist: a tooling outage killed
the command whose heredoc would have written it, and my existence check sat INSIDE that same
command, so the failure took the check with it. The reviewer BLOCKED rather than guessing, which
is the contract working and cost only its reading budget. RULED: writing a packet and confirming
it exists are separate commands, and a dispatch names a packet only after a check that ran on its
own. Same shape as D34 — I checked the checker no better than I checked the packet.

## 2026-09-02 17:50 EEST · J30 — the class gate stays a TEXT SCAN that proves its own rules (ratified on evidence)
The merge review preferred an AST extractor "as least brittle". The seat checked instead of
complying: typescript@7's exports map resolves "." to lib/version.cjs and the compiler API lives
only under explicitly `unstable/` subpaths — `unstable/ast` ships SyntaxKind and type guards but
no createSourceFile, so a real parse needs an unstable Project. RULED: pinning a committed gate to
a surface its own vendor labels unstable is worse brittleness than a scan, so the scan stands,
under the condition the review itself allowed — it PROVES its rules in-test: it asserts the nested
`clock:` exists in main.ts AND is not collected (the depth rule), and that `critique` arrives only
via the conditional spread AND is collected (the spread rule). Both fail loudly on regression, and
the first also fails if someone deletes the nested `clock:`, which would otherwise make the depth
proof vacuous. If the vendor stabilises its parser, moving to AST is a follow-up, not a defect.

## 2026-09-02 17:50 EEST · D40 — draw mutation material from the artifact, not from invented names
The T3C seat's own diagnosis, adopted: its mutants kept being authored from the same belief as
the code — a `probes:` field the call never passed, a rename that substring-matched, and
`futureUnwiredPolicy`, a name appearing nowhere in the literal and therefore incapable of
colliding. The reviewer's mutant used `clock`, a name ALREADY IN THE FILE, and it killed the gate.
RULED: a mutation campaign draws its material from what the artifact already contains — existing
identifiers, existing nesting, existing spreads — because an invented name tests the code the
author meant to write. This is D35's shape at the level of mutants: the mutant and the code must
not share their author's premises.

## 2026-09-02 17:52 EEST · D41 — ONE comparator, in tools/, and mission evidence lives in the mission directory
I wrote the stale-stamp check three times in prose and it was wrong three times: directory-
sensitive, then matching both the commit and the tree hash on one line, then over-fitted to a
single stamp spelling (`commit=`) while seats legitimately wrote `commit <hash>` and
`campaign tip:`. A seat re-ran an entire mutation campaign to satisfy a spelling my rule invented.
RULED: (a) the comparator now exists ONCE as
.hermes/reports/2026-09-01-algorithm-live-loop/tools/stamp-check.sh with its contract in the
header — any line matching `commit[=: ]+<40 hex>`, compared against `git -C <lane> rev-parse HEAD`,
skipping .json sidecars, refusing when the glob matches nothing (an empty result is not a pass).
Ad-hoc variants are forbidden, mine included. Verified on all three lanes: t3c 19 records 1
failure (its own comparator output, which carries the resolved tip instead of a stamp — expected),
s09b 8/0, s07 r4f 9/0. (b) MISSION EVIDENCE LIVES IN THE MISSION REPORT DIRECTORY. The T3C seat
wrote 22 records into a gitignored logs/ inside its LANE worktree, which is deleted when the lane
is removed — my own instruction said "logs/t3c/" without the mission prefix and caused it. I have
copied all 21 records and 6 transcripts into the mission directory; packets state the absolute
mission path and nothing else.

## 2026-09-02 17:54 EEST · J29 ADDENDUM — the retained carrier goes; and a packet defect of mine on T16
S07's r3 review answers the question the seat honestly flagged as an argument in its own favour.
(a) The frozen SPEC asks for "fresh-context + round-2-objection recorded-request assertions" and,
separately, "loop-round records" — it does NOT require the request body to be persisted. And the
carrier cannot prove what it was kept for: the SAME in-memory SynthesizerRequest object feeds both
the provider packet and the later database insert, so the row is evidence that the object existed,
never that it was the request AS SENT. RULED: remove the request body and its encryption-carrier
machinery; keep the ownership-aware leased reader and the durable structural and reference fields.
My J29 said "if a transcript field is genuinely required" — it is not, and the reviewer's push is
what established that.
(b) PACKET DEFECT, mine: my r3 packet described one artifact used for both round roles as "the
identical-role-refs case T16 warns about". T16's text warns about provider-ROLE equality (one
provider holding both roles), which is a different thing from artifact identity. I repeated the
seat's phrase without checking the source — the exact habit D34 names. The D35 ADDENDUM wording
inherits the correction: provider-role equality, artifact identity and producer identity are three
distinct things.

## 2026-09-02 17:59 EEST · JUDGE — T17: I do NOT self-authorize a second micro-ticket; both findings go to V
S09B's review returns two blocking findings and two non-blocking ones. I authorized S09B once, on
the ground that it implemented a ruling (J28) issued after the filing. Authorizing a SECOND
post-cap ticket on the same lane would turn a narrow exception into a way around the rework cap,
which exists exactly to stop a lane churning. So both go to V as rows, with the defects stated
plainly rather than softened:
B1 — J28 is half-applied. The completion direction is fixed: a run finishing at consumed == max
records WITHIN and keeps its answer. The REFUSED-NEXT-ATTEMPT consumer still reads equality as
HARD_STOP, so an evaluation that sees a full ledger while a serve call is still pending takes the
exhausted path. The new tests cover reporting at max and max+1 and a completed maximum path;
none drives the runner through RUN_COST_ENVELOPE_EXHAUSTED at equality.
B2 — MY PACKET'S DEFECT: r3 required TWO independent cross-field checks (the selected arm agrees
with call_sites.serve, AND `selected` does not name the smaller arm). My S09B packet listed only
the first, so the seat built only that, and a receipt selecting the smaller arm still parses —
the reviewer supplies the exact accepting payload. The fix is the parser requiring
call_sites.serve === max(composition_sites, synthesis_loop_sites) plus a tie-policy match, with
the smaller-arm case pinned.
N1 — the D28 sweep was again not GENERATED from the artifacts and left false statements; N2 — the
post-D38 filing does not prove marker custody or launcher refusal.
The arithmetic, the maximum-path ledger test, the campaign and the set-equality all stand. The
closing run is unaffected (about 28 attempts of 109). Recommendation to V: authorize one final
lane covering B1, B2 and the two evidence items together, after the closing run.

## 2026-09-02 18:09 EEST · D42 — the transcript is EMITTED by tools/mutate.sh, not written by hand
Three lanes have now filed mutant summaries that describe a campaign without carrying D24's
mandatory fields, and T3C has been asked three times in prose. Asking again would be the same
mistake I made with the comparator. RULED: mutation transcripts are produced by
.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh, which refuses a dirty tree, refuses
a NEW token the file already contains, prints the literal OLD and NEW between markers, gates on
pre=0 → applied>0 → restored=0, records the target's sha before and after with an explicit match
line, runs the discriminating command with its exit, and prints the restore command and the
closing porcelain. A hand-written summary is inadmissible however plausible its content — as the
review put it, static plausibility does not make a runtime claim admissible.

## 2026-09-02 18:19 EEST · D43 — a mutant is credited to the assertion that killed it, or it is not evidence
The S08 seat's first two label-boundary mutants both went RED, which looked like coverage. Reading
the kill lines showed they died on ANSWER_PERSIST_FAILED and VERDICT_LABEL_BASIS_UNRESOLVED — the
run stops loudly and a PRE-EXISTING completion assertion killed them, while the round's new rows
stayed unpinned. The campaign would have reported the boundary covered. RULED: every mutant
transcript names the assertion that failed, and a mutant killed by an assertion OTHER than the one
it targets is recorded as evidence about the system's loudness, not as a pin for the target. The
seat then built two mutants that leave everything else intact and die on exactly one new
assertion each — that is the shape a pin must have. Related to D37: a dead mutant proves something
died, never that YOUR assertion did.
Tooling fix from the same filing: tools/stamp-check.sh now skips a comparator's own output, which
carries the resolved tip rather than a stamp and was reporting itself.

## 2026-09-02 18:29 EEST · J30 CORRECTION, and D42's rationale in the seat's own words
(a) J30 rested on the seat's claim that "typescript@7 exposes no stable parser". Filing real
compiler output made `tsc --version` print 5.9.3, which contradicted it, and the seat checked
precisely rather than letting it stand: at the GATE's resolution root `require.resolve` gives
7.0.2, whose exports map "." to lib/version.cjs with createSourceFile undefined and
lib/typescript.js blocked; 5.9.3 exists only inside apps/ui's dependency tree, unreachable from
the test. J30's conclusion stands for the context that matters — the gate cannot reach a stable
parser — but the claim as I ratified it was broader than what had been checked, and the record now
says so. A ruling inherits the precision of the claim it rests on.
(b) The seat's account of why D42 was needed, adopted as its rationale: "each round I
reconstructed D24 shape from memory and then graded my own reconstruction. My records had intent,
commit, tree, command, exit and verdict — they LOOKED like records while lacking every element
that makes one falsifiable by someone else. An executable spec removed the step where I grade
myself." Three of that lane's four evidence failures would have been impossible against a tool.
The same is true of my comparator: I wrote it in prose three times and graded my own reading each
time.

## 2026-09-02 18:34 EEST · D44 — evidence has a LOCATION contract, not only a content contract
The T3C seat's transcripts existed and were correct; they were written flat in the lane's
gitignored logs/ rather than where the mission keeps evidence, so they passed every content check
and were still invisible to a reader and doomed to vanish with the worktree. Its own account is
the rule: "stamp-check returned 24 records, 0 failures and I read that as 'the evidence is in
order'. It confirmed 24 files carried the right commit. It said nothing about whether those files
were somewhere a reader would look, or whether they would outlive the lane." RULED: a filing is
complete only when its artifacts are in the mission report directory, cited by absolute mission
path, and a passing content check is never evidence of location. tools/stamp-check.sh is a
content check; the location check is running ls on the directory the mission will keep.
This is a NEW failure shape for this mission: everything prior was asserting what had not been
generated from an artifact, and here everything was generated and still failed.

## 2026-09-02 18:38 EEST · JUDGE — S07 after its last round: two V rows, no self-authorization
Codex r4 on the spent lane: B1 — a wrong-ROLE producer pair still commits, because `bound.role`
appears only in error text and never as a predicate: one legitimate synthesizer artifact supplied
as BOTH candidate and verdict, with its real call-site key, passes both suffix checks and both
ledger queries return the same row. The negative arm does not refute it (it stores the entry under
JUDGE and then supplies NONEXISTENT keys, so it proves absence, not wrong-role). B2 — R5M1 and
R5M2 are WRONG-CAUSE deaths under D43: one dies on a later work-item constraint
(WAIT_DRAIN_REQUIRED) and the other on a parameter-type error, so the claimed producer and round
pins are absent and the aggregate log masked both causes by recording only a failed name and exit.
N1 is a packet defect of mine (I stated the string guard's failure direction and the negative
fixture inaccurately).
RULED: no self-authorization. I authorized one post-cap ticket today (S09B) because it implemented
a ruling issued after the filing; these are new corrections, and a second and third exception
would make the rework cap advisory. Both go to V as V-S07-CODEX-r4-1 and -2 with the reviewer's
own recommendation: derive the expected call-site keys IN persistence rather than accept
caller-supplied ones, and rebuild the two pins so each dies on its own assertion.

## 2026-09-02 18:50 EEST · D45 — gate records are EMITTED by tools/gate-run.sh; three prose rounds is enough
T3C has now spent three merge reviews on evidence, each time meeting the bar as stated and each
time the reviewer naming a further element the record needs: first the compiler's own exit rather
than a pipeline's, then the raw output, now the MEASURED checkout's commit and tree plus
before-and-after porcelain. The reviewer is right every time, and the fault is mine: I specified
a record in prose instead of shipping the thing that produces one, exactly as I did with the
comparator and the transcripts. RULED: every acceptance gate is run through
.hermes/reports/2026-09-01-algorithm-live-loop/tools/gate-run.sh, which emits the measured
checkout's commit and tree, porcelain BEFORE, the exact unpiped command, raw output between
markers, the command's OWN exit, porcelain AFTER, and an explicit clean-state verdict — so a
measurement taken against a dirty or shifted tree is visible rather than invisible. Self-tested
before this ruling was written. A baseline half additionally names the baseline commit AND tree it
binds, which is what the third review asked for.

## 2026-09-02 19:12 EEST · D46 — the campaign index is DERIVED by tools/mutant-index.sh, and S08's B1 is closed without a worker round
The S08 review found that the index claimed a mechanical derivation no artifact contained: the
driver invokes mutate.sh but never reads a pair's meta, never parses a transcript, never compares
expected with observed, and never writes or checks the index — so it could exit successfully while
the index and the report's 19/2 claim went stale. The reviewer routed it to V because the worker's
rounds are spent.
RULED: this is MISSION TOOLING, not lane work, so the orchestrator closes it rather than spending
a decision. tools/mutant-index.sh now derives an index from raw transcripts alone — gate counts,
the command's exit, and whether the run FAILED AN ASSERTION or THREW BEFORE ONE, decided by the
presence of an assertion frame in the captured output rather than by prose. Run over S08's 21
transcripts (logs/s08/r4-mut-INDEX-DERIVED.txt) it INDEPENDENTLY CONFIRMS the seat's tally:
21 transcripts, 19 killed, 2 survived. The seat's numbers were right; only the derivation was
missing, and it is filed now with the tool named as its author.
Three record corrections remain and go to the seat as EVIDENCE REPAIR, not a rework round: r3's
"~27 s per run" is stale in the stable filing; the self-report's l1/l2 cause was corrected in the
report but not in place in the self-report; and m3 has four failures, not three.

## 2026-09-02 19:2x EEST · JUDGE VERDICT — S08 (T12 band over the cited set + T13 honest downgrade): PASS; lane CLEARED for integration, merge-in owed

**Verdict: PASS.** The lane is correct on the product, and its evidence set is now
admissible. Codex r4 returned ZERO product findings across four static rounds. I did not
take that as the verdict; what follows is what I checked myself.

**What I verified independently, not from the reviewer or the seat.**
- Lane tip `e60e0296f3702e26b40d378f3bdf5cfff7f669e7`, porcelain empty, report digest
  `a3a99ee2…` reproduces from the artifact with line 2 removed.
- The three record corrections are present and each is GENERATED, not recalled: the stale
  "~27 s per run" is gone and the filing now quotes 14.15 s / 6.60 s / 6.76 s, which I
  matched against `grep '^   Duration' r3-persisted-tuple-three-runs.log` myself; the m3
  count now reads four failing tests split 3 threw / 1 assertion failed, with its generating
  command quoted, and `awk '/^## m3-/,/^$/' r4-mut-INDEX.md | grep -c '^- '` returns 4 when
  I run it; the false l1/l2 clause is corrected IN PLACE at self-report line 315 with the
  wrong sentence LEFT STANDING and the correction beside it, which is the honest form.
- The blocking review finding is closed by mission tooling, not by argument. `tools/mutant-index.sh`
  (D46) derives the campaign index from raw transcripts alone and independently reproduces
  the seat's tally: 21 transcripts, 19 killed, 2 survived.

**The product read, which is the judge's own and not the reviewer's.** T12 and T13 now read
ONE set — the nodes the composed statement cites, restricted to segments conformance
actually judged — so an answer's shape and its confidence can never describe different
evidence. The empty cited set throws `SERVED_STATEMENT_CITES_NO_VERIFIED_NODE` rather than
downgrading on `[].every(...) === true`, which is the vacuous truth that would otherwise
have made an uncited statement look honestly downgraded.

I tested one thing the reviewer did not report on. The verified-segment predicate is
`state !== "NOT_SAMPLED"`, and the state domain is `JUDGED | SAMPLED_PASSED | NOT_SAMPLED`
with conformance carried separately in a `conforms` flag — so on its face a JUDGED but
NON-CONFORMING segment would count as verified and its citations would enter the band. It
cannot: `packages/serve/src/index.ts:543` returns `componentsOnly` unless EVERY judgement
conforms, so the cited-set computation is only ever reached when every judged segment has
passed. The predicate is correct, and it is correct because of a guard 30 lines above it
rather than by its own terms. That coupling is worth a comment; it is not worth a round.

**Recorded residue, all filed and none silent.** F-S08-2: Q51's locator limb still reads the
load-bearing set rather than the cited set. The seat deliberately did NOT widen it and filed
the divergence instead, which is the right call — widening it would have been a scope change
the goal did not ask for. F5/J4 do-not-tidy is honored: the RAN bucket stays although T4
made it structurally zero.

**What is still owed before this lane merges, and it is NOT a rework round.** The lane sits
on `e040b1ee`, not on the integration tip `44836ecf`; four lanes have landed since. The
overlap is three hot files — `apps/runner/src/index.ts`, `packages/serve/src/index.ts`,
`tests/integration/database.test.ts`. The seat owes an integration merge-in and a re-run of
its gates at the merged tip, then a merge review. Worker rework 3/3 is spent and this is not
charged against it: integrating is not reworking.

## 2026-09-02 19:4x EEST · D47 — T9B is STAGED, not authorized: a ticket written in advance is not a ticket dispatched
T9's worker rounds are spent and codex r4 filed two blocking findings. B1 is a real product
defect: `bound.role` is interpolated into error text and never compared, so a legitimate
round-1 synthesizer artifact submitted as BOTH candidate and verdict passes every check and a
synthesizer response commits as the evaluator verdict. B2 is an evidence defect: the two
mutants credited as producer/round pins died of a parameter-type error and a work-item
constraint, so those pins do not exist.
The judge does NOT self-authorize this. A post-cap PRODUCT change is V's call, and the
distinction that let me close S08's finding (mission tooling, no lane work, no product edit)
does not apply here: this one changes shipped persistence logic.
RULED: write the ticket and packet NOW and mark both STAGED, so that V's ruling costs no
drafting time. The packet's first paragraph refuses itself — a seat reading it without a
dispatch message must stop and say so. Board status `waiting_human`, ticket
`T9B-role-predicate-binding.md`, packet `packets/t9b-role-predicate.md`, both path-verified in
a separate command per D39.
STANDING FACT this makes concrete: the Global DoD's flagship run requires "a synthesizer
verdict statement acknowledging the strongest surviving objection" and "an evaluator loop
record (≤3 rounds)". Both are T9's. **The goal cannot close without T9, and T9 cannot move
without V.** Every other lane can and does continue meanwhile.

## 2026-09-02 19:4x EEST · D48 — one durable zone comparator, whose exit predicate matches its name
T3C's merge review 4 found the zone gate ran a Python program from PRIVATE TEMPORARY STORAGE:
outside the mission's evidence directory, outside the measured tree, cited by no index, and so
bound by neither the record's commit/tree nor its porcelain. Worse than the location: its exit
predicate did not match its name. It read `sys.exit(0 if not n else 1)`, so a gate called
"set-equality" exited 0 whenever there were no NEW failures — a head that FIXED a baseline
failure passed it. It also carried lane-specific prose ("expected +1, the J27 gate") baked
into a comparator.
RULED: `tools/zone-set-equality.py` is the mission's only zone comparator. Exit 0 requires the
failure-NAME sets to be equal in BOTH directions; a fixed baseline failure is a change to the
authority set and must be RULED, not absorbed by a green gate, so it fails unless the caller
passes `--allow-fixed`, and the names print either way. The count delta is a PARAMETER
(`--expect-count-delta`), never baked prose. It refuses (exit 2) on a missing or unparseable
payload, on zero total tests — an empty result is not a pass — and when a payload's failure
COUNT disagrees with the number of failure NAMES it carries, which is the same vitest trap
D15's comparator already names.
SELF-TESTED BEFORE RULING, six arms: the real T3C payloads PASS (sets equal, delta +1); a
fixed baseline failure FAILS (exit 1) and passes only with `--allow-fixed`; a new failure
FAILS; zero tests refuses (exit 2); a count/name disagreement refuses (exit 2).
CONSEQUENCE FOR T3C: the lane's zone CLAIM was substantively right — under the strict
predicate the real payloads still pass. Only the gate implementation was wrong. Re-capture is
required for the record, not because the answer changes.
NOT the same defect: `tools/d15-suite.sh` computes BOTH `new` and `gone` and writes both to its
classification file, which the orchestrator reads to reach a verdict. Its contract is classify-
and-report, not exit-as-verdict, and every batch verdict on the record was reached by reading
that file.

## 2026-09-02 19:4x EEST · D49 — gate-run.sh v2: porcelain cannot see ignored paths, and v1 claimed it could
The same review found my own tool overclaimed. v1's header said it "proves its own provisioning
rather than asserting it". It does not: `git status --porcelain` EXCLUDES ignored paths, and in
this repo the dependency installs and the generated contract directory are ignored — which is
precisely where the compiler launcher lives. Identical commit, tree and both porcelain fields
therefore do NOT rule out a swapped `tsc` launcher or a changed generated artifact. The
reviewer also caught that ordering a wholesale re-capture through the generic envelope DROPPED
a field the older hand-built records carried: `compiler : Version 5.9.3`.
RULED: v2 emits a PROVISIONING block covering exactly that gap — node and pnpm versions, the
lockfile sha256, a manifest hash of the generated contract directory, and for every tool named
in the command its resolved launcher path, that launcher's sha256, and its self-reported
version. The clean-state line now says "TRACKED paths only — see PROVISIONING" instead of
implying more than it checks. v1 is retained as `gate-run.sh.v1-superseded`.
A FALSE ALARM OF MINE, recorded because the record should have prevented it: seeing T6B resolve
TypeScript 7.0.2 while the superseded T3C records said 5.9.3, I suspected the compiler had
changed under the lane. It had not. `apps/ui` pins its own TypeScript 5.9.3 in a nested
install, and the r9 records ran IN `apps/ui`, where `pnpm exec tsc` resolves that same 5.9.3;
the root workspace's 7.0.2 was never used for those gates. It took three commands to establish
what one retained line would have told me, which is the concrete price of the dropped field and
the reason B1 is correct rather than pedantic.

## 2026-09-02 19:5x EEST · T6B packet defects, recorded as mine
The T6B seat raised three packet defects and I accept all three. PD-T6B-1: the `allowed` list
granted "append a `## T6B` section" while items 1 and 3 required correcting text already in the
file; the seat resolved it well, by putting every correction in the appended section and
leaving three one-line in-place pointers with the original sentences standing, so no correction
is lost and nothing stale reads as current. PD-T6B-2: my packet said run the clusters once and
`INSTRUCTIONS.md` says three times; the seat ran three and was right to let the higher source
win. PD-T6B-3: the `allowed` list never named the two SOURCE files the packet itself required
editing — a contract that forbade the work it ordered.
F-T6B-2 is routed: the seat could not write `TOOLING-TRAPS.md` (outside its contract, and
carrying another seat's uncommitted edit) and said so instead of reaching. The zsh
`--include=*.ts` trap is now filed there by the orchestrator. I hit the identical trap myself
earlier the same day, which is the argument for the file existing.

## 2026-09-02 20:0x EEST · D50 — mutant-index v2: the manifest is real, and a command that never ran is not a kill
Two reviewers independently found the tool I wrote to close S08's B1 was itself defective, and
both were right.
 · Its usage advertised an optional expected file and the implementation never read a second
   argument. One product mutant turning GREEN while one neighbour turned RED would leave the
   tally at 19/2 and the tool would still print its confirmation. A checker that cannot fail is
   not a checker.
 · It counted ANY nonzero exit as a kill. Exit 127 is "command not found" — the mutant never
   ran — and v1 scored that as a dead mutant. The S11 seat hit exactly this and filed it.
A THIRD defect surfaced while fixing them, and it is the same disease: my bash v2 used an
associative array, which macOS bash 3.2 does not support, so the new manifest feature would
have SILENTLY DONE NOTHING. That is defect (1) wearing a different hat. The tool is now Python
(`tools/mutant-index.py`); the bash versions are retained as `.v1-superseded`.
RULED: exits are CLASSIFIED, never counted. 0 is SURVIVED; 1 is a kill, sub-typed ASSERTION or
THREW by the presence of a vitest assertion frame; 126/127 is INVALID because the command never
ran; anything else is SUSPECT and must be classified before it is credited. Custody gates are
checked against D42 (pre=0, applied>=1, restored=0). An empty glob refuses — an empty result is
not a pass. With a manifest, every mismatch, every unlisted transcript and every manifest entry
without a transcript is a PROBLEM and the tool exits nonzero.
SELF-TESTED BEFORE RULING, five arms: the real 21-transcript S08 campaign derives 19/2 clean;
a correct manifest passes; ONE flipped manifest entry is caught by name (the case v1 could
never catch); a transcript whose exit is 127 is reported INVALID rather than killed; an empty
glob refuses with exit 2. S08's campaign now carries a durable expected manifest at
`logs/s08/r5-mut-EXPECTED-MANIFEST.txt`, so the claim is re-checkable rather than re-assertable.

## 2026-09-02 20:0x EEST · MERGE — lane/s08 → integration at ee1afadd
Judge PASS; codex merge review 1 APPROVE, 0 blocking, 0 product findings. The reviewer verified
the assertion-preservation law directly: no removed line naming `expect`, a matcher, `it`,
`test` or `describe`, no test file deleted, incoming T7 assertions byte-present, and the TERM-01
expected tuple unchanged from the reviewed filing tip. Integration: 6118d2d5 → 362299d1 →
1fad4e16 → 44836ecf → **ee1afadd** (TINT1, T6, S06, T7, S08).

## 2026-09-02 20:1x EEST · D51 — generate the CAUSAL claim, not only the count (the mission's dominant defect class)
The S08 seat, correcting its third prose defect in one lane, named the pattern better than any
ruling so far: **its counts have been generated and its causal narratives have not, and all
three defects sat in the narratives.** D34 already forces a quantity to be produced by a command
whose output is filed. Nothing forced the same discipline on a claim about MECHANISM, and that
is where this mission has lost most of its rounds.
The class, gathered from the record:
 · S08 r3: "l1/l2 were caught by the pre-existing COMPLETED assertion" — no assertion ran; the
   throw left `executeWorkItem` before the first `expect`.
 · S08 r5: "T7's stoppingPolicy is provisioned, therefore its rule is live in every fixture" —
   TERM-01 is mono-maker, so `expansionPlan` is empty and `closeGlobalRound` never fires.
 · S08 r4: "the index was generated from the raw transcripts" — it was produced by an inline
   script that was never filed.
 · T6 r1: a comment crediting the TRANSACTION with excluding a concurrent review — the
   transaction rolls the answer version back; a per-run content advisory lease is what prevents
   the interleave.
 · T6 r3: r3/r4 gate logs attributed to a commit no log carries — testimony, not record.
 · T9 r4: two mutants credited as producer/round pins died of a parameter-type error and a
   work-item constraint instead.
 · My own ledger row repeating S08's "rule live in every fixture" before the reviewer caught it,
   and my own three-command chase of a compiler difference that a retained line would have
   settled.
RULED: a claim about MECHANISM — what killed a mutant, what a guard excludes, what a provisioned
setting makes live, what produced an artifact — is subject to D34's discipline exactly as a
quantity is. Trace the call path and cite it, or write CANNOT-ASSESS. "I read the diff and it
follows" is the specific move that failed every time above: a diff shows what changed, never
what executes. The tell is a sentence whose verb is causal and whose evidence is structural.
This belongs in the closure notes as the mission's largest single lesson, ahead of any tooling
finding, because every tool built here (mutate.sh, gate-run.sh, stamp-check.sh, mutant-index.py,
zone-set-equality.py) exists to mechanise a claim someone had previously asserted.

## 2026-09-02 20:2x EEST · JUDGE VERDICT — T6B (V-authorized documentation corrections): PASS; merge-in owed
**Verdict: PASS.** Codex r1 APPROVE with ZERO findings — the cleanest first-pass review of this
mission. Tip `cbd09de126402bd311ac5b3733f99f80d9585e7b`, tree `4a4c02d1…`, parent `44836ecf`,
clean worktree, report digest reproducing, all matched independently.
**What I verified myself rather than inheriting:** the diff is 15 insertions and 4 deletions
across two files, and my own `-U0` non-comment classifier over the `.ts` diff between base and
tip returns **0** changed non-comment lines. The reviewer ran its own classifier and agreed.
No assertion touched.
**What the seat did beyond its charge, correctly.** Given ONE provenance sentence to fix, it
swept the class (router §2.2) and found a second instance the finding never named: the report
also attributed the r4 gates to `7f513173`, and 17 of 21 r4 logs carry no commit token either.
Filed as F-T6B-1 and corrected on the same terms. It also verified each of the four corrections
against the artifact before writing it — nine `INSERT INTO` tables found by `awk` over `persist`,
the advisory lease traced to `pg_try_advisory_lock` at `packages/db/src/index.ts:266`, the r3
mutant tips counted at 9-at-`c7511826` plus M17-at-`df59c41a` — which is exactly the D51
discipline this mission had to learn three times elsewhere.
**Three packet defects, all mine, all accepted**: an `allowed` list that granted only an append
while the charge required in-place corrections; "run the clusters once" contradicting
INSTRUCTIONS.md's three; and an `allowed` list that never named the two source files the packet
ordered edited. The seat resolved the first honourably (corrections appended, originals left
standing, one-line pointers in place) and let the higher source win on the second.
**Owed before merge, NOT a rework round:** integration has advanced to `ee1afadd` since this
lane branched at `44836ecf`. Merge it in, re-run the gates at the merged tip, then merge out.

## 2026-09-02 20:3x EEST · D52 — gate-run v3: hash the module the shim EXECUTES, never the shim
The T3C seat found the defect in my own v2 fix, and it is the sharper kind: a check that
manufactures the suspicion it exists to remove. v2 hashed `node_modules/.bin/<tool>`, which under
pnpm is a generated SHELL SHIM. Its bytes differ between worktrees for no reason but generation
order — measured here as 2262 bytes / `6bf3402e…` in the lane against 2283 bytes / `3ceeb554…` in
integration. A reader comparing two halves sees DIFFERENT and reasonably suspects a swapped
compiler. The seat chased exactly that, and so had I, an hour earlier, from the same block.
The compiler itself was never in doubt: `typescript/bin/tsc` hashes `8d5fa5bd…` and
`typescript/lib/tsc.js` hashes `2cffde0b…` IDENTICALLY across lane-t3c, lane-t6b and integration
on the `apps/ui` surface, with `pnpm-lock.yaml` matching at `8e29617e…`.
RULED: v3 follows the shim to the module it actually executes — resolving through the pnpm store
— and records `package name@version`, the resolved ENTRY path, that entry's sha256, and the
tool's self-reported version. The shim is still printed, labelled `generated at install; its
bytes are NOT evidence`, so nobody re-derives the false alarm from its presence. Verified across
two worktrees: the identity block is now byte-identical where it should be.
THE LESSON, which is D51 pointed at tooling: a fingerprint that changes for reasons unrelated to
what it fingerprints is worse than no fingerprint. It does not merely fail to detect; it
actively produces false positives, and each one costs a seat a real investigation. Both of the
false compiler-swap chases this mission ran came from evidence blocks I wrote.
v2 retained as `gate-run.sh.v2-superseded`. T3C's r10 evidence is NOT invalidated: its
`r10-compiler-identity.log` already proves the module identity directly, which is the stronger
artifact and the reason the seat caught this at all.

## 2026-09-02 20:4x EEST · D52 ADDENDUM — the emitter's version, and why the fix is QUEUED rather than applied
The T3C seat asked a good question while parking: the evidence index cites `gate-run.sh` by
absolute path with no version marker, and that tool has now changed twice in one evening. A
record produced by v2 and one produced by v3 make materially different claims, and the path
alone does not say which you are reading.
TWO ANSWERS.
First, the records are ALREADY self-identifying by SHAPE, so nothing filed is ambiguous: a v2
provisioning block reads `launcher / sha256 / version`, while a v3 block reads
`shim / package / entry / sha256 / version`. The presence of `package` and `entry` lines is a
reliable v3 marker, and their absence a reliable v2 one. T3C's r10 records are v2-shaped, are
accurate as filed, and have the compiler question settled independently and more strongly by
`r10-compiler-identity.log`.
Second, an explicit `emitter: gate-run.sh v3` header is the right fix and it is QUEUED, NOT
APPLIED, because seats execute these tools concurrently and without announcement. bash reads a
script incrementally by byte offset rather than loading it up front, so rewriting a shared tool
while another process is running it makes that process resume at the old offset in the new
bytes — executing a fragment of a line or skipping a block, and failing in a way that looks like
a logic bug in the script. T6B is mid-merge-gates as I write this. Filed in TOOLING-TRAPS.md.
STANDING RULE from this: writing a NEW file beside a tool is always safe; editing a shared tool
in place is only safe when no seat is mid-run. Confirm first, or queue it.

## 2026-09-02 20:5x EEST · D53 — a `file:line` citation acquires a SILENT EXPIRY the moment another lane merges into that file
The T6B seat found this while doing what I asked and going one step further. My instruction was
to check that its comment still described the code around it after S08's insertions moved the
line numbers. The code was fine — it proved that the strongest available way, extracting
`persist` at both tips, stripping every comment line, and comparing: 290 non-comment lines each,
IDENTICAL, so S08 added no INSERT and changed no guard. What had broken was its own REPORT. S08
moved `serve` by +71 lines, which silently invalidated FOURTEEN citations filed at `cbd09de1`:
nine table rows, four anchors, a `withWriteTransaction` line, and an `awk` range. Every one was
correct when written. Every one was wrong after a merge the seat did not make.
**And no gate anywhere checks a line number in a report.** Typecheck does not. The clusters do
not. `stamp-check` binds the record to a commit but says nothing about whether a number inside a
prose file still points at what it claimed. This is why it is silent: nothing in the harness can
fail because of it.
RELATION TO D51, which the seat drew correctly: D51 catches a narrative that was NEVER generated.
This is the opposite failure — a citation that WAS generated, honestly, and then DECAYED because
the ground moved underneath it. Both produce a false statement in a filing; only one is anyone's
carelessness.
RULED: cite the SEARCH, not the number. `grep -n "async persist"` re-derives itself at any tip;
`:1408` is true only at one. Where a number is genuinely useful, it travels WITH the tip it was
taken at (`:1408 @cbd09de1`), so a reader can tell a stale citation from a wrong one. Every
lane that merges another lane into a file it has cited must re-derive its citations into that
file, and say it did — the seat re-derived all fourteen and named the remaining gap in its own
filing (its C3 table still cites numbers where C2 already cites searches) rather than quietly
closing it.
FOR W12 CLOSURE: this applies to EVERY report in this mission, not just T6B's. Six lanes have
now merged and several reports cite `file:line` into `serve` and `runner`, which have moved
repeatedly. The closure audit treats an un-re-derived `file:line` citation in a merged lane's
report as STALE-UNLESS-SHOWN, not as wrong — the distinction matters, because the underlying
claim is usually still true and only its address has changed.

## 2026-09-02 20:5x EEST · MERGE — lane/t6b → integration at 53c4ccf9
Codex r1 APPROVE with zero findings; judge PASS. 19 lines added, ZERO non-comment, measured
against `ee1afadd` so the claim survives the merge. Independently verified before merging: 11
gate records all stamping the merged tip `588be990`, 0 non-comment changed lines, and all 76
lines S08 added to `serve` present at the seat's merged tip. Integration: 6118d2d5 → 362299d1 →
1fad4e16 → 44836ecf → ee1afadd → **53c4ccf9** (TINT1, T6, S06, T7, S08, T6B).

## 2026-09-02 20:5x EEST · D52 ADDENDUM-2 — the queued emitter stamp is APPLIED, and the safety check itself gave a false positive
With every seat's gate run landed and none mid-run, the queued change is in: each record's
second line now reads `emitter : gate-run.sh v3 (D45, D49, D52) — records made by v2 lack the
package/entry lines`, so a record states its own producer instead of leaving a reader to infer
it from block shape. Self-tested on the integration worktree; the record is otherwise unchanged.
Worth recording because it is the same disease twice in one evening: my safety check
(`pgrep -fl 'gate-run.sh|...'`) MATCHED — on the codex process, whose command line contains the
review packet's TEXT, which mentions the tool by name. Nothing was executing it; a static review
runs no gates. A pattern that matches for reasons unrelated to what it is looking for, exactly
the D52 defect, this time in my own guard rather than in a tool. It cost nothing here only
because I read WHAT matched instead of acting on the fact that something did. The general form:
a positive result is not information until you have read what produced it.

## 2026-09-02 21:0x EEST · D54 — the authority set legitimately LOSES one name at 53c4ccf9, ruled in advance of batch b10
The T3C seat disclosed that baseline failures fell 14 → 13 between `44836ecf` and `53c4ccf9` and
attributed it to S08/T6B rather than absorbing it into a green gate. I checked which name, by
comparing the two filed baseline payloads directly:

```
baseline @44836ecf: total=1449 failed=14
baseline @53c4ccf9: total=1469 failed=13
FIXED (1): T16 algorithm register rows — schema, seeding and grep-proof finds no hardcoded
           policy anywhere on the real consumer surface
NEW (0)
```

It is **T6B's charter item 4**, and it is the intended result rather than a side effect: a
comment introduced by the T7B change explained a defect by quoting the sealed movement value
`0.25`, and the T16 guard forbids a hardcoded policy value on the consumer surface. T6B reworded
the comment to name the quantity without the number and filed the RED-at-base proof
(`1 failed | 9 passed (10)`, EXIT 1) beside the GREEN-at-tip (`10 passed (10)`, EXIT 0). The
+20 in the total is S08's `t12-t13-band-basis.test.ts`.
RULED IN ADVANCE, so the batch does not have to discover it: **D15 batch b10 will report this
name as VANISHED from T0's stable-red authority, and that is CORRECT.** A vanished name is
normally a red flag — it means the authority is stale or a test stopped running — so it is being
ruled here, with its cause and its RED/GREEN proof named, rather than waved through when the
classification prints. The authority set for b10 onward is **22 stable-red**, not 23.
This is the `--allow-fixed` case from D48 arriving in real life. The zone gate passed WITHOUT
that flag only because the fix is visible identically on both sides of the zone comparison; the
BATCH comparison is against T0's frozen authority, where it is genuinely a change and must be
ruled. Same fact, two comparators, different correct treatments.

## 2026-09-02 21:1x EEST · D55 — tools/cite-check.py: an anchor must be proven UNIQUE, because the cure for D53 reproduced the disease
Merge review 5 found that T3C's D53 repair used `grep -n <anchor> | head -1`: it recorded a
first match and never counted matches. Three filed anchors are not unique at this tree —
`stoppingPolicy` matches 2 sites, `PANEL_WEIGHTING_UNRESOLVED` matches 4, and
`VERDICT_LABEL_CONTROLS_UNRESOLVED` matches 2 — so the anchors identify nothing, and a future
insertion could silently change which duplicate `head -1` picks without any gate failing. The
numbers filed happen to be right today. **The cure for silent expiry had acquired a silent
expiry**, which is the third time this evening a check has carried the defect it was built to
catch (D50's dead manifest, D52's shim hash, now this).
RULED: `tools/cite-check.py` is the mission's citation checker. Exit 0 requires EVERY anchor to
match exactly ONE site in its file; it exits 1 on any anchor matching zero or two-or-more, and
2 on unusable input including an empty anchors list. It emits a record carrying the measured
checkout's own commit and tree, so a citation record binds its tree exactly as a gate record
does, and prints the resolved `path:line @tip` for each unique anchor.
**It matches against the WHOLE FILE, not line by line, and that is load-bearing rather than
tidy.** Some sites are genuinely indistinguishable on one line: `apps/runner/src/index.ts` holds
FOUR identical `"PANEL_WEIGHTING_UNRESOLVED",` lines, so no single-line anchor can ever be
unique there. A checker able to match only within a line would have been useless for exactly the
citations that most need one. Anchors may therefore span lines via a literal `\n`.
SELF-TESTED BEFORE RULING, and against the reviewer's own counterexamples: the three anchors it
proved ambiguous FAIL with all their sites listed (2, 4 and 2, reproducing the reviewer's counts
exactly); an absent anchor fails; a missing file fails; an empty anchors list refuses; and all
SIX previously-ambiguous sites resolve UNIQUE, exit 0, when anchored on the line plus the next
taken verbatim. The approach is demonstrated workable, not merely specified.

## 2026-09-02 21:2x EEST · D56 — a check that cannot fail for the reason it exists (three instances in one evening)
Naming the pattern, because it happened THREE times between 19:00 and 21:00 and twice it was
mine. Each was a mechanism that LOOKED like verification, was cited as verification, produced
confident output, and could not fail for the reason it was built:
 · **D50** — `mutant-index` advertised an expected-manifest argument and never read it. It would
   have confirmed 19/2 while one product mutant turned GREEN and one neighbour turned RED.
 · **D52** — `gate-run` v2 hashed the pnpm SHIM, which differs between worktrees by generation
   order. It could not detect a swapped compiler, and it MANUFACTURED false suspicion of one:
   two seats lost real investigations to it.
 · **D55** — the D53 citation repair used `grep -n | head -1`, recording a first match and never
   counting. Three anchors matched 2, 4 and 2 sites, so they identified nothing, while the
   record asserted every anchor resolved uniquely.
THE COMMON SHAPE: the mechanism reports on the HAPPY PATH and has no branch for the failure it
is named after. `head -1` always succeeds. An unread argument never disagrees. A hash always
differs from something. None of the three could ever have printed "no".
RULED, and this is the practical test to apply before citing any check as evidence: **construct
the input that SHOULD make it fail, and run it.** If you cannot name that input, the mechanism is
not a check and must not be described as one. Every mission tool is now self-tested against its
own refusal arms before it is ruled — `zone-set-equality.py` against a fixed baseline failure,
`mutant-index.py` against a flipped manifest entry and an exit 127, `cite-check.py` against the
reviewer's three ambiguous anchors, `gate-run.sh` v3 against a cross-worktree comparison. Where a
tool's refusal arm is untested, the tool is provisional and says so.
FOR THE CLOSURE NOTES, beside D51 and D53: D51 says generate the claim. D53 says a generated
claim can decay. D56 says the GENERATOR ITSELF must be shown capable of refusing. All three were
learned here at the cost of real rounds, and the third is the one a future mission is most likely
to skip, because a tool that has just produced a plausible answer feels proven.

## 2026-09-02 21:2x EEST · ORCHESTRATOR ERROR — I merged into the worktree a batch suite was measuring
Recording this as mine, plainly. I started D15 batch b10 in the integration worktree at 20:43:41
against tip `53c4ccf9`, and at roughly 20:49, while it was still running, I merged `lane/t3c`
into that same worktree. Every file the merge touched — `apps/runner/src/index.ts` and
`packages/serve/src/index.ts` among them — was replaced under a suite already in progress. Tests
that ran before the merge measured `53c4ccf9`; tests that ran after measured `19bbb4c4`; nothing
in the output distinguishes the two. The run is not a weak result, it is an UNINTERPRETABLE one.
Killed and preserved as `logs/integration-suite-b10-VOID-tree-changed-mid-run.log` with a header
saying why, rather than deleted or quietly re-run — capture-before-destroy applies to my own
mistakes.
**D38 already rules that a campaign takes the worktree EXCLUSIVELY.** I wrote that rule for
seats and then broke it myself within the hour, because I was thinking of the merge as bookkeeping
rather than as a write to a directory something else was reading. That is the same category error
as D51: the merge's EFFECT is what matters, not how I was classifying the action.
STANDING RULE, tightened: before any merge into the integration worktree, check that no suite is
running there — `pgrep -f 'd15-suite|vitest'` — exactly as before amending a shared tool (D52
ADDENDUM-2). The integration worktree has two writers now, the batch and the merge, and they must
be serialised. Re-running as b11 against `19bbb4c4`, which is better scoped anyway: it covers all
THREE lanes {S08, T6B, T3C} instead of two.

## 2026-09-02 21:3x EEST · the lane watchdog was retired, and it was probably half-blind the whole time
Retired the `s06/t3c/s07` watchdog: it fired STALL on three lanes that are not stalled — s06 and
t3c are MERGED, s07 is correctly parked on a V decision. A monitor that alarms on completed work
does not merely add noise, it trains the reader to discount the alarm that matters, so it was
stopped rather than left running.
Reading its source on the way out shows something worse and familiar: it used `declare -A` for
its marker and stall maps. The system bash here is 3.2, which has no associative arrays — the
same defect that broke my `mutant-index` bash rewrite hours later (D50). Its STALL path used only
`find -newer` against a stamp file and worked; its MARKER path depended on the associative map
and, as far as the session record shows, never emitted a single MARKER line. Every marker I
actually acted on this evening arrived through task notifications instead, so nothing was lost —
but I was carrying a monitor whose primary job had probably never worked, and I never tested it
by feeding it a marker.
D56 AGAIN, in the monitoring layer this time: a watchdog that has only ever printed one KIND of
line has not been shown able to print the others. The cheap test — write a marker line into a
watched report and confirm the watchdog says so — was never run, by me, for the whole mission.

## 2026-09-02 21:4x EEST · D54 CORRECTION — my prediction was wrong; the authority stays 23, and the batch is right
D54 ruled that batch b10/b11 "will report this name as VANISHED from T0's stable-red authority,
and that is CORRECT", and that "the authority set for b10 onward is 22 stable-red, not 23".
**Both statements are false.** b11 reports 0 VANISHED, 23 stable-red still failing, 0 NEW, and
that is the correct result.
WHY I WAS WRONG. The T16 hardcoded-policy guard appears NOWHERE in T0's baseline: it was not one
of the 23 stable-red names, because at T0's baseline (`dev @1c9578a`) it was not failing at all.
Its entire red life happened INSIDE this mission — T7B's change introduced a comment quoting the
sealed value `0.25`, which made the guard fail, and T6B reworded the comment, which fixed it. A
defect created and cured between two mission tips never touches a baseline frozen before both.
THE ERROR IS THE ONE THIS MISSION KEEPS RULING ON. I observed a real fact in the ZONE comparison
(baseline failures 14 → 13 between `44836ecf` and `53c4ccf9`) and carried it to a DIFFERENT
comparison — T0's frozen full-suite authority — without checking that the name existed in the
second set. Two comparators, two baselines, two different tips; I reasoned about one and asserted
about the other. That is D51's shape exactly, committed by the judge, in a ruling written
specifically to prevent a false alarm.
WHAT SURVIVES: the causal analysis was right and independently confirmed by the reviewer — the
14 → 13 change is T6B commit `cbd09de1`, not S08. What does not survive is the inference I drew
from it about a set I had not checked. The authority remains **23 stable-red + 5 unstable**.
COST: none, because the batch checks mechanically and disagreed with me. That is the argument
for the batch existing, and for classifying rather than asserting.

## 2026-09-02 21:4x EEST · D15 BATCH b11 — GREEN, SET-EQUAL, three lanes land
Integration `19bbb4c4` (TINT1, T6, S06, T7, S08, T6B, T3C). `Tests 23 failed | 2048 passed (2071)`.
Classification against T0's authority: **NEW 0 · VANISHED from stable-red 0 · stable-red still
failing 23 · unstable-family failing 0.** Set-equality by NAME, not by count. S08, T6B and T3C
introduce no regression and mask no pre-existing failure.

## 2026-09-03 · V RULING — T9B AUTHORIZED
V authorizes the staged T9B lane (V-S07-CODEX-r4-1 and r4-2 together). Dispatching the ticket
and packet already written at `board/T9B-role-predicate-binding.md` and
`packets/t9b-role-predicate.md`. Both halves land: the role becomes a PREDICATE derived inside
persistence from typed role + stage + round through one shared builder, with real-pair negative
arms; and the two wrong-cause mutants are rebuilt so each dies on its own assertion, emitted
through `tools/mutate.sh`. This unblocks the closing run.

## 2026-09-03 · V RULING V-S11-1 — BEST OUTCOME UNDER CONSTRAINTS, NOT A RULE FOLLOWED TO THE BONE
V did not pick either option I offered, and was right not to: both of mine assumed the choice was
between refusing and silently weakening. **The ruling is a third thing, and it is general policy
rather than an S11 workaround.**

V's statement, in force:
 · **If only one model is available, the whole debate runs on one model.** That is a legitimate
   configuration, not a failure state, and the engine must produce the best debate it can inside
   it rather than refusing to run.
 · **The model is spawned as a NEW INSTANCE for every task, each with its own role**, and the
   PROMPT handed to it is "the real secret sauce" — what makes that instance do that particular
   task as well as it can be done. One model at maximum capacity means different, stage-specific
   prompts, always in a fresh session, never one session carrying several roles.
 · **Same-model provenance is RECORDED, never hidden.** We still take into account that each step
   was done by the same model or family, and it is disclosed.
 · **"Graded by another AI" stays the preference — "if possible" is part of the rule, not an
   escape from it.** It is a preference to satisfy where the deployment allows, not a
   precondition for running.
 · **Explicitly anticipated and permitted:** once per-model benchmarks exist, the best grader for
   a task may BE the same AI that produced it, if that is genuinely the best grader available at
   acceptable cost; or the second-best model may be chosen for grading. Neither is forbidden.
 · **The governing instruction, verbatim in intent:** this "strict" rule should not be followed
   to the bone. Aim for the best possible outcome for a debate GIVEN THE CONSTRAINTS — whether
   the constraint is a single available model or a cost ceiling that puts the same cheap model in
   several seats.

CONSEQUENCE FOR S11, which is what changes today. The harness must NOT hard-refuse with
`EVAL_BLIND_GRADER_POOL_INSUFFICIENT` when fewer identities are sealed than the strict reading
wants. It selects the best grader assignment available, RUNS, and DISCLOSES the degradation with
a visible mark naming what was compromised and why — exactly the shape already ruled for a
sealed role in V-ROLE-1/J24: a disclosed substitution is acceptable, a SILENT one never is. Goal
line 26's law that every degradation or skip emits a visible condition mark covers this
directly. No fourth provider identity needs to be sealed for T15 to run.

FUTURE WORK, V said "not for this round" and it is recorded so it is not lost: adapt each
stage's prompt to the specific model that will execute it, from what is known about that model's
strengths and weaknesses — a per-model, per-stage prompt library rather than one prompt per
stage. This becomes tractable once per-model benchmarks exist, and it is the same body of work
that would let the engine choose which model to put in which seat at a given cost ceiling.

## 2026-09-03 · V RULING V-S11-3 — T15 closes on the harness, the projection and the refusal
No recorded debates exist on this host and the goal forbids generating new ones in this lane, so
T15's DoD rows close on the built harness, the printed projected call count, and the TESTED
spend refusal. No provider call is made and none is authorized. This stands independently of the
V-S11-1 ruling above.

## 2026-09-03 · V RULINGS — S09B follow-up and T1's oracle BOTH AUTHORIZED
V-S09-CODEX-S09B-1 and S09B-2: **authorized together as ticket T17B.** The two equality contexts
stop sharing a branch — a refused pending attempt at `consumed == max` must be represented
truthfully without reverting J28's successful-terminal WITHIN state, asserted through the runner
wrapper — and the receipt parser gains r3's second cross-field check, which my packet dropped.
Note for the record: the V row said the fallback was "envelope merges with the boundary
half-applied", and I corrected that framing before V decided. The envelope is NOT optional: the
Global DoD (`slices/S12-closure/SPEC.md:41`) requires "envelope state WITHIN at terminal" in the
flagship run, so the envelope merges either way and the only question was whether it merges
correct. V chose correct.
V-T1-r3-1: **authorized as micro-ticket T1B**, explicitly not a fourth T1 round. The line-scoped
oracle is replaced with a layout-independent one; the three evasions the reviewer reproduced —
a multiline Zod chain, a split refinement, a multiline enumeration — become RED-first tests.
T1's converged product semantics are frozen: this changes the ORACLE, not the ceiling. `lane/t1`
is 102 commits behind integration, the largest catch-up left, and that merge-in is not charged
as rework.

## 2026-09-03 · T9B BLOCKED — and my own S08 verdict is where this should have been caught
The T9B seat stopped at its packet's step 0. The merge of integration into `lane/s07` resolves its
six conflicts cleanly and then fails typecheck with 12 errors, all in S08's landed
`t12-t13-band-basis.test.ts`. Measured both directions: lane alone typechecks exit 0, merged exit 1.
The cause is a DESIGN CONFLICT (F-T9B-1), not a bad merge. Integration mints three conformance
states and carries three `conformance.every` guards; T9 mints ONE state, sets `conforms` from a
single `citationTracing` boolean, and carries ZERO guards, because T9 deliberately retired sampling
— its own comment: "the evaluator traces every load-bearing claim, so the coverage is exhaustive by
construction — there is no sample any more." Verified: `selectSample`/`strangerSampleRate` appear
4 times in integration and 0 in lane/s07.
**MY DEFECT, recorded plainly.** In the S08 judge verdict I examined that exact predicate, found
`state !== "NOT_SAMPLED"` safe ONLY because of the every-conforms guard thirty lines above it, and
wrote "that coupling is worth a comment; it is not worth a round." I then wrote into the record
that whoever moves either piece must move both — and never asked whether an unmerged lane had
ALREADY moved both. T9 moves both, and it was sitting in a worktree while I wrote it. Checking one
tree and generalising to the mission is the same error as reasoning from a diff instead of a call
path (D51), committed by the judge in the act of praising the coupling.
The consequence I missed is worse than the failing test: under T9 there is no guard, so a run whose
`citationTracing` criterion is FALSE still has its citations counted into the confidence band.
Nothing fails; the band is computed on evidence the evaluator rejected.
NEITHER LANE IS WRONG. S08 is right where segments are sampled; T9 is right where the evaluator is
exhaustive. Resolving it means retiring a landed assertion or changing a reviewed design, and the
standing law forbids the orchestrator doing either. On the V packet as F-T9B-1 with three options.
The seat left the lane byte-for-byte as declared, did not commit a non-compiling tip, preserved the
six-conflict resolution as a stamped patch, and reported its absent artifacts as ABSENT.

## 2026-09-03 · V RULING F-T9B-1 — option (a): T9 CARRIES THE SAFETY PROPERTY FORWARD
V rules that T9's exhaustive-coverage design stands and must preserve what S08's guard protected,
expressed in T9's own vocabulary rather than by restoring a state the evaluator no longer produces.

**AUTHORIZED, and the boundary is narrow:**
1. T9 gains a guard that returns `componentsOnly` when the evaluator's `citationTracing` criterion
   is FALSE — the same protection integration gets from `conformance.every(j => j.conforms)`,
   reached through T9's single criterion instead of through three sampled states. A run whose
   citation tracing failed must NOT have its citations counted into the confidence band.
2. **Exactly ONE landed assertion is retired**: S08's
   `it("excludes the citations of a segment conformance never verified")`. It pins a state the
   shipped design no longer produces, so it is retired ON THE RECORD — deleted with a comment at
   the site naming this ruling and saying why, never quietly dropped — and the retirement is
   stated in the filing.
3. S08's cited-set filter itself STAYS. Under T9 the `state !== "NOT_SAMPLED"` test is simply
   always true; it is harmless, it costs nothing, and it remains correct if a sampling path ever
   returns. Do not delete it as dead code.

**NOT AUTHORIZED, and this is the boundary that matters:** this ruling retires ONE named assertion
for ONE stated reason. It is not licence to weaken, relax, rename or delete any other landed
assertion to make the merge green. Any further conflict is a finding filed and stopped on, exactly
as before. The 8 arms the seat classified CANNOT-ASSESS (they reference retired dependency members
but no retired CONCEPT) are to be PORTED to the new member names, not retired — if one of them
turns out to pin a retired concept too, that is a new finding and a new V row, not a second
retirement under this one.
The original T9B charge is unchanged and follows: the role becomes a predicate derived inside
persistence, with real-pair negative arms, and the two wrong-cause mutants are rebuilt.

## 2026-09-03 · S11 codex r2 REWORK — and F-S11-4 needed no new V row, because V had already ruled it
Three blocking findings, all sound.
**B1 — the one-model path still hard-refuses, EARLIER than the fix.** `deriveCandidateConfigs`
throws `EVAL_CANDIDATE_CONFIGS_INSUFFICIENT` before `assignBlindGraders` is ever reached, so a
coherent one-identity deployment never gets to the corrected grader logic. The reviewer's words:
declining to extend was "procedurally cautious but substantively wrong" once V-S11-1 declared
one-model operation legitimate AND declared the policy general.
**That judgement is right, and the miss is MINE as much as the seat's.** V's instruction included
"also for other places where this 'rule' is in place" and "this strict rule should not be followed
to the bone". That IS the authorization to extend. The seat filed the question, I endorsed the
caution and mirrored it to the V packet as F-S11-4 — treating a general ruling as if it were
narrow. Re-reading V's words, no further decision is needed: **F-S11-4 is CLOSED BY V-S11-1** and
goes to the seat as r3 work, not to V as a row.
**B2 — the confound is real and disclosure does not cure it.** Complement selection makes grader
identity a deterministic FUNCTION OF THE ARM, and the repetition then gives that arm-specific model
two correlated observations and twice the apparent grade count. C1 and C2 are graded twice by Grok,
C3 twice by Codex. `renderComparisonTable` still renders a pooled numeric mean and puts the
non-commensurability warning AFTER both tables. As the reviewer puts it: a warning discloses invalid
comparability, it does not restore it. Either use a counterbalanced or paired estimator that
separates grader effects from arm effects, or SUPPRESS cross-arm ranking entirely and state plainly
that no role choice can be inferred.
**B3 — the provenance V required is asserted but not represented.** `sameModelAsCandidate` is
computed from provider-REF equality, not model identity, and the CLI actively drops model
information when building the input. The table nonetheless prints "same-model yes/no", and the
disclosure asserts repeated seats are fresh instances. V's ruling requires exactly these two facts
to be recorded and disclosed — so the harness currently claims the thing V asked for without
carrying the data that would make it true. Two provider refs backed by the same actual model report
`sameModelAsCandidate: false` today.
This one is a direct consequence of V's own ruling and it sharpens the FUTURE-WORK item: a
per-model, per-stage prompt library needs an adapter contract that creates a new session per call,
carries an explicit stage prompt, and returns observed provider, model, version and a per-call
instance reference. Until that exists, the artifact must not state fresh-instance or exact
same-model facts as known.

## 2026-09-03 · F-T9B-1 IMPLEMENTATION — option 2, and my ruling named a MECHANISM where V ruled a PURPOSE
The T9B seat implemented the ordered `citationTracing` guard exactly, ran it, and it breaks two
landed assertions — one of which is the FROZEN GOAL'S OWN DoD ROW transcribed:
`no NON-CRASH path returns COMPONENTS_ONLY`, plus an exact-set pin that closes COMPONENTS_ONLY at
four crash classes (transport death, no-artifact, digest-cannot-exist, envelope exhaustion). The
goal explicitly RE-ROUTES the old conformance gate to an evaluator-objection criterion. So the
guard I specified re-terminalises the very gate the goal re-routes and adds a fifth member to a set
the goal closes at four.
**MY DEFECT.** When I wrote V's ruling into DECISIONS I specified a MECHANISM — "a guard that
returns `componentsOnly`" — borrowed wholesale from INTEGRATION's vocabulary, without checking
whether T9's frozen goal still permits a non-crash `componentsOnly` path. It does not. V ruled a
PURPOSE, which I recorded correctly in the same entry: *"A run whose citation tracing failed must
NOT have its citations counted into the confidence band."* The purpose is satisfiable; the
mechanism I named is not. This is the third time this mission that I have reasoned about one tree
and asserted about another (D51's shape) — after the S08 predicate and the b11 authority prediction.
RULED: **option 2, and it needs no new V decision because it achieves V's stated purpose without
touching anything V did not authorize.** `conforms` becomes a real axis of S08's cited-set filter:
an untraced segment contributes NO citations to the band, while the statement still SERVES carrying
its standing objection. That is V's sentence implemented verbatim, and the goal's enumeration is
left untouched. Where EVERY segment is untraced the cited set is empty and S08's existing
`SERVED_STATEMENT_CITES_NO_VERIFIED_NODE` throw fires — a loud refusal rather than a silent band,
which is the behaviour S08 designed for that case and is honest.
Option 1 (add `CITATION_TRACING_FAILED` as a fifth crash class, repin the exact set, and correct
the DoD row and two prose claims) remains available but is a GOAL OVERRIDE and therefore V's alone.
The seat was right that "an override made without sight of what it overrides is worth one line of
confirmation before it becomes code" — it is flagged to V, not taken silently.
The seat implemented, measured, reverted cleanly (33/33 restored, porcelain empty), filed both
costed paths and DID NOT choose. That is exactly right.

## 2026-09-03 · what a mutant taught the T9B seat about its own campaign
Recording because it is D56 arriving from a direction the tooling cannot cover. B1M1 neutralised
the seat's new equality check and SURVIVED — the ledger lookup resolves by the DERIVED key, so the
equality assertion was decorative against every arm it had written. The arm that discriminates (one
artifact recorded at BOTH role call sites) did not exist until the mutant demanded it.
And its first campaign pass reproduced B2's exact defect: two mutants died on `WAIT_DRAIN_REQUIRED`
because the seat fixed its own arms and not the older ones they kill. **`mutant-index.py` called
that campaign CLEAN** — correctly, because it proves FORM (custody, exit classification, manifest
agreement) and not CREDIT (that the death was caused by the assertion claimed). The tool is not
wrong; its contract is narrower than it looks, and D43 is the rule it cannot enforce. Worth stating
in the closure notes: a clean index is necessary and not sufficient.

## 2026-09-03 · D57 — stamp-check's contract is "measures the filed state", NOT "every file stamps the filed tip"
Running `stamp-check.sh` over T17B's `t17b-` prefix returns **29 records, 22 failures**, and every
one of those failures is CORRECT BEHAVIOUR by the tool and NOT a defect in the lane. I chased it
before I understood it, and compared the wrong pair of commits on the way.
The records legitimately stamp FIVE different tips, because a multi-commit lane cannot honestly
put them all at one:
 · `5bf8960f` — post-merge baselines, measuring the merge BEFORE any fix.
 · `59f23153` — the B1 RED and its typecheck. **A RED record cannot stamp the filed tip**: it is
   taken before the fix exists. Demanding otherwise would require re-running RED after GREEN,
   which is not RED at all.
 · `0f04fecd` / `ab2f508c` — the B2 RED/GREEN pair and the seven mutant transcripts, at the tip
   the campaign actually ran against.
 · `55354f4f` — the filed tip: typecheck, the three cluster runs, zone, cite-check, and M6b.
RULED: D41's contract is that a record binds THE CHECKOUT IT MEASURED — which `gate-run.sh` and
`mutate.sh` both already emit. `stamp-check.sh` answers the narrower question "does this record
stamp the filed tip", which is the right question for a set captured in one pass at the end (T3C's
r11, S08's r5) and the WRONG question for RED evidence and for a campaign run mid-lane. Applying
it to those and reading the failures as defects is a checker misuse, and it was mine.
THE OBLIGATION THAT REPLACES IT, and the seat discharged it exactly: when a record binds an
earlier tip, the lane must PROVE the measured code still applies at the filed tip. T17B did —
`git diff ab2f508c 55354f4f` over `packages/budget` and `packages/register` is EMPTY, so the
production files the mutants attacked are byte-identical between the campaign and the filing, and
the only change is +21 lines in `tests/unit/t17-envelope.test.ts` (the additive M6b pin). The
mutant results still bind, and that is shown rather than asserted.
FOR REVIEWERS: do not run `stamp-check` over a whole lane prefix and report the failure count.
Run it over the set that CLAIMS to measure the filed tip, and for every earlier-tip record require
the lane's proof that the code under measurement did not move.

## 2026-09-03 · JUDGE VERDICT — T15 / S11 (eval harness + T15b role decision): PASS; merge-in owed
**Verdict: PASS.** Codex r3 APPROVE, zero blocking, after three rounds that each found something
real. The lane is fit to merge once it takes the current integration tip.
**What I verified myself, not from the reviewer.** Zero live references to either removed refusal
across `packages`, `apps`, `tests` and `acceptance`; 31 records stamping the filed tip; the
20-mutant campaign deriving CLEAN against a manifest the seat wrote FIRST; the comparability check
present and the provenance type genuinely tri-state.
**What the lane actually achieved, against V's ruling rather than the frozen text.** A one-model
deployment now runs end to end: one identity yields ONE arm rather than three fabricated copies,
the reduction is marked, the projection is REVISED rather than silently shrunk, and the filed path
reaches `REFUSED_AWAITING_APPROVAL` with zero provider calls. When panels differ the table renders
no pooled mean and no ranking — a test feeds it scores of 5 and 1 and asserts neither survives as a
statistic. Provenance answers UNKNOWN rather than NO where the data does not exist, and the
fresh-instance claim was WITHDRAWN rather than defended.
**N1 is an obligation on ME, not on the seat.** The credit artifact holds 82 `killed by:` lines but
one is a survivor sentinel, and the transcripts carry exactly 81 failing-test records. Worse, not
all 81 are D43 credits: the projection-order test hard-codes `refusalIndex === 12`, so m14, m17,
m18 and m19 are "credited" to it only because changing the number of emitted marks moves the index
— none of them moves the projection relative to the refusal. **The closure record must use 81, must
say which credits are index-artifacts, and must not repeat the 82-credit or the
m17-kills-18-assertions claim.** Recorded here so it cannot be inherited silently.
This is the third time tonight a credit claim has been wrong while the campaign was CLEAN
(S07's R5M1/R5M2, T17B's M6, now these four). D43 remains the rule no tool here enforces, and
`mutant-index.py` proving form rather than credit is the closure note that matters most.
**N2:** two introductory comments still state the RETIRED strict policy while the code below them
implements V's. Comment drift, fixed at the next edit, not a blocker.
**Owed before merge, not a rework round:** lane/s11 is 21 commits behind integration `19bbb4c4`.

## 2026-09-03 · JUDGE VERDICT — T17B (envelope refusal boundary + receipt invariant): PASS; lane MERGES
**Verdict: PASS.** Codex returned CHANGES with **0 blocking**, stating the product lane is fit to
merge; both its own S09B blockers are closed and its two tickets correct explanatory and process
records rather than behaviour. The reviewer confirmed what no tool of mine can: **the six killed
mutants have the causes credited to them** — unlike S11's campaign, where four credits proved to be
index artifacts.
**What I verified before merging.** Integration `19bbb4c4` is merged in; the lane tip is clean; no
suite was running in the integration worktree.
**TWO FALSE ALARMS OF MINE, both worth recording because both are checks misfiring in the direction
of alarm.**
 1. My pre-merge guard `pgrep -f 'd15-suite|vitest'` reported a suite running. It had matched the
    CODEX process, whose command line contains the review packet's text mentioning those tools.
    This is the SECOND time tonight that guard has matched a packet rather than a process. The
    precise form is `pgrep -f 'node.*vitest'` plus reading each match's CWD — which showed the real
    suite was in `lane-s11`, not integration, so the merge was safe.
 2. My "every line integration added is still present" check reported 13 missing. All 13 are
    integration's OLDER envelope code — `formula_version: "DR-184-v2"`, the v2
    `maxModelAttempts` derivation, `per_site_attempts` — which this lane deliberately REPLACED with
    DR-184-v3 at `44834a6c`. The check assumes integration's additions are things the lane must
    preserve; where the LANE is the newer authority on a file, integration's "additions" relative
    to the lane's base are the very code the lane exists to supersede. **The check is sound only
    when lane and integration touch different code**, and I have been reading it as universal.
Neither false alarm cost a round, because in both cases I read WHAT matched instead of acting on
THAT something matched — which is the same discipline D56 demands of a tool.

## 2026-09-03 · MERGE — lane/s09 (T17B) → integration
Envelope boundary and receipt invariant land. Integration: 6118d2d5 → 362299d1 → 1fad4e16 → 44836ecf → ee1afadd → 53c4ccf9 → 19bbb4c4 → **152ed7ed** (TINT1, T6, S06, T7, S08, T6B, T3C, T17/T17B — EIGHT lanes).

## 2026-09-03 · T1B codex CHANGES — the reviewer drew the line I asked it to draw, and drew it correctly
I asked the reviewer to decide whether the seat's four DISCLOSED blind spots were acceptable
residuals or findings. It separated them on a principle worth keeping: **df1-df3 (constant
indirection, arithmetic and hexadecimal spellings of the ceiling) need predicate expansion, symbol
resolution or constant folding — capabilities V froze out of a unit-only micro-ticket. df4 is
different in kind: the SAME expression is caught on one line and missed when wrapped at `&&`.**
```ts
const ok = isDepthField(v) && v <= 5;   // caught
const ok = isDepthField(v) &&
  v <= 5;                                // shipped oracle returns []
```
That is layout dependence — precisely what T1B exists to eliminate — so it is blocking, and the
seat's OWN defeat transcript proves it through the shipped path. The lexer flushes at `&&` when
the operator sits at the unit's starting bracket depth, so the unit pass emits two fragments,
one carrying `depth` without a ceiling and the other a ceiling without `depth`.
**The seat earned this finding by disclosing it.** Had it claimed completeness the reviewer would
have had to find df4 unaided; instead the seat ran four inputs designed to defeat its own oracle
and filed all four as undetected. D56 working exactly as intended — and note that disclosure did
NOT make the defect acceptable. Disclosing a gap does not close it; it makes the gap reviewable.
Rework 1 of 3 on T1B, not a fourth round of frozen T1. The four predicates and T1's product stay
unchanged; only the oracle's unit boundary moves, and the measured `page.tsx` negative control must
be retained so the fix does not reintroduce the false positive it was traded against.
**N1:** the worst-run verdict (`14 failed / 1431`) is HONEST and confirmed; the stronger six-run
and ownership claims are not fully supported by retained artifacts and get narrowed.
**N2, which lands on a method I praised:** the seat's merge check compared SORTED added/deleted
line sets in both directions, and I reported that as verification "by meaning". The reviewer is
right that it is a CONTENT CHECKSUM, not a semantic proof — equal line multisets can still be
assembled into different code. The actual merge is sound (direct parent/final inspection finds
both import intents and no test edit or deletion), so the conclusion holds while the method claim
does not. I repeated the seat's framing without testing it, which is D51 again.

## 2026-09-03 · T9B codex CHANGES — OPTION 2 IS ALSO WRONG, and both mechanisms were mine
The reviewer finds option 2 blocking, and it is right. Under it, a run whose final evaluator
verdict has `citationTracing: false` and its neighbouring criteria true is EXHAUSTED by
`runSynthesisLoop`, which returns the candidate with its standing objection — matching its own
source contract that the caller serves the final candidate regardless. `runServeGateChain` then
copies those final criteria onto every segment, the new `&& judgement.conforms` filter removes
every judgement, the cited set empties, and `SERVED_STATEMENT_CITES_NO_VERIFIED_NODE` throws
BEFORE any terminal answer or visible mark is returned.
The frozen goal says, at the lines T9 implements: **"after round 3 SERVE regardless; standing
objection → visible condition mark"**, and its DoD separately requires an evaluator-unsatisfied
three-round run to SERVE WITH an objection mark. Option 2 makes one criterion fatal where the
goal makes it visible.
**BOTH MECHANISMS I SPECIFIED TERMINATE THE ANSWER, AND V'S PURPOSE NEVER ASKED FOR THAT.** V
ruled: "A run whose citation tracing failed must NOT have its citations counted into the
confidence band." That forbids BANDING on rejected evidence. It does not forbid SERVING. I
proposed `componentsOnly` (which the goal's four-class enumeration forbids) and then, after that
collision, an empty cited set (which throws). Twice I reached for a mechanism that kills the
answer when the ruling only barred the band.
**THE BOUNDARY WAS CROSSED, AND MY MECHANISM FORCED IT.** The reviewer's answer 1: structurally
only the one authorized block was removed, but SUBSTANTIVELY two of the three re-pins remove the
landed guarantee that an exhausted citation-tracing objection serves. The seat did not overreach —
it re-pinned exactly what option 2 broke, and option 2 broke that guarantee because I specified it.
**WHAT THE REVIEWER SAYS IS ACTUALLY NEEDED** — and it is the shape V's own words describe:
restore a MARKED SERVED outcome that cannot form a band from untraced citations. Serve the
statement, emit the visible condition mark, and let the confidence band be absent rather than
computed from evidence the evaluator rejected. That satisfies the goal's "serve regardless", the
goal's "standing objection → visible condition mark", the four-class enumeration, AND V's
sentence about the band, all at once. Neither of my two mechanisms could do that because both
answered "what terminal?" when the question was "what band?".
CONFIRMED GOOD in the same review, and worth keeping: the role predicate is genuinely a predicate
(the expected key is derived from typed role, stage and round and compared BEFORE the lookup, and
the ledger query resolves that derived key); and all four mutation credits are valid — B1M1, B1M2,
B1M3 and F1M1 each fail at the assertion that directly observes the mutated invariant, none
through the earlier `WAIT_DRAIN_REQUIRED`, `23514` or `42P18` detours, with both neighbours
matching the prewritten manifest. This lane's campaign is the clean one.
Routed to V as V-S07-CODEX-T9B-1. I am not choosing a third mechanism unilaterally after being
wrong about two.

## 2026-09-03 · V RULING V-S07-CODEX-T9B-1 — serve, mark, and FLOOR the band; mapped onto the real vocabulary
V ruled: "Serve, mark, band floored to UNSUPPORTED — gives consumers a value rather than an
absence, at the cost of asserting a confidence claim about a statement whose evidence the
evaluator rejected."
**I checked the vocabulary before specifying a third mechanism, having been wrong about two.**
V's phrase crosses two vocabularies that this engine keeps separate, and the mapping matters:
 · **LABEL** — `"SUPPORTED" | "CONTESTED" | "UNSUPPORTED"` (`serve/src/index.ts:806`), T11's
   three-state verdict. `UNSUPPORTED` is a LABEL value.
 · **TERMINAL / band** — `"SERVED" | "CAPPED" | "DOWNGRADED"` (`:628`, `:636`), a different ladder.
   `UNSUPPORTED` is NOT a member.
**The label must NOT be forced, and forcing it would be a second goal override.** Confirm-item 3
rules explicitly NO on whether a standing round-3 objection moves the label, and the frozen S06
spec requires the label to be "Code-only derivation, computed BEFORE synthesis from the propagated
numbers (acyclic … the round-3 objection is a mark, not a label input, by default)." An objection
reaching back to change the label is precisely the cycle that clause exists to prevent.
RULED, as the faithful reading of V's intent — "a value at the floor rather than an absence":
 1. The run **SERVES**. The goal's "after round 3 SERVE regardless" holds.
 2. The standing objection emits its **visible condition mark**. The goal's disposition holds.
 3. The terminal is **`DOWNGRADED`**, the floor of the terminal ladder — which is T13's OWN honest
    downgrade, the mechanism S08 already built. No new terminal, no fifth crash class, no change
    to the four-class enumeration.
 4. The **band basis carries no untraced citation**. V's original sentence holds: nothing is
    banded on evidence the evaluator rejected.
 5. The **LABEL is left to its code-only derivation**, untouched.
So the third mechanism is not new code at all — it is reaching T13's existing downgrade path
instead of throwing. Both of my earlier mechanisms invented a way to END the answer; this one uses
the way the engine already has to LOWER it.
**Disclosed to V:** I mapped "band floored to UNSUPPORTED" onto terminal `DOWNGRADED` with the
label untouched, because `UNSUPPORTED` is not a terminal value and forcing the label would break
the acyclicity confirm-item 3 preserves. If V meant the LABEL should also be forced to
`UNSUPPORTED`, that is a deliberate override of confirm-item 3 and one line reverses this.

## 2026-09-03 · T1B review 2 — refuting the WIDE window does not establish the NARROW one
The reviewer separates a distinction from a window, and the separation is the finding:
 · **The `5`/`6` DISTINCTION is principled and upheld.** A bare `5` or the enumerated domain IS
   the ceiling, so it can keep the declaration-wide treatment; an exclusive `6` is an inference
   from adjacency to an operator, so it must stay associated with its own comparison.
 · **The chosen WINDOW for `6` is not.** "Comparison-local" does not mean "physical-line-local".
   The seat's m6 mutant disproves only the OVER-WIDE declaration window. **It does not prove the
   UNDER-WIDE line window** — and the principled middle, a comparison or conjunct unit, was never
   tested. Refuting one extreme is not evidence for the other.
The seat's own df5 transcript proves the shipped oracle still changes its answer when a newline is
inserted inside a single comparison (`if (depth <` ⏎ `6)`), and the reviewer found the INVERSE
defect in the retained negative control: joining its lines makes the old line pass manufacture the
very false site the control exists to forbid. So the line window is wrong in both directions, and
the seat had evidence for neither.
**This is B1 again in a smaller costume — the reviewer's phrase — and I asked exactly that
question in the packet.** The answer is that a disclosed residual is not automatically an
acceptable one; whether it is depends on whether it is the SAME defect, and here it is.
Fix stays inside the oracle's unit boundary: give the exclusive-`6` arm a layout-independent
comparison/conjunct unit. T1's product, the four r3 regexes and r3's `kindOf` stay frozen.
**N1:** the two-file assembly CONCLUSION is sound but the proof script is not revision-pinned — it
names an immutable input and reads a mutable ref. The third file is honestly marked
NOT-APPLICABLE and its resolution is correct, but printed conflict lines are not a whole-file
assembly proof. That is the second time this lane's merge EVIDENCE has been weaker than its merge:
the conclusion has held both times.
T1B rework 2 of 3. One round remains.

## 2026-09-03 · T9B review 2 — MY MAPPING DELIVERED THE ABSENCE V EXPLICITLY REJECTED
Two blocking findings. The first is mine, and it is the fourth time I have specified a mechanism
from an incomplete check.
**B1.** V chose the option whose text reads "gives consumers a VALUE rather than an ABSENCE." My
mapping produced `confidenceBand: null`, `bandCeiling: null` and a `BAND_CEILING_UNBANDED` mark —
a deliberate absence, which is the option V did NOT choose.
**HOW I GOT THERE.** I searched `packages/kernel` and `packages/contract` for a band vocabulary,
found ZERO, and concluded the "band" must be the terminal ladder. The band order is
`ENGINE_BAND_ORDER = ["CAPPED", "FULL"]` in `packages/register/src/engine-shape.ts:19` — a file I
never searched. **An empty search result is not a finding.** My own `zone-set-equality.py` refuses
on an empty result for exactly this reason (D48), `stamp-check.sh` refuses an empty glob (D41), and
`mutant-index.py` refuses an empty transcript set (D50). I built three tools to refuse the
inference I then made by hand.
**THE CORRECTED VOCABULARY, verified from source:**
 · BAND: `CAPPED | FULL` — `CAPPED` is the floor. A value, not an absence.
 · TERMINAL: `SERVED | DOWNGRADED | BLOCKED | COMPONENTS_ONLY`.
 · LABEL: `SUPPORTED | CONTESTED | UNSUPPORTED` — and confirm-item 3 plus the frozen S06 spec
   forbid an objection from moving it.
So V's "band floored" maps onto **band = `CAPPED`**, terminal `DOWNGRADED`, label untouched. The
reviewer credits the label protection as correct and says the band substitution was not mine to
make. It is right on both counts, so this returns to V rather than being corrected unilaterally a
fourth time.
**B2 — and the seat's own flag was under-stated, not over-stated.** When tracing fails every
segment is non-conforming, `citedNodes` empties, and `citedNodes.every(n => n.state === "REASONING")`
is VACUOUSLY TRUE. The run enters the all-reasoning downgrade form and throws
`COMPOSITION_CONTRACT_ERROR` whenever the candidate has fewer than two segments. The seat argued
production was consistent because the prompt asks for two segments when cited nodes rest on
reasoning alone — but the reviewer refutes that from the lane's OWN repinned fixture, which cites a
`LOOKED_UP` node, so ONE segment is explicitly within the production contract. The standing mark is
produced by the loop and no served result carrying it is ever returned.
This is the same VACUOUS-TRUTH class S08 guarded against with its empty-basis stop: `[].every(...)`
is `true`, and an empty set silently satisfies a universal. Third appearance of that shape in this
mission.
Required: distinguish "no conformance-verified cited node because tracing FAILED" from "all cited
nodes are REASONING", define the served form for a one-segment candidate under whatever V ratifies,
and regress the schema-valid one-segment case. "Serve after round 3 regardless" must not depend on
segment count.

## 2026-09-03 · V RULING V-S07-CODEX-T9B2-1 and F-T9B-6 — band CAPPED, terminal DOWNGRADED, and the two causes are distinguished
**V-S07-CODEX-T9B2-1: band `CAPPED`, terminal `DOWNGRADED`, label untouched.** The faithful
reading of V's original choice, now that the vocabulary is verified from source rather than
inferred from an empty search. The run SERVES, emits its standing objection mark, reports the band
at its FLOOR — `CAPPED`, a value and not an absence — lands at terminal `DOWNGRADED`, and leaves
the verdict label to its code-only pre-synthesis derivation. No goal override, no fifth crash
class, no breach of confirm-item 3's acyclicity.
**F-T9B-6: distinguish the two causes.** "No conformance-verified cited node BECAUSE TRACING
FAILED" is not "all cited nodes are REASONING". They are currently the same code path only because
`[].every(...)` is vacuously true over the emptied cited set. Separate them, give the
tracing-failed case a served form that works at ANY segment count, and regress the schema-valid
one-segment case. **"Serve after round 3 regardless" must not depend on segment count.**

## 2026-09-03 · D58 — the orchestrator specifies OUTCOMES; the seat chooses the MECHANISM
Four times in this lane I named a mechanism and four times it was wrong, while the OUTCOME V
described was achievable every time:
 1. `componentsOnly` — forbidden by the goal's four-class enumeration.
 2. an empty cited set that throws — made an objection fatal the goal says must serve.
 3. a null band — the ABSENCE V had explicitly declined in favour of a value.
 4. and each was reached by asserting from an incomplete check: integration's vocabulary applied
    to T9's tree; the terminal ladder mistaken for the band because two packages came back empty.
The seat, meanwhile, was right every time it pushed back, and its corrections were cheaper than my
specifications: it implemented what I ordered, measured the collision, reverted cleanly, and costed
the alternatives without choosing between them.
RULED: **the orchestrator states the OUTCOME and the CONSTRAINTS — what must be true of the served
answer, what must not change, what must remain provable. The seat chooses the mechanism, because
the seat is the one reading the code.** Where a mechanism must be named, it is named as an EXAMPLE
and marked as one, and a seat that finds a better route takes it and says so. This costs nothing to
adopt and would have saved this lane three rounds.

## 2026-09-03 · D59 — matching a COMMAND LINE is matching TEXT: the same false positive, three times
`pgrep -f vitest` matches any process whose ARGUMENTS mention vitest, and a codex reviewer is
launched with its entire packet as one argument. Tonight that produced three false "a suite is
running" reports — before a merge, after a merge, and finally as a 24-minute "suite" that was a
static review reading files. I noted the defect the first time, "fixed" it by narrowing the
pattern to `node.*vitest`, and was fooled twice more by the identical mechanism.
RULED: `tools/suite-running.sh` is the check. It matches the EXECUTABLE rather than the command
line, excludes reviewer processes explicitly, reports each match's working directory and elapsed
time, and can be scoped to one worktree. Self-tested against the live codex process it must NOT
report.
THE GENERAL LESSON, and it is the sharpest instance of D56 in this mission because it is about a
CHECK I HAD ALREADY FIXED: narrowing a pattern that matches the wrong KIND of thing does not make
it match the right kind. `node.*vitest` is still a text match; it just excludes fewer strings. The
fix was never a better regex — it was matching a different property. When a check fails the same
way twice, the second fix must change WHAT is examined, not how precisely.
Cost: none, each time, but only because I read WHAT matched before acting. The one time I did not
read carefully enough — merging into a worktree a batch was measuring — I had run no check at all.

## 2026-09-03 · T1B r2 — the seat REFUSED a framing I offered, and was right to
I asked "is m10 the mutant that proves the conjunct boundary is pinned by real code?" The seat
answered **no**, and corrected the question rather than accepting the flattery in it: m10 kills
exactly one control and that control is a PLANTED STRING, so the conjunct boundary's depth is
pinned by a FIXTURE. The mutants pinned by REAL CODE are m8 (7 victims, including both whole-tree
assertions), m6 (7) and m4 (2).
m10's actual value is different and better stated: the seat wrote its any-depth rationale into a
COMMENT, ran the shallower rule as a mutant, and it **SURVIVED** — an unpinned claim, prose
asserting something no test defended. `d4a3eae9` is the commit that added a control for it. Filed
F-T1B-5.
An orchestrator's question carries a presupposition, and a seat that accepts one to be agreeable
launders my assumption into the record as its finding. This one did not.

## 2026-09-03 · F-T1B-6 RULED — the re-merge is owed AFTER review, not before
The seat found the same defect a third time in its own handoffs: "diff surface vs integration"
with no commit named — a mutable ref read one paragraph from the fix for exactly that. Measured
and pinned, the surface is exactly the eleven files claimed against `19bbb4c4`, the commit
actually merged. But integration has since advanced **23 commits** to `58c4715e` (T17B and T15),
and this lane does not contain them.
**It did not chase it, and that judgement was right.** A second catch-up would invalidate every
record filed this round and spend the last of three rounds on something that is not the finding.
It measured the HAZARD instead: `apps/runner/src/index.ts` (1 commit) and
`packages/budget/src/index.ts` (5) were touched by the incoming work, and **neither changed a
depth-bearing line** — the only thing this oracle reads.
RULED: **the lane goes to review at `d4a3eae9` as it stands; the merge-in is owed AFTER approval,
as integration work and not a rework round** — the same treatment every other lane got. Reviewing
a tip and then re-merging is the established order here, and inverting it to chase a moving
integration would cost this lane its last round for a hazard already measured as absent.

## 2026-09-03 · T9B review 3 — the band VALUE is right and the ceiling RECORD lies about how it got there
The reviewer routed this to V; it does not need V. The T9B ticket reads `rework_round: 0` and the
seat's own marker says `rework 0/3`, so all three rounds are available. This is rework 1.
**The finding.** The empty-basis branch reads `bandOrder[0]` = `CAPPED` correctly — V's floor is
implemented. It then sets `floor = defaultCeiling`, IGNORES `floor.ceilingBand`, and copies that
entry's `label` and `liftPath`. On the shipped row those describe a different decision:
`defaultCeiling` is `{ label: DEFAULT_CEILING, ceilingBand: FULL, liftPath: "retain-band" }`. So a
tracing-failed run persists `confidenceBand: CAPPED` beside a record named `DEFAULT_CEILING` whose
lift path claims the band was RETAINED. It was not — it went FULL → CAPPED. **The record does not
identify the decision that produced the visible band.**
It also skips two validations the ordinary derivation performs: the copied label is never required
to occur in `ceilingLabels`, and `defaultCeiling.ceilingBand` is never required to occur in
`bandOrder`. `devRunnerPolicySchema` checks only non-empty strings, so an inconsistent sealed row
would be accepted on this route specifically. And the new tests assert the band and the zero basis
but NOT the label or lift path, so the mismatch is unpinned.
**What I checked before dispatching, and it is why this is not a one-line fix.** The row carries
TWO ceiling entries and BOTH misdescribe this case:
 · `defaultCeiling` — band `FULL`, so its band is wrong for a floored result;
 · `cuts[0]` `REASONING_CEILING` — band `CAPPED`, which is right, and `liftPath`
   `gather-evidence-to-lift`, which is truthful — but its trigger is `minimumShares: {REASONING: 0.5}`,
   a reasoning-share threshold that did not fire, because the basis is EMPTY rather than
   reasoning-heavy.
So the row can express the right BAND but not the right REASON. Per D58 I am not naming the
mechanism: the seat decides whether an existing entry can be made truthful, or whether the row
needs an explicit empty-basis floor entry — and if the latter is a register schema change beyond
this ticket, it files and stops rather than taking it.
**N1 (non-blocking):** source comments and the campaign record still describe superseded
mechanisms — the residue of four mechanism changes in one lane, three of them mine.

## 2026-09-03 · T1B review 3 — MY RULING WAS WRONG: a repo-wide invariant cannot be checked by a lane-scoped diff
The reviewer closes both prior findings — the exclusive-`6` arm now uses a layout-independent
conjunct unit at any bracket depth, both manifestations have valid RED/GREEN pairs, the page-shaped
negative is retained in both orders, `df5` is caught, and the assembly record now reads resolved
object IDs and says plainly that it proves two files and does NOT prove the runner. It also
confirms the seat's m10 reframing was accurate and that fixture-pinning the boundary depth is
acceptable here.
**And it refutes the ruling I made an hour ago.** I accepted the seat's drift measurement as
showing the hazard absent. That measurement iterated `git diff --name-only` over the paths THE LANE
CHANGED and asked which of those integration had also touched. **T1's oracle is REPO-WIDE.** It
scans `packages`, `apps` and the other shipped roots for any literal depth ceiling. An
integration-only path the lane never touched is therefore fully in scope for the invariant and
entirely outside the drift check. A lane-scoped diff cannot test a repo-wide claim, and I ruled
from one that could not have seen what it missed.
**What it missed.** `4bbb13e5` (T17's rework r2, which reached integration through the T17B merge)
adds `packages/register/src/algorithm-policy.ts:257` `maxDepth: 5`. On that line both
`MENTIONS_A_DEPTH` and `BARE_FIVE` match in the line and declaration windows, and the owner filter
exempts only the exact `packages/contract/src/index.ts` declaration. So after catch-up the tree
contains a SECOND `DEPTH_BOUND_LITERAL`, contradicting both whole-tree assertions and J6's
repo-wide "no second literal 5".
**Neither lane could see it, and both are individually right.** T1's oracle does not run in S09's
worktree. T17 sealed that maximum for a stated reason, in the line's own comment: it is "the SEALED
maximum the admission formula refuses above … sealing it here is what lets ADMISSION refuse an
over-bound ask instead of minting a ceiling the runner rejects later." This is the same shape as
the T9/S08 collision — two correct lanes whose invariants meet only at the intersection — and the
third time this mission that a real defect lived exactly where no single lane's evidence reaches.
T1B's three worker rounds are spent, so this becomes a V row rather than a fourth round.
**N1 (non-blocking):** one retained comment still describes the retired line window.

## 2026-09-03 · V RULING V-S11-GRADER — ONE FIXED GRADER FOR EVERY ARM; SHARED IDENTITY IS NOT CONTAMINATION
V's words, and this is architecture rather than an S11 workaround:
> "The grading should always be done by the same model, so they are correctly measured against
> each other, but like I said, it doesn't matter if the writing, critique and model is made by the
> same model, because each step shouldn't know who made the previous step, it will just receive a
> task with its specific prompt and just do it, so it should be as impartial as possible."

**TWO RULES, and the second is the one the mission had backwards.**
 1. **The grader is FIXED across every arm.** The same model grades all of them. This is what makes
    the scores commensurable, and it dissolves the confound entirely rather than disclosing it: if
    grader identity is CONSTANT it cannot correlate with the arm.
 2. **A grader sharing an identity with the candidate is NOT contamination.** Impartiality here comes
    from the EXECUTION MODEL, not from identity separation. Each step is a fresh instance that
    receives a task and a stage-specific prompt and nothing else — it does not know who produced the
    thing in front of it, so it cannot favour it. The thing the goal's "never the candidate" rule was
    protecting against does not exist in this architecture.

**WHAT THIS OVERTURNS, and it is my analysis, not the seat's.** I built the whole grader question on
the premise that a candidate's own identity must be excluded from grading, and every option I put to
V descended from it — exhausting independent identities, repeating one before seating a candidate
ref, reserving a disjoint pool, accepting non-commensurable arms. The S11 seat's ranking logic was a
careful solution to a problem that this architecture does not have. Its DISCLOSURE work stands and
matters; its EXCLUSION work is superseded.
**What survives unchanged:** V-S11-1's disclosure law. Same-model provenance is still RECORDED and
DISCLOSED, never hidden — now not because it is a risk to be flagged, but because a reader is
entitled to know how an answer was produced. And a fixed grader must be DISCLOSED as fixed, since a
reader comparing arms should know the constant.
**CONSEQUENCE:** the harness at integration `58c4715e` seats graders by complementing the candidate.
It must instead take ONE configured grader and use it for every arm, dropping the exclusion logic and
the repeat-before-candidate ranking. F-S11-5 (reserve a disjoint pool) is CLOSED — the problem it
solved is dissolved, not deferred. The non-commensurability mark stays available for the case where a
deployment genuinely cannot supply one grader for all arms, and must fire ONLY then.
This also settles, on the record, the question V raised earlier as future work: an AI grading its own
output is acceptable HERE because the grader is a fresh instance with no knowledge of authorship. That
is a property of how the engine calls models, and any change to that property reopens this ruling.

## 2026-09-03 · V ROUTED ALL FIVE LOOSE ENDS AS REAL WORK — with one that is DELIBERATELY not a repair
V selected every one. They are promoted from `queued` observations to `ready` work:
 · **F-S11-6** — add the newly-required sealed row to the acceptance seeding list, so the first
   approved run cannot stop on a refusal nobody expected. The class matters: no gate can catch it,
   because every gate exercises the SHAPE and not the DATA.
 · **F-T9B-3** — a new sealed row entry with its own trigger, so a floored band can state its real
   reason instead of borrowing a label whose trigger did not fire. S01/T16 owns it.
 · **F-T1B-5** — pin the conjunct boundary against real repository code rather than a planted
   control, so the safety net is anchored to what it protects.
 · **F-T1B-6** — make the drift check REPO-WIDE to match the invariant it serves. A lane-scoped diff
   cannot test a repo-wide claim, and that scope mismatch is exactly how the second depth literal
   reached integration unseen.
 · **F-T6B-1** — and this one's DELIVERABLE IS A STATEMENT, NOT A FIX. The logs cannot be
   retro-stamped: adding a commit header now would convert testimony into a fabricated machine
   record, which is worse than the gap. The work is to name precisely which claims rest on testimony
   rather than on the artifact, so a reader knows which is which. V selecting it means the mission
   states its own evidentiary limits rather than leaving them implied.

## 2026-09-03 · F-T9B-4 is NOT a cross-lane collision — it is a merge resolution that undid T9's own charge
The T9B seat filed a blocking finding attributing a restatement conjunct to S09's T17B work and
asking for a ruling between the frozen goal and that lane. **The attribution is wrong, and the
measurements in the seat's own report are what let me check it.**
Established from the trees, not inferred:
 · the conjunct `|| servedRoot.restatementStatus !== "PASS"` is **PRE-EXISTING** — one occurrence at
   the mission baseline `dev@1c9578a`, introduced by a 2026-08-17 tree reorganization long before
   this mission. T17B did NOT add it.
 · **T9 deleted it**: zero occurrences at its pre-merge tip `b0591d9b`.
 · **The merge restored it**: one occurrence at the merged tip `e9b46023`.
So the guard the goal calls "KNOWINGLY RETIRED" — "the envelope terminal fires on HARD_STOP whenever
no served statement exists yet, independent of restatement status" — was correctly retired by T9 as
its own charge, and then reinstated by T9's own merge resolution.
**WHY THE SEAT GOT IT WRONG, and it is an understandable error.** T17B genuinely rewrote that block
for its J28 boundary (`evaluateEnvelope(1)`, asking with the pending attempt counted). So git raised
a real conflict there, and the incoming side looked authored and deliberate — because it was. The
seat recorded "one conflict, resolved as theirs (my lane had no competing change)". It DID have a
competing change: a deliberate deletion, which is invisible when you read the incoming side and ask
whether it looks correct. **A deletion is the hardest change to defend in a merge, because the
evidence for it is absence.**
RULED: no V decision, no goal override, no revert of another lane. The two changes COEXIST — T17B's
`evaluateEnvelope(1)` stays, T9's removal of the restatement conjunct stays, and the line becomes
`if (exhausted.kind !== "HARD_STOP") throw error;`. The seat re-resolves and re-runs.
**The lesson generalises past this lane.** I have been telling every seat that a clean auto-merge is
the case to check. This was the opposite failure: a REAL conflict, resolved without checking what the
lane's own side had done. "Theirs" is a safe default only when your side changed nothing — and
verifying that requires reading your own diff, not your memory of it.

## 2026-09-03 · D60 — a merge is a decision about the PAIR, and the half you wrote is the half you skip
The T9B seat's own formulation, and it earns a ruling because it unifies two failures this mission
made at opposite ends:
 · **S08 × T9**: a CLEAN auto-merge with zero conflicted paths that nevertheless produced a wrong
   combined behaviour, because git resolved by position and nobody checked meaning.
 · **T9's merge**: a REAL conflict resolved by taking the incoming side, because the lane's own
   competing change was a DELETION and nothing on screen represented it.
The mission's standing caution — "a clean auto-merge is the case to check" — covers only the first.
The second is its mirror: taking "theirs" is safe ONLY when your side changed nothing, and confirming
that means reading `git diff <merge-base>..<your-tip> -- <file>` rather than trusting your memory of
what you did. The seat notes it ran that exact command this session for its read-point audit and
never pointed it at the file it was resolving.
RULED: before resolving any conflicted hunk, read BOTH sides' diffs against the merge base. A
deletion is the dangerous case in both directions — invisible when it is yours, and invisible again
to a reviewer reading the merged file, because absence leaves no line to review.
**And the second-order lesson, which is sharper.** Every step the seat took AFTER the bad resolution
was rigorous: it isolated the cause with a custody-clean mutant, quoted the frozen goal, searched
DECISIONS for a reconciling ruling, costed two resolutions and declined to choose. All of it
downstream of a false premise — which, as it put it, just produces a confident wrong answer faster.
Rigour applied after the wrong branch point does not recover the branch point.
That is why the attribution was worth checking rather than accepting: the report was internally
consistent, well-evidenced, and wrong at its root. The three tree facts that settled it took under a
minute and were available to either of us the whole time.

## 2026-09-03 · the sweep that would have made it worse
Recording because it is the counter-lesson to D51's "generate the claim". The seat's first class
sweep for other reinstatements returned ELEVEN hits; ten were substring artifacts on short generic
lines in a 4,000-line file. Had it filed from that generated output it would have replaced one false
finding with eleven. It distrusted the number and counted NAMED SYMBOLS per tip instead, arriving at
exactly one.
So a generated number is not automatically better than a reasoned one — a generator with a sloppy
pattern manufactures findings as confidently as prose does. D51 says generate the claim; D56 says the
generator must be shown able to refuse; this adds the third: **read what the generator matched before
you believe its count.**

## 2026-09-03 · JUDGE VERDICT — T9 / T9B (synthesis serve chain + the role predicate): PASS; lane MERGES
**Verdict: PASS.** Codex merge review returns **0 findings, fit to merge YES**, after four product
reviews that each found something real. This lane gates the mission's closing run.
**What it fixes, in one sentence:** a legitimate synthesizer artifact submitted as BOTH candidate and
verdict used to pass every check and commit, because the role was interpolated into an error string
and never compared. The expected call-site key is now DERIVED inside persistence from the typed role,
stage and round through one shared builder used by recorder and verifier, and the ledger entry is
resolved BY that derived key. The RED log shows the defect live: the evaluator artifact offered as
the candidate resolved and committed an answer.
**What it took, and the cost is mine.** Four mechanisms were specified for the citation-tracing case
and three were wrong — a terminal the goal's four-class enumeration forbids; an empty cited set that
throws, making an objection fatal where the goal says serve; a null band, the absence V had declined
in favour of a value. Each was reached by asserting from an incomplete check. The seat implemented
each faithfully, measured the collision, reverted cleanly, and costed the alternatives without
choosing. **D58 came out of this lane**: the orchestrator states the OUTCOME and the constraints, the
seat chooses the mechanism, because the seat is the one reading the code. Its first application
produced a better answer than my specification would have — the floor read from the register row
rather than written into serve, honouring a ruling I had not cited.
**The merge review's own audit, which is the model for the rest of the mission.** It did NOT use the
seat's substring sweep. It compared changed-path SETS and BLOBS: 21 lane-only paths byte-identical
between the pre-merge tip and the repair, 21 integration-only paths byte-identical to `58c4715e`, one
overlapping path, and in it all 30 incoming additions present with exactly one extra line — the
reinstated guard — accounted for. That is how a deletion is audited: by set difference, not by
grepping for what is absent.
**Confirmed sound across the four reviews:** the role predicate; the two causes split so a
tracing-failed run serves at any segment count while a genuinely reasoning-only one-segment candidate
still refuses; the floored band selected by the entry that NAMES it, failing closed when none does;
and all ten re-taken kills credited to assertions that directly observe their mutation.
**Carried forward, both V's:** F-T9B-2 (a pre-existing mutant count that is not derivable from the
filed set) and F-T9B-3 (the floored band cannot state its true reason without a new sealed row,
which S01/T16 owns).

## 2026-09-03 · V RULINGS — closure sequencing
**1. The demonstration run happens NOW, and again at the end.** Early proof that the assembled
system works end to end, which also flushes out what the individual lanes could not see; then a
final run once the eight queued items land. V accepts one extra run to get early warning.
**2. The 100-commit reconciliation with main dev happens NEXT, before the eight items.** So each
remaining piece is built on the combined tree rather than needing its own reconciliation later. V
chose to front-load the hardest merge while the mission's own changes are still fresh.
**3. The eight items run ONE AT A TIME.** Each finishes and merges before the next begins. Slower in
wall-clock, and it buys the thing that cost this mission most: no piece is ever built against a tree
that is about to change underneath it. **Four cross-lane collisions tonight, every one visible only
where two lanes met** — T9×S08's conformance chain, T1×T17's second depth literal, T9's own merge
reinstating a deletion, and S11's shared reader gaining a required row. Each cost at least a review
cycle; two cost a V decision.
ORDER OF OPERATIONS, therefore: **demonstration run → dev reconciliation → eight items sequentially
→ final demonstration run.**

## 2026-09-03 · THE DEMONSTRATION RUN CANNOT EXECUTE ON THIS HOST — established before starting it
V ruled the run happens now. I checked what it requires before launching, and it cannot complete.
The blocker is ENVIRONMENTAL and PRE-EXISTING — both symptoms appear in T0's baseline, so they were
failing before this mission began and no lane was chartered to fix them.
**Live provider calls DO work.** The adversarial-corpus relay arms execute live and PASS
(ROLE-01, DELIM-01, CTRL-01, SIZE-01, FS-01). Its one failing arm, DB-01, is an environment-variable
list mismatch (`LANG` absent from the child environment), not a provider fault.
**What actually blocks a MULTI-MAKER run is maker identity.** The DoD requires "real per-node maker
lineage", so every answer must be attributable to a named model. Of the three sealed provider
identities:
 · **claude** — present and working.
 · **codex** — present, calls succeed, but `parseCodexCompletion` resolves WHICH MODEL answered by
   locating a session rollout file (`findRollouts(sessionsRoot, threadId)`), and that returns a count
   other than 1, raising `CODEX_CLI_MODEL_UNRESOLVED`. The answer comes back; its authorship cannot
   be established. This looks like drift in codex's session-storage layout.
 · **grok** — a relay exists in code (`grok-relay.ts`) but the CLI is **NOT ON PATH**.
So exactly ONE maker can be identified, and M≥2 needs two. The flagship run is not merely likely to
fail — it cannot satisfy its own definition of done, because an unattributable answer cannot carry
maker lineage.
NOT RAISED AS A LANE FAILURE: this is the environment, and both symptoms predate the mission. Raised
to V because V's sequencing decision assumed the run was available today.

## 2026-09-03 · F-W4-2 — SECURITY: the acceptance fixtures serialise the ENTIRE ENVIRONMENT into persisted content
Found by the W4 seat while doing something else. **Verified independently, without reading any
credential value:**
 · `acceptance/test-fixtures/fake-claude-cli.mjs:62` —
   `result: JSON.stringify({ prompt, argumentList, environment: process.env })`
 · `acceptance/test-fixtures/fake-grok-cli.mjs:12` —
   `text: JSON.stringify({ prompt, argumentList, environment: process.env })`
Both serialise the whole child environment as the model's REPLY CONTENT, which the engine persists
to `ledger.raw_artifact`. `ANTHROPIC_API_KEY` is SET on this host (presence checked, value never
read), so every acceptance run that used these fixtures wrote a live key value into the acceptance
database and into any log capturing that content.
**What the seat did, and it was right:** it hit the value, redacted its own log in place, verified
zero remaining, deleted the 73 MB `.pgdata` store holding the same value, and **never reproduced the
value anywhere**. I confirmed the store has not returned. It then stopped and said rotation is V's
call — correctly, because minting, reading or passing a credential value is forbidden to every seat
and to the orchestrator (D18).
**ROTATION IS V'S ACTION AND I HAVE ADVISED IT.** A live key transited files on disk. Cleaning the
copies we know about does not establish that no copy survives — earlier runs, other logs, and any
backup of that database are all outside what either of us can enumerate. The honest position is that
exposure occurred and the only reliable remedy is rotation.
**The code fix is separate and is ours:** the fixtures must stop serialising `process.env`. They
need only the variables the test actually asserts on, named explicitly. This is a test fixture, so
the change is contained — but it has been writing secrets into a database for as long as it has
existed, and no gate could see it because the content is opaque to every check that runs.
Ticketed as W6. Not merged, not scheduled behind other work: it goes next.

## 2026-09-03 · V RULING V-BLIND-CONTEXT — the model is blind to authorship; the DATABASE is not
V's clarification, and it is the load-bearing premise under V-S11-GRADER rather than a detail of it:
> "each time a AI model is called, it's a fresh instance with its own context, and only gets its
> particular prompt with the necessary 'resources', but the model couldn't infer which model created
> that data … So even though this information should be present in our database, the way how it's
> passed/presented to the AI it's just the minimum information that that AI should get to make its
> task."

**THE RULE, in two halves that must both hold:**
 1. **RECORDED.** Full provenance lives in the database — which model produced which artifact, in
    which role, at which stage. Nothing is dropped. The reader, the receipt and the audit all get it.
 2. **WITHHELD.** What reaches a model is its prompt and the minimum resources for its task, and
    NOTHING from which it could infer authorship. A judge that is Codex must not be able to tell that
    Codex wrote the argument. A verifier re-checking a rating must not be able to tell who rated it —
    including when the answer is "itself".
**WHY IT MATTERS HERE:** this is what makes same-model grading legitimate at all. V-S11-GRADER
permits one fixed grader and permits it to grade its own family's output, and the ONLY thing standing
between that and self-favouring is that the instance genuinely cannot tell. If authorship leaks into
a prompt, the whole permission collapses, and it collapses SILENTLY — a model that can infer
authorship will not announce that it did.
**THIS IS A STRONGER CLAIM THAN THE MISSION HAD.** The record said provenance must be DISCLOSED,
never hidden (V-S11-1, J24, goal line 26). That is about the READER. V is now separating the two
audiences: disclosed to the reader, WITHHELD from the model. A system can satisfy the first and
violate the second, and until now nothing in this mission checked the second.
**AUDIT ORDERED, and it is mine.** Enumerate every point where data reaches a model, and identify
where authorship is or could be inferable. V asks specifically for the places where the strategy
CANNOT be applied, with recommendations, so V can judge them. Findings and recommendations follow in
the report below this entry.

## 2026-09-03 · AUDIT for V-BLIND-CONTEXT — every point where data reaches a model
Method: enumerated every `role: "user"` / `role: "system"` payload across `apps/runner`,
`packages/serve`, `packages/evaluator`, `packages/judgement`, then swept the whole tree for an
authorship token inside a prompt payload. Where a search returned empty I verified the file and the
pattern rather than concluding from the emptiness.

**THE ARCHITECTURE ALREADY IMPLEMENTS V'S PRINCIPLE, deliberately and with a guard.** This is not a
system that has to be retrofitted:
 · `ProviderCallRequest` separates ROUTING (`providerRef`, `role`, `callSiteKey`, `bound`) from
   `packet` — only the packet reaches the model.
 · `createBlindEvaluationSample` (`evaluator/index.ts:515`) reduces a judge's output to an OPAQUE
   `sampleId` (a sha256 slice), question/task excerpts, the grade and reasons — and its system
   prompt says "Grade the supplied anonymous judge output".
 · `synthesis.ts:340-352` carries an explicit FRESH-CONTEXT ASSERTION with frozen key sets and the
   comment: "each recorded request contains NO debate transcript or provider history BEYOND the
   named artifacts … an extra key is a leak". It checks the key set in BOTH directions.
 · The composer, conformance and restatement packets carry `{ ref: "primary", nodeId, fact }`,
   `{ factBundle, segment }` and `{ question, segments }` — a role-neutral `"primary"`, never a
   maker.

**THREE SITES BREAK IT, all the same shape, all in `packages/judgement/src/index.ts`:**
 · **:219 + :225** (cross-maker node review) · **:372 + :376** · **:462 + :466** (assessment)
Each pairs a system prompt saying the node was "authored by a different maker" / "by another maker"
with a user field `{ name: "author_maker", content: input.authorMaker }`. **The reviewing model is
told who wrote the thing it is reviewing.** Its required output is only
`{ outcome: "agree"|"dispute"|"cannot-assess", reasons: [...] }`, which does not need the author's
identity.
`authorMaker` is used LEGITIMATELY everywhere else — `runner:121` filters configured makers to pick a
different reviewer, `readLatestReviewerMaker` rotates, `evaluator:2576` groups recorded reviews by
lineage. Those are routing and analysis; none reaches a model. **The defect is exactly one field in
three prompts.**

**A FOURTH, WEAKER ITEM.** `SynthesizerRequest` and `EvaluatorRequest` each carry `roleRef` — the
caller's OWN sealed identity — and the runner sends `JSON.stringify(request)` whole
(`runner:4038`, `:4114`). A model is therefore told which provider identity it is operating as. This
is NOT the leak V described: it cannot infer who produced the data it is reading. But it exceeds the
minimum, and `roleRef` sits inside the frozen key sets, so removing it means amending those sets too
— the guard would otherwise read a missing key as a defect.

**NOT PRODUCTION:** `acceptance/discovery.ts:58` names a `providerRef` in a prompt, but that is
acceptance harness code, not a debate path.

RECOMMENDATIONS, for V's judgement, in the report to V. Ticketed as W7 pending V's answer.

## 2026-09-03 · W5 RECONCILIATION FILED — merged tip a8ed8d78, four findings, one for V
The seat's fidelity audit is the model for this kind of work: 571 dev-only files with **0**
divergences, 126 mission-only with **1** (its own disclosed deletion), accounting closing at 705
exactly. Typecheck 8 errors, **set-equal by identity to dev's own 8**, zero merge-caused. Suite
`85 failed | 2247 passed | 3 skipped (2335)`, partitioned into 22 authority + 24 measured red at the
mission tip + 39 measured red at dev + **0 unexplained**, with both baselines MEASURED in provisioned
clean worktrees rather than inferred.
**FINDING 1, BLOCKING, V's call — dev re-creates the steering placebo the mission retired.**
`apps/ui/app/new/page.tsx` at the current main line collects "Steering menu selections" and
"Steering annotations", bundles them into the ask config and sends them with the debate request. **I
verified, with a working control search, that NOTHING reads them**: the complete set of files
mentioning `steeringPresets` at `origin/dev` is `apps/ui/app/new/defaults.tsx`,
`apps/ui/app/new/page.tsx` and one render test. No engine, no api, no runner. A user types steering
instructions, the interface accepts them, and the debate ignores them.
That is precisely what the mission removed and precisely why — goal non-goals say "no steering
design", and a control that appears to work and does not is a lie to the user. Dev's own test now
DEFENDS the behaviour (asserting typed text reaches the ask) where the mission asserted it reached
nothing. No gate can see the conflict, because the mission's assertion lived in a file deleted at
dev. **V's web-only scoping was correct when made** — the seat verified `apps/ui` carried no
steering at `1c9578a`.
**FINDING 2 — confirmed twice, independently, and it is OURS.** T9 broke the dev-register conformance
scrape: 2 matches at base and at dev, **0 at the mission tip**, bisected to `c1d8e09d`, roughly 24
failures. The W4 seat found the same defect from the acceptance side (F-W4-1). It was invisible
because batch b11 predates T9, T9B, T15, T17B and T6B. **It blocks the closing run**, and it is not
dev's doing.
**FINDING 3** — four files with dangling `web/` references, red at dev today; inherited, not ours.
**FINDING 4 — mission tooling.** `d15-suite.sh`'s `key()` truncates names at 120 characters and two
t16 names collide. Its parse guard correctly REFUSED rather than mis-classifying; the defect is the
key function, not the guard.
**AND THE PLAN CHANGES: the reconciliation was against a STALE local `dev`.** `origin/dev` differs by
339 files, **25 of them real code under `packages`/`apps`, including `packages/contract`**. A second
reconciliation is owed, so V's "once, before the eight items" does not hold as stated. Better to
learn it now than after the eight items were built on a stale base.

## 2026-09-03 · V RULINGS — the steering placebo comes out again, and the second reconciliation happens now
**1. REMOVE the steering controls.** V restores the mission's position. The controls come out and
the incoming test defending them is retired ON THE RECORD with its reason: the inputs are collected
and discarded, nothing in the engine reads them, and a control that pretends to work is worse than
no control. This overrules a change made elsewhere, so it is stated plainly rather than done
quietly — goal non-goals ("no steering design") and the original S1-2 retirement are the grounds.
**2. THE SECOND RECONCILIATION HAPPENS NOW**, against the true `origin/dev`, before the eight items.
The work already done is not wasted: the eight resolutions carry forward and only the newly-arrived
changes need judging. V keeps the original principle — nothing is built on a base known to be stale.

## 2026-09-03 · W7 minted — remove `author_maker` from the three review prompts (V-BLIND-CONTEXT)
From the audit: three sites in `packages/judgement/src/index.ts` (:219+:225, :372+:376, :462+:466)
tell a reviewing model WHO authored the node it is reviewing, via a system prompt naming "a
different maker" and a payload field `author_maker`. The review's required output is
`{outcome, reasons}` and needs neither. `authorMaker` stays everywhere else — routing a different
reviewer, rotation, recorded lineage analysis — because those never reach a model.
Recommendation carried into the ticket: keep the "authored by another participant" framing WITHOUT
naming which, since its likely purpose is prompt-injection defence (marking the text as foreign, not
the model's own prior turn) and that intent survives anonymisation. Under V-S11-GRADER "a different
maker" may also become FALSE, since the same model may now review.
**STILL OPEN FOR V, asked and not yet answered:** `SynthesizerRequest` and `EvaluatorRequest` each
carry `roleRef`, the caller's OWN sealed identity, and the runner serialises the whole request into
the prompt. A model is told which provider identity it is operating as. This is not the leak V
described — it cannot infer who produced the data it reads — but it exceeds the minimum. Removing it
also means amending the frozen key sets, which would otherwise read a missing key as a defect.

## 2026-09-03 · CORRECTION — my steering sweep searched ONE IDENTIFIER and I reported a CLASS conclusion
I told V that after the removal "no file anywhere in apps, packages or tests still mentions it". That
was wrong. I searched for `steeringPresets`, a JavaScript identifier, and the styling never contains
it — CSS uses its own names. The W5 seat swept the CLASS and found `globals.css` carrying
`.ndRowSteering`, `.ndSteerField` and `.ndSteerInput`, plus two stale comments. Dead styling for a
removed control is not harmless: it is the scaffolding that makes re-adding the control a one-line
change.
This is the same error I have now made in several costumes — searching for one spelling and reporting
a conclusion about the class. It is exactly what D51 and the "read what the search matched" rule were
written for, and I wrote both.
**What legitimately remains** and is not a leftover: `steering_presets: []` and
`steering_annotations: []` stay in the ask config as EMPTY arrays, with comments recording V's ruling
at the site. The schema keeps its shape, the asker has no control, and nothing downstream reads them.
That is the honest end state, not a residue.

## 2026-09-03 · W5 COMPLETE — both reconciliations done, tip af072205, zero behind origin/dev
**Round 2:** 339 files their side, 25 real code, contested surface **2 files**. Their entire
contribution to `packages/contract/src/index.ts` is ONE additive line (`models` in
`PublicDebateSummarySchema`); the seat verified all THREE authors' work coexists after the auto-merge
— theirs, dev's round-1 changes, and the mission's — with no line lost from any.
**Fidelity accounting, round 2:** 337 theirs-only with 0 divergences, 129 mine-only with 0; at the
filed tip exactly 1 deliberate divergence per side. Union arithmetic closes at 471, matching git.
**A METHODOLOGICAL FINDING WORTH KEEPING:** three files touched by V's ruling were changed by NEITHER
side, so **no audit list covers them** — the same blind spot as round 1's lockfile. An audit built
from "files each side changed" cannot see a file that a RULING changed but neither branch did.
**On the steering removal the seat's own testing beat its first attempt twice:** its first RED proved
only that the label was present, so it wrote a second RED proving the typed sentinel actually REACHES
the ask; and its neighbour mutant revealed its first assertion was over-broad and would have misfired
on unrelated form growth, so it tightened it. Its m2 mutant re-adds a steering box under a NEW id and
is caught — the property is pinned, not the old names.
**Suite run TWICE and compared by NAME, not count**: `102 failed | 2232 passed | 3 skipped (2337)`,
partitioned 22 authority + 24 mission-tip + 38 dev + 18 origin/dev + **0 unexplained**, every one of
the 18 new names measured red at `origin/dev` in a provisioned clean worktree.
**Reported, not reverted:** `origin/dev` resurrects `web/next.config.mjs` into the emptied `web/`.
Inert — not a workspace project, no `package.json`, excluded in tsconfig — and it is their change, so
it stands and is reported to whoever owns dev.

## 2026-09-03 · V RULING V-MINIMUM-PAYLOAD — the model gets its task, not the machinery
V ruled that four fields move to where they belong — the runner and the audit record — and out of
what the model reads:
 · **`roleRef`** (the routing address) — the runner resolves the provider from it one line before
   building the prompt, then serialises the whole object including the address. No benefit to the
   model whatsoever; it rides along because `JSON.stringify(request)` was easier than a projection.
 · **`registerVersion`** inside `codeLabel` — settings-version metadata; nothing a writer can use.
 · **`round`** — and this one may actively BIAS. There is a configured `evaluatorLoopMaxRounds`, so
   telling a model it is on round 3 of a 3-round loop tells it this is the last attempt. A
   synthesizer that knows it gets no further try may write defensively; an evaluator that knows
   objecting now ENDS the loop rather than continuing it faces a different decision than the one the
   design intended. Neither task depends on the count.
 · **`stage`** — nearly redundant already: on a retry the payload also carries `priorObjection`,
   which shows the situation more directly than the flag states it.
**KEPT, because the tasks depend on them:** the digest, the instructions, the code label's actual
numbers, the `candidateStatement` (the evaluator's whole job is judging it), and `priorObjection` on
a retry (without it a rewrite is blind and can only repeat itself).
**IMPLEMENTATION NOTE that makes this cheap:** `assertFreshContextRequest` inspects the REQUEST
OBJECT, not the prompt. So every field stays on the request for routing and the audit record, and
the prompt receives a projection. The frozen key sets never change and the leak guard stays
satisfied. My earlier statement to V that removing `roleRef` meant amending those key sets was
WRONG — that would only be true if the field left the request entirely.

## 2026-09-03 · F-W9-1 — the synthesizer is judged against a rule its instructions never state
Surfaced by V asking where a phrase I quoted actually appears. It appears in the EVALUATOR's
instructions, not the synthesizer's. Verbatim:
 · SYNTHESIZER: *"Write the served statement from the digest below. Every load-bearing claim must
   trace to a digest node. Do not overstate the evidence, and state the losing positions fairly."*
 · EVALUATOR: *"Judge the candidate statement against the digest and the code label. Check fairness
   to the losing positions, agreement between the statement and the code label, and overstatement.
   Return an objection whenever you are not satisfied."*
The synthesizer RECEIVES `codeLabel` and is never told what to do with it. The evaluator is then
instructed to check the statement AGREES with that label. **So a rule is enforced that was never
stated to the party bound by it** — the synthesizer must infer from a field's mere presence that its
prose should match it.
Cost: at best a wasted round each time the synthesizer writes prose inconsistent with a label nobody
told it to honour; at worst a loop that cannot converge, because the retry carries the objection but
still never states the rule.
**This is not a case of giving the model MORE than the minimum — it is the minimum.** A party judged
on agreement with the label needs to know it is judged on agreement with the label. Folded into W9.

## D60 — the D15 classifier is a standalone tool, keyed on the full name, scoped by heading (2026-09-05)

`tools/d15-classify.py` replaces the python block embedded in `d15-suite.sh` (retained as
`d15-suite.sh.v1-superseded`). Three defects in v1, each found by measurement:

1. **Its key truncated every name at 120 characters.** Two new t16 failures in b12 differ only
   after that point; the key merged them, 48 parsed as 47, and the tool refused a verdict. The
   refusal was correct behaviour. The hazard is the case that would NOT refuse: a new failure
   whose first 120 characters match a known-red name is counted onto the known one, and the
   set comparison reports "no new failure" while one landed. **The key is now the full
   normalised name.** A key used for set equality must be injective over the names it will see.
2. **It scoped the authority by hard-coded line numbers** — `t0[187:210]` and `t0[213:231]`.
   Correct on the day it was written; silently wrong after any edit above line 187. The
   standalone tool anchors on the heading `## PRE-EXISTING FAILURES (POST-PROVISIONING)` and
   stops at the next h1. That matters because `t00-baseline.md` RETAINS the pre-provisioning r1
   record under D9 as a later section; a whole-file parse re-admits five render tests that
   provisioning fixed and double-counts nine names present in both sections. An empty
   authority parse refuses (exit 3) rather than classifying everything as NEW.
3. **Suite-level `FAIL path [ path ]` lines are counted separately** and never as tests. A suite
   that could not load has tests that never ran; they are not in `Tests N failed` and the
   verdict must say so, or the count understates the damage.

Standalone so a FILED log can be re-classified without re-running the suite. Regression: b11
re-classifies to its original verdict exactly (23 / NEW 0 / VANISHED 0); b12 classifies to
48 / NEW 25 / VANISHED 0 / suites-failed 2, matching the orchestrator's manual set-difference.

Orchestrator breach recorded: b12's v1 classification was overwritten before it was captured.
Reproduced verbatim as `integration-suite-b12.CLASSIFICATION.v1-refused.txt` with a README.
Capture-before-destroy applies to a tool's OUTPUT as much as to a worktree.

## D61 — a duty in the packet must have a file in the contract (2026-09-05)

Found by the lane/h-diag seat and stated exactly: *"every worker packet that carries §6 as a duty
must carry `.hermes/TOOLING-TRAPS.md` in its `allowed` list, or say explicitly that the seat
reports traps in its handoff instead. Mine did neither, so the duty and the contract contradict."*

The seat did the right thing — refused to write outside its contract, filed the trap in its report,
and named the conflict. Every earlier seat in this mission had the same contradiction and resolved
it the same way, which is why five traps this week reached the shared file through the
orchestrator's hand rather than the seat's. That is a laundering of the seat's own evidence
through a second writer, and it is how a trap gets paraphrased.

**Ruling.** From the next dispatch:
1. Every worker packet's `allowed` list carries `dialectical-engine/.hermes/TOOLING-TRAPS.md`,
   marked **append only**, with the line: *another lane also appends — append, never rewrite.*
2. The orchestrator does NOT append to that file while any seat holds it in `allowed`. Seats
   write their own traps in their own words; the orchestrator writes only traps the
   orchestrator found.
3. A packet that assigns any duty naming a file must grant that file, or state in the same
   sentence where the seat reports instead. The reviewer's packet audit checks this pair.

**Why this is D61 and not a footnote:** it is the sixth distinct instance in three days of one
orchestrator habit — stating an outcome or duty the contract cannot reach (PD-SEALEDROWS-1, P3,
AMENDMENT 2, AMENDMENT 4, the h-diag relative paths, and this). The habit is now a rule with a
reviewer check, because a memory file (`outcome-needs-contract-reach`) has not been enough.

Applies to the staged `t17t9-worker.md` before dispatch; the in-flight sealedrows round is
V-scoped and test-only and is not amended mid-round.

## D62 — a commit whose message claims no behaviour change is reviewed as if it claims one (2026-09-05)

Found by the lane/h-diag seat dating F-H-2. `2d1f86b8` (2026-08-28) is titled *"chore: checkpoint
all local mission artifacts and in-flight tree."* It describes no behaviour change. In
`packages/liveness/src/index.ts` it replaced two explicit `NOT EXISTS` clauses with a call to
`core.run_private_content_is_live` — a helper that carries an extra precondition
(`content_encryption_version = 1`). The refactor looked like extracting duplication and was not.
Result: with encryption off by default, re-asking a question has never refreshed liveness or
revived an archived run since that day. It was in the tree before the mission's T0 baseline, and
T0 recorded its symptom under a test name that later acquired a second cause.

The seat's sentence, adopted as the rule: **a commit whose message claims no behaviour change is
the least-reviewed place a behaviour change can hide.**

**Ruling.**
1. A `chore:`, `checkpoint`, `wip`, or "no functional change" commit that touches a product file
   receives the same review as a feature commit for that file. The message is a claim, and claims
   are verified.
2. Replacing inline predicate logic with a helper call is a behaviour change until the helper's
   preconditions are shown identical to the inline logic's. A reviewer checks the helper body,
   not the call.
3. When a mission's T0 baseline records a failure, the baseline's `git log` for the failing
   file's recent chore commits is read before the failure is filed as "pre-existing". A
   pre-existing failure with a dated cause is a defect; without one it is a mystery, and the two
   are triaged differently.

Applied retroactively: F-H-2 is HIGH, not medium, on blast radius.

## D9 ADDENDUM — a fast-forward is not provisioning (2026-09-05)

D9 defines provisioning as `pnpm install --frozen-lockfile` + `pnpm run generate:contract`. The
generated contract lives in `packages/contract/generated/`, which is **gitignored**: it is never
carried by a merge or a fast-forward. So a lane worktree provisioned at tip A and fast-forwarded to
tip B carries B's source and A's generated contract, and porcelain cannot show it.

Found while pre-provisioning lane-t17t9 and lane-h-diag at `7dda3cc0` and fast-forwarding them to
`d08ee928` after the sealedrows merge. Checked by regenerating on the merged integration tree and
hashing `field-inventory.json` across all three worktrees: identical (`59a57922…`). **Safe this
time only because the merge did not touch the generator's inputs.** A merge that does would leave
every fast-forwarded lane silently running gates against a stale contract manifest — the class of
defect `gate-run.sh`'s PROVISIONING block (D45) records but does not prevent.

**Ruling.** After any fast-forward or merge into a provisioned worktree, `pnpm run
generate:contract` is re-run there and the manifest hash is compared against the integration
tree's. A mismatch is a refusal, not a warning. `tools/post-r7-merge.sh` is amended to do this in
the same step as the ff; its successor for every later merge inherits it. Lockfile changes
(`pnpm-lock.yaml` in the diff) additionally require a fresh `pnpm install --frozen-lockfile` — the
ff'd lane's `node_modules` is A's, not B's.

## D63 — the reviewer model is passed on the command line, never inherited (2026-09-05)

Seven codex reviews ran on the config default and it happened to be the roster's `gpt-5.6-sol`.
Between the seventh and the eighth dispatch `~/.codex/config.toml` changed to `gpt-6-astra`, which
this CLI cannot run, and the eighth failed in under a minute with a 400. The orchestrator did not
change that file and does not edit user configuration.

**Ruling.** Every `codex exec` in this mission passes `-m gpt-5.6-sol` explicitly (and
`-c 'model_reasoning_effort="xhigh"'`, already the practice). A dispatch that completes in under
three minutes is treated as a FAILURE until its verdict file is read — the r6 and r7 reviews took
thirteen and fourteen minutes; a one-minute "completion" is a crash, not a fast review. The
resolved model line (`model: …`) in the exec header is recorded in the ledger row for each review.

## D63 ADDENDUM — what a codex failure looks like, and what it does not (2026-09-05)

Two reviews ran concurrently. I counted two `codex exec` processes, remembered that one review
had earlier shown as two PIDs, concluded one review had died, and was one step from
re-dispatching a live review on top of itself. Both were alive: the count of processes is not
the count of reviews. **Identify a codex by its `--cd` lane, never by counting.**

Both logs also carry, on every turn, `ERROR codex_models_manager::manager: failed to renew cache
TTL: missing field supports_parallel_tool_calls` — a models-cache format mismatch between this CLI
(0.147.0) and a newer cache file. It is noise: the h-fix review ran eleven minutes past the first
one and kept working. **A codex failure is exactly one of: a `400 invalid_request_error` in the
log, or an absent verdict file after the process exits.** Nothing else in the log is a failure
signal, however loud.

## D64 — every inline dispatch is filed verbatim before it is sent (2026-09-05)

Codex H-P2: the h-fix reviewer packet told the reviewer to audit "the inline dispatch," and the
mission tree contained no such artifact — the dispatch was a SendMessage body that existed only in
the orchestrator's transcript. Every resume in this mission (sealedrows ×7, h-diag ×3, w3 ×1) was
dispatched the same way. A reviewer cannot check base, scope or instruction drift against text it
cannot see; a packet that cites an unfiled artifact is testimony.

**Ruling.** Before any SendMessage that dispatches or re-scopes a seat, its exact body is written to
`packets/dispatches/<lane>-<n>.txt` and the message names that path. The reviewer packet cites the
path. Reconstructed copies of earlier dispatches are marked RECONSTRUCTED in their first line —
they are from the orchestrator's transcript, not from a filed original, and a reviewer weighs
them accordingly.

Companion rule from H-P1 (defect #12): **a packet that lists mechanisms states the invariant every
mechanism must preserve and labels each as a hypothesis subject to that check.** Listing an
historical code shape as a "route" without its invariant handed the seat an unsafe option it had
to discover was unsafe.

## D65 — V ruling: every Codex invocation uses gpt-6-astra at xhigh (2026-09-05)

V, verbatim intent: *"change the model for the Codex worker … to GPT-6 Astra Extra High, since this
is their newest model and I want this one to do all the work that is needed when invoking Codex."*

Only V edits the roster; this is a roster change and it is recorded as one. It supersedes the
model half of D63: from the next dispatch, every `codex exec` in this mission passes
`-m gpt-6-astra -c 'model_reasoning_effort="xhigh"'`. D63's other rules stand unchanged — the
model is still passed explicitly on every call (never inherited from the config default, even
though the config now happens to agree), the resolved `model:` line is recorded in each review's
ledger row, and a dispatch that completes in under three minutes is a failure until its verdict
file is read.

**Precondition, measured:** codex-cli 0.147.0 refuses this model with a 400 (*"requires a newer
version of Codex"*). The install is a standalone bundle at `~/.codex/packages/standalone/`; the
newest published CLI is 0.153.4 (2026-09-04). The ruling takes effect the moment an upgraded CLI
accepts a `-m gpt-6-astra` probe from inside a lane worktree, exactly as the gpt-5.6-sol probe was
run. Until then dispatches would fail, so they continue on gpt-5.6-sol with that fact stated in
each ledger row.

**Continuity note for the record:** seven sealedrows reviews, the h-fix review, and the t17t9 r1
review ran on gpt-5.6-sol. Reviews after the switch are a different lens; where a rework round's
r2 verdict disagrees with its r1 on a point of fact, the disagreement is a finding, not noise.

### D65 — precondition MET 2026-09-05 12:25 EEST

`codex update` (the CLI's own updater; standalone bundle, no network installer) took 0.147.0 →
**0.153.4**; the 0.147.0 release is retained at
`~/.codex/packages/standalone/releases/0.147.0-aarch64-apple-darwin`, so rollback is repointing
the `current` symlink. Probe from inside lane-h-diag, read-only sandbox:
`model: gpt-6-astra · reasoning effort: xhigh · reply: OK · exit 0`. Every flag this mission uses
(`--cd`, `--sandbox`, `-c`, `-m`) is accepted by 0.153.4. The models-cache ERROR lines that D63
ADDENDUM called noise: **0 in the probe log** (the mismatch was version-bound).
**Effective now: every `codex exec` passes `-m gpt-6-astra -c 'model_reasoning_effort="xhigh"'`.**

## D15 ADDENDUM — the two lint audits are run and reported separately (2026-09-05)

`pnpm lint` is `pnpm run audit:architecture && pnpm run audit:source`. The architecture audit has
been red at integration since 2026-08-28 (three `obs-capture` edge violations, F31). Because of
the `&&`, **the source audit has not run in any lane's lint gate this week**: the record shows a
command, a body and `EXIT = 1`, and every seat correctly wrote "lint red — predates me" while
measuring only half of what lint checks. Found by the W3 seat, which ran the halves separately.

**Ruling.** A lint gate runs `audit:architecture` and `audit:source` as two gate records and
reports each. "Pre-existing" is claimed per audit, by named violation, against the integration
baseline — never for `pnpm lint` as a whole while one half is short-circuiting the other. F31 is
the ticket that owns the architecture half's three violations; until it lands, the architecture
audit's verdict is read as "the three known, plus anything new," and a new edge is judged by its
absence from that list, not by exit code.

## D60 ADDENDUM — how a merge dry-run is asked (2026-09-05)

`git merge-tree --write-tree` takes COMMITS. Handed a tree object it exits non-zero with *"not
something we can merge"*, which is not a merge result. To ask whether two lane tips conflict with
each other, use the three-commit form against their common base:
`git merge-tree --write-tree --merge-base=<base> <tipA> <tipB>` — exit 0 with a tree is clean,
exit 1 with a conflict listing is a conflict, anything else is a tool error and must be printed as
one. A dry-run script's failure branch never labels a non-1 exit as a conflict. (Orchestrator
defect #14: two lanes ruled conflicting, a re-base step invented, on exactly that misread.)

## D64 ADDENDUM 2

**D64 ADDENDUM 2 (2026-09-05) — every mission-file mention in a packet is ABSOLUTE, and packets are linted before dispatch.**
Codex's demo-path r1 finding R1: my reviewer packet named the dispatch as `dispatches/demo-path-1.txt`; the
file is under `packets/dispatches/`. Third occurrence of the class (h-diag §6 relative paths, D61 ADDENDUM,
was the second). A finding returning in a third form is evidence about the mechanism: I write paths from the
mission root by habit and the reader is never at the mission root. Mechanism, not resolve: `tools/packet-lint.sh`
fails any packet with a bare `packets/ dispatches/ agent-reports/ logs/ board/` mention that is not prefixed by
the mission's absolute path. First run over the existing packets is in `logs/packet-lint-first-run.txt`
(historical; not rewritten — they were already consumed). Every packet from now on is linted before its dispatch
line, and the reviewer's packet-audit heading may cite a lint failure as a packet defect.

## D66

**D66 (2026-09-05 15:53) — the closing run's target is the dev-reconciled tree, and "green" on that tree is the reconciled accounting, not T0's closed list.**
V ruled (V-TARGET-TREE) that the ceremony on real relays runs on W5's reconciled lane after V merges it into dev. Consequences: (1) the F-T17T9-3 fix lane (`lane/t17t9-3`) is cut from lane/devsync's round-3 tip so that its batch b14 measures the tree the run will use; (2) T0's closed-list classifier does not apply to that tree — its parents are dev and integration, so a batch there is green when every failing name is attributed to a parent (codex W5 r1 F1's four-count accounting) and NO name is unexplained; (3) every lane that lands on integration after this point must be transferred to the reconciled line explicitly (the W4 pattern, reviewed), because W5 has no rounds left — I do not open a round 4; (4) the mission branch still carries every fix (transfer back to integration), so the mission record and the shipped tree do not diverge.

## D64 ADDENDUM 3

**D64 ADDENDUM 3 (2026-09-05 15:55) — the lint gates by EXIT STATUS, unpiped.** The W5 r2 reviewer packet was dispatched with a lint failure because the dispatch line read `tools/packet-lint.sh … | cut … || exit 1` — the `||` tested `cut`. The mechanism I built two hours earlier did not gate because I wired it wrong. Rule: the lint call stands alone on its line, `tools/packet-lint.sh <packet> || exit 1`, before any dispatch command; `set -o pipefail` is not relied on. The W5 r2 packet is left as sent (the record must match what the reader read; its header carries the absolute mission root, so the reader resolves the one relative mention).

## D63 ADDENDUM 2

**D63 ADDENDUM 2 (18:44 2026-09-05) — a verdict is final only when its writer has EXITED.** The t17t9-3 r1 verdict file carried its `MERGEABLE:` line at 18:40 and I acted on it (round-3 packet, tickets, ledger); at 18:43 codex was still editing the same file (mtime moving, stdout mid-diff). The watcher's condition was "file exists and has MERGEABLE" — necessary, not sufficient. Rule: every verdict watcher requires BOTH the MERGEABLE line AND no `codex exec` process for that lane; on landing, the orchestrator snapshots the verdict into `logs/<lane>/` before reading it (capture-before-destroy, D60 — the file is rewritten in place by its author). If a verdict changes after it was acted on, the delta is read and the seat is told by addendum; the earlier reading is never silently replaced.

## D64 ADDENDUM 4

**D64 ADDENDUM 4 (19:09 2026-09-05) — the lint gates the DISPATCH FILE; sent text is annotated, never rewritten.** A worker packet accumulates rounds; text already sent cannot be edited (the record must match what the reader read), so a whole-packet lint fails forever on a historical defect. Rule: before each dispatch, the section being sent is written to `packets/dispatches/<lane>-<n>.txt` and THAT file is linted (`tools/packet-lint.sh <dispatch> || exit 1`); historical defects in earlier sections get an appended NOTE naming the absolute path, and the ledger charge. The worker packet file is the cumulative record; the dispatch file is the unit of dispatch.

**D63 ADDENDUM 2, note (19:55):** the first exit-aware watchers never fired because `ps -eo command | grep "codex exec" | grep -q "<lane>"` matched the WATCHER'S OWN command line (it contains both strings). A liveness probe must use a pattern its own text does not contain — the bracket trick `grep "codex ex[e]c" | grep "lane-t17t9-[3]"` — or `ps -p <pid>` when the pid is known. The oracle verdict was read by hand at 19:07 (file present since 18:49, writer gone); the t17t9-3 r2 watcher re-armed at 19:55 with the fixed probe.

## D61 ADDENDUM 2

**D61 ADDENDUM 2 (20:51 2026-09-05) — the grant is checked against the verdict by a tool before a rework dispatch.** Three packets this evening could not reach their duty because a file the verdict itself named was missing from the grant (#27 S06 consumer, #29 no mutation target, #31 the round-2 ledger under logs/devsync/). Each was one diff away. `tools/grant-check.sh <verdict> <dispatch>` extracts every file path the verdict cites and fails if the dispatch neither grants it nor names it; it runs beside `packet-lint.sh` on the dispatch file, unpiped, before the dispatch line. The records seat's UPGRADE 2, adopted the same day.

**D63 ADDENDUM 2, second note (22:30):** pattern-based liveness probes (`ps | grep "codex ex[e]c" | grep "<lane>"`) proved unreliable in background watchers — two never fired. The rule is now: capture the codex pid at dispatch (`$!`) and wait with `ps -p <pid>`; when the pid is gone, require the verdict's final line and snapshot the file. Pattern probes are for a human at the keyboard, not for a watcher.

## D67

**D67 (22:39 2026-09-05) — every finding and every claim in a report carries a STRENGTH: entailed / consistent-with / undetermined.** Proposed by the W5 records seat after codex found four overreaches that were one defect: a sentence asserting more than its cited evidence supported, each where the honest word was "undetermined" and the skeleton had no slot for it. From now on the worker report skeleton's per-item block gains `STRENGTH:` beside `VERDICT / CONFIDENCE / STRONGEST COUNTER`, and the reviewer skeleton's per-finding block carries it too; "consistent-with" is the ceiling for any attribution not measured directly. The orchestrator's ledger rows obey the same rule — the "9 of 9" this seat traced to LEDGER.md:319 was a count presented as entailed that was consistent-with at best.

**D67 ADDENDUM (00:23 2026-09-06) — after any per-item retraction, sweep the universals.** The W5 records seat's U9, adopted: `tools/universal-sweep.sh <record>` lists every universally quantified sentence (all / every / none / no unexplained / exactly / always / never) so the author re-checks which of them depended on the retracted item. Retracting a premise and leaving the conclusion standing cost that ticket two rounds. The tool lists; the author judges; the reviewer runs it too.

## D68

**D68 (08:03 2026-09-06) — V ruled: build the real evaluator for the depth oracle's derivation arm.** Three rounds of heuristics (a regex guard, a length-preserving list, a closed-grammar simulation with a "terminal → withhold" rule) each fixed the reported false positive and each left a soundness hole codex could name. V chose soundness over landing: F-T1-ORACLE-EVALUATOR is a V-ruled ticket, day-scale, planned first by an architecture seat (grammar, lexer that knows strings/templates/regexes, evaluator with real ordering and terminal selection, the declared scope written into the test, the LoginFlow shape as a modelled case not an exclusion), reviewed by codex before any worker round. lane/t1-oracle-loginfp stays unmerged as the history of what was tried; its round-3 tip is the evaluator lane's starting corpus of controls (27 layout classes, eight mutants). The three s1-1 names stay red on the reconciled line, attributed, until the evaluator lands.

**D67 ADDENDUM 2 (08:10 2026-09-06) — summary lines are derived, never recalled.** The W5 records seat's U10, adopted: any count or aggregate in a handoff or ledger row is computed from the enumeration it summarises in the same pass (a grep, a wc, a table), and until a reviewer or tool recomputes it the record calls it "checkable, not checked". Four consecutive rounds on one ticket failed on a recalled count after the unit rule existed; naming the unit was necessary, not sufficient.

**D67 ADDENDUM 3 (08:28 2026-09-06) — after a cited fix, state the rule and re-read for the same decision.** The W5 records seat's U11, adopted: a text sweep (D67 ADDENDUM) catches repeated TEXT; the fifth instance on that ticket was repeated REASONING — the right distinction applied three lines above the defect and abandoned where the reviewer's span ended. So: after fixing a cited defect, write the one-sentence rule the fix embodies, then re-read the whole record asking only "where else did I decide this?" — before the handoff, and the reviewer asks the same question. The seat's own scoping of a correction is checkable, not checked.

**D68 ADDENDUM (09:36 2026-09-06) — the classic TypeScript parser, pinned, as the evaluator's lexer; the alias devDependency granted.** The plan's second revision accepts codex's recommendation (the TS 7 `unstable/ast` scanner track withdrawn after B1: "it lexed" is the wrong gate category; `createSourceFile` at 5.9.3 parses the 232-file corpus with 0 diagnostics and finds what the driver lost). 5.9.3 is not reachable from the root test context (root `typescript` is 7.0.2's shim), so the worker's round 0 gets `package.json` and `pnpm-lock.yaml` in its contract for exactly one change: a root aliased devDependency `"typescript-classic": "npm:typescript@5.9.3"`, its lockfile entry, one install; the lockfile delta is reviewed by codex before any merge (D9 ADDENDUM). Forbidden mechanisms: the TS 7 scanner; a relative import into apps/ui or .pnpm. LoginFlow.tsx stays a named temporary mutant target only. "≤ 1 implementation file per round, the oracle test co-touched" is the reading.

**D68 ADDENDUM 2 (16:39 2026-09-06) — the round-0 gate runs under Node 25.7.0; "Node 22.23.1 unverified" is a named fact, carried forward.** The repo declares 22.23.1; this machine has 25.7.0 and no version manager; the orchestrator does not install runtimes on V's machine. V accepted the gate under 25.7.0. The fact is written on the ticket, in the round-0 packet, in every dependent round's packet and in every review packet for this lane, in these words: "Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only." No seat may describe the gate as discharged for 22.23.1.

**D68 ADDENDUM 3 (19:34 2026-09-06) — the mutation manifest is the worker's, gated by codex before round 2.** After the V-authorised bounded round, codex confirmed the architecture and four of five contracts and found the mutation manifest still not executable as written (K16, K21, K31, K43, K45, K8–K10). V ruled: rounds 0–1 proceed; the worker files the corrected manifest in round 1 against the real parser output (every row: precise rule edit, fixture or named shipped assertion, observable, baseline, mutant, first usable round, restoration obligation; K8/K9/K10 given a disposition; display/identity assertions compulsory); codex reviews the manifest before round 2 (implementation) is dispatched. No architecture round exists after this.

**D-tooling note (22:27 2026-09-06) — mutate.sh v3.** Every mutation transcript from now on ends in a RESULT line and a nonzero exit on any inconsistent gate; interrupted runs restore. Packets cite `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh` (v3) and may set MUT_EXPECT for the declared anchor multiplicity. Transcripts made with v2 (rounds up to evaluator r1) remain valid where their gates read pre 0 / applied ≥ 1 / restored 0 / HASHES MATCH / porcelain [].

## D69

**D69 (09:59 2026-09-07) — V's directive on the evaluator: one more rework with the current setup; if it does not pass review, Codex implements and the orchestrator reviews.** V charged the orchestrator with letting this ticket run far longer than needed. The rule now: the V-authorised rework carries a mandatory boundary sweep of every rule (one admitted and one rejected boundary per rule, derived from the spec) and the reviewer's full attack list as a checklist before filing. If codex's next verdict still blocks, the roles switch without another V question: `codex exec --cd <lane> --sandbox workspace-write` implements round 3 from its own residual and reconciliation (template packets/t1-oracle-evaluator-codex-implementer.TEMPLATE.md); the orchestrator reviews by artifact (it wrote none of the code); the Opus worker seat is released. Every future evaluator packet states the cost so far and the rounds remaining.

## D70

**D70 (10:16 2026-09-07) — V delegated the dev merges to the orchestrator.** Scope, in V's words: do the merging yourself; take latest from dev and merge it; at an appropriate time, not mid-round. Rules under it: (1) fetch first and compare origin/dev with the reconciliation base b5a6b6eb; if dev moved, reconcile before merging (a dry-run merge-tree for every step, tree compared, gates on the result); (2) the order is lane/devsync (2af816f1) then lane/t17t9-3 (85a05425); the evaluator lane is NOT merged until it passes review; (3) the main checkout's uncommitted TOOLING-TRAPS.md is captured before anything touches it and re-reconciled after, never overwritten silently; (4) **no push** — V said merge, not push; pushing remains V's; (5) every merge is a ledger row with the tree hash and the gate result; (6) "not in the middle of a round" means: no merge while a seat is mid-work in a lane the merge touches — the evaluator's lane is untouched by these merges.

## D71

**D71 (11:04 2026-09-07) — the boundary sweep and the reviewer's attack list are first-round deliverables of every implementation ticket.** The evaluator ticket cost three review cycles finding defects at rule boundaries the seat had tested only on the happy path; when V forced a sweep ("make it worth it"), the seat reported further defects of its own in under an hour (it said "six"; codex r2c F1 found the count inconsistent — 4+1+2=7 against an enumerated five — so the number is UNDETERMINED; the rule stands on the reviewer's own regenerated tables, which found the sweep incomplete on fifteen rule families). From now on, every worker packet for an implementation round carries two duties before filing: (1) for every rule the round implements, one admitted-boundary and one rejected-boundary assertion derived from the spec text, never from what the implementation prints; (2) the accumulated reviewer attack list for that ticket (every counterexample class from every prior verdict) run as a checklist and filed as a table (class · input · spec-expected · observed · STRENGTH). The orchestrator maintains the attack list per ticket in the mission dir. The seat's words: "the sweep was cheap; it was simply never required."

**D64 ADDENDUM 5 (13:01 2026-09-07) — records are stamped to the round's FINAL tip: commit everything first, measure last.** The sessions seat staled thirteen records twice (round 0 and round 1) by measuring, then committing a traps entry, so every stamped record pointed at a superseded commit and had to be re-taken (~6 min each time). The seat's own words: "it needs to be a packet step rather than a paragraph I write." From now on every worker packet's gate section says, in order: (1) commit every source, test and docs change of the round, including TOOLING-TRAPS; (2) then take the gates, transcripts and stamps at that tip; (3) if anything is committed after a record, the record is re-taken. `tools/stamp-check.sh` at the final tip must report zero flagged records other than the deliberately preserved RED/baseline captures, which the report names.

**D64 ADDENDUM 6 (19:59 2026-09-07) — the records block is one text, pasted into every worker packet.** Five lanes today each re-learned a records rule the previous lane had already paid for: gate-run.sh unnamed (the dev-health seat hand-rolled thirteen records and re-took them after finding D45 itself), the zsh pipe-status trap, mutate.sh's append, a declaration-level mutant that pins nothing, stamps taken before a docs commit. From now on every worker packet carries `packets/WORKER-RECORDS-BLOCK.md` verbatim under "## Records and gates"; the packet lint passes it because its paths are absolute; a packet without the block does not go out.

**D64 ADDENDUM 7 (21:03 2026-09-07) — tool versions switch only between lanes, after review.** The record emitters (`tools/gate-run.sh`, `tools/mutate.sh`) and the comparator (`tools/stamp-check.sh`) are reworked under `tools/staging/` with a preserved fixture generated by the staged emitters themselves, reviewed by codex there, and swapped into `tools/` only when no seat is mid-round (a running seat's records must all be in one format). Legacy records stay readable: the comparator keeps the prior format's rules under a "legacy" label and counts them.

## D72

**D72 (00:39 2026-09-08) — V's go for the closing run, and three rulings with it.** (1) GO: the acceptance ceremony runs ONCE on dev 169941c6 (seven lanes merged under D70; not pushed), captured under `logs/closing-run/`; the 50-minute full-suite gate on this tip is taken AFTER the ceremony so the two do not compete for the machine. (2) CREDENTIAL EXCEPTION to D18, for this run only: V pasted the ceremony's 43-character service credential into the chat and ruled "use the pasted one; you run it" — the orchestrator exports it into its own shell for the single command and never writes it to any file or record (this entry records the ruling, not the value). (3) "Real money": corrected from source — the relays spawn V's logged-in CLIs (claude via keychain login, codex, grok), so the run consumes V's subscription usage, not separate per-token API billing; the earlier packet wording was carried over, not read. (4) After the closing run: KEEP GOING on the queue, one lane at a time, until V says stop (V declined the proposed stop); the record-tooling rework (F-TOOL-MUTATE-3) stays at the cap awaiting V's separate row.

**D64 ADDENDUM 8 (09:26 2026-09-09) — the known-red list on a gate line is derived, not remembered; comment-only changes get a confirmatory gate, named as such.** From the known-reds lane (self-charge #55; the seat's self-report §1–§2, §5, §7). (1) Every worker packet's KNOWN REDS block is DERIVED from the last full-suite attribution on the lane's base (every red name in it, each with its ticket as owner), never from the lane's own tickets or the orchestrator's memory — a red row inside a known set with no owner sat twelve days (pro01) and hid two same-cause siblings (xrev01, load01). A known red with no ticket is filed before the packet goes out. (2) The closing sentence reads "no additional failures in the lane's gate set", never "anywhere" — the wider claim is the orchestrator's full-suite gate, not the seat's. (3) When a change is comment-only and a cheaper behavioural observer over the same text exists (the mechanical comment-only diff, the compiler, a unit test that executes the region), the packet may mark the expensive gate `confirmatory` and say why; the seat still runs it, and the disclaimer about concurrent timings is not needed because nothing is being measured. (4) "RED first" for a lane whose reds already exist on the base and whose fix is fixture-only means: capture the red at the base with a clean tree before the fix lands; no commit is manufactured to have one. (5) A hand-written record (a baseline note, a RED capture note) carries `commit=<40 hex>` on line 1 or stamp-check says NO-STAMP.
