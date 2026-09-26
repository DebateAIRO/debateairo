import sys
S = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S01/"
t = open(S + "SPEC-v3.md", encoding="utf-8").read()
lines = t.split("\n")
assert lines[3].startswith("SUPERSEDES `SPEC-v2.md`")
lines[3] = ("SUPERSEDES `SPEC-v3.md` (and through it `SPEC-v2.md` and `SPEC.md`; all three frozen and byte-identical) — written by REQ-FIX-PES-p4 at node REQ-FIX pass 4 on V's rulings `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:19-27` (V-10; V-12/V-13), not on a review verdict. "
 "Requirements CHANGED from v3: **R1.3** (the order of checks gains step (6), the role rows, ahead of the publication, now step (7); V-10), "
 "**R1.12** (the acceptance also proves R1.14: after the `published` case it adds two role rows to the version that case published, and runs one more case against them; V-10), "
 "**R1.14** (NEW: the command refuses, with `PES_PUBLISH_ROLE_PROVIDER_DROPPED:`, a provider set that drops the provider a `synthesizerRoleRef` or `evaluatorRoleRef` row of the base register names; V-10). "
 "Requirements UNCHANGED, byte for byte: R1.1, R1.2, R1.4, R1.5, R1.6, R1.7, R1.8, R1.9, R1.10, R1.11, R1.13. "
 "Acceptance §5 changed: the case table gains `role-provider-dropped`, and its lead-in says which lines were executed and at which pass; steps 2, 3, 4 and 6 take the ONE exit rule S02 shares (V-12/V-13: exit 0 on PASS, 1 on FAIL and on UNVERIFIED; the verdict is the acceptance's OWN last line, with pnpm's `$ tsx …` echo before its output and pnpm's `[ELIFECYCLE]` notice after it allowed). §6 records V-10 as ruled. "
 "This file is the SPEC of record; every later packet names it by this file name.")
t = "\n".join(lines)

def rep(old, new):
    global t
    n = t.count(old)
    assert n == 1, (n, old[:80])
    t = t.replace(old, new)

rep("""FROZEN at REQ-FIX-PES's READY marker on t_690beb44 (2026-09-24). Pass 3 is the last rework pass; a
change after that marker is a V row, never an in-place edit.""",
"""FROZEN at REQ-FIX-PES-p4's READY marker on t_aad48581 (2026-09-25). This pass applies V's rulings;
a change after that marker is a V row, never an in-place edit.""")

rep("unvetted vendor, R1.7; (5) the self-check of this requirement; (6) the publication, R1.4. The",
    "unvetted vendor, R1.7; (5) the self-check of this requirement; (6) the role rows, R1.14; (7) the publication, R1.4. The")

rep("""the publish command once per case of §5's table and proves R1.2's gate and base-row refusals,
R1.3, R1.5, R1.7, R1.8 and R1.9 on this Mac without a real key.""",
"""the publish command once per case of §5's table and proves R1.2's gate and base-row refusals,
R1.3, R1.5, R1.7, R1.8, R1.9 and R1.14 on this Mac without a real key.""")

rep("""server and removes its directory (`tests/support/testDatabase.ts:121-125`). No step connects to
`:55432` or to any other port in COMMON §6's NO-TOUCH list.
""",
"""server and removes its directory (`tests/support/testDatabase.ts:121-125`). No step connects to
`:55432` or to any other port in COMMON §6's NO-TOUCH list. After the `published` case and before
the `role-provider-dropped` case, the acceptance adds two role rows to the register version the
`published` receipt names, with `publishReplacementRegisterFixture(database.pool, <that version>,
[the two rows], "provider-env-selection/S01#acceptance-role-rows")`
(`tests/support/registerFixtures.ts:70-86`): `synthesizerRoleRef` with the value
`{"kind":"SYNTHESIZER_ROLE_REF","providerRef":"vendor:a","provisional":true}` and `evaluatorRoleRef`
with the value `{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:z","provisional":true}` — the
exact shapes the register's row schema admits (`packages/register/src/algorithm-policy.ts:404-413`),
each with the source ref `provider-env-selection/S01#acceptance-role-rows`. It then prints
`PES-S01 ROLE-SEED version=<v>`, where `<v>` is the version that call's receipt names, and runs the
`role-provider-dropped` case with `REGISTER_VERSION=<v>`. `vendor:a` is the ref of ROSTER ELEMENT E
(§5) and `vendor:z` is the ref of no element, so the synthesizer row passes R1.14 and the evaluator
row does not.
""")

rep("""`apps/runner/src/main.ts`, `packages/register/src/runtime-environment.ts` or any `*.env.example`.
""",
"""`apps/runner/src/main.ts`, `packages/register/src/runtime-environment.ts` or any `*.env.example`.

**R1.14 — the role rows of the base register (V-10).** Step (6) of R1.3 reads, from the rows of
the base register version (R1.2, `rows`), the row `synthesizerRoleRef` and then the row
`evaluatorRoleRef`. A row that is absent is not checked, so a base that holds neither row passes
this step: the seed of R1.12 holds neither (`grep -c RoleRef
tests/support/fixtures/register-development-v4.json` prints `0`), and §5's `published` case is that
path. A row that is present passes only when its value is a JSON object whose `providerRef` member
is a string equal to the `provider_ref` of one element of the roster. The first present row that
does not pass stops the run before any write: the command exits non-zero and prints
`PES_PUBLISH_ROLE_PROVIDER_DROPPED:` followed by that row's key (`synthesizerRoleRef` or
`evaluatorRoleRef`), with no other text on that line. This step only refuses; a row that passes is
carried forward byte for byte, as R1.2 carries every row. It is the development publisher's check
(`apps/runner/src/dev-deployment-register.ts:848-858`, `DEV_ALGORITHM_REGISTER_ROLE_REFS_UNRESOLVED`)
on the hosted path, and it moves to publish time the failure every run would otherwise meet at claim
(`apps/runner/src/index.ts:2906-2938`, `SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:<role>`). V ruled it
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:22`, V-10).
""")

rep("""its row names applied to E, run with R1.12's environment plus the one its row names. Every line
was executed for that exact fixture at this pass, in the order R1.3 fixes""",
"""its row names applied to E, run with R1.12's environment plus the one its row names. Every line
of the first six cases was executed for that exact fixture at pass 3, in the order R1.3 fixes""")

rep("""`PES_PUBLISH_BASE_ROW_ABSENT:`, come from R1.2's own rules, applied in that order before any
shipped function sees the roster:""",
"""`PES_PUBLISH_BASE_ROW_ABSENT:`, come from R1.2's own rules, applied in that order before any
shipped function sees the roster. The `role-provider-dropped` line comes from R1.14's own rule; it
needs R1.12's role seed and a database, and it was not executed at pass 4:""")

rep("""| `published` | `E` | — | — | the three lines of R1.8 |
""",
"""| `published` | `E` | — | — | the three lines of R1.8 |
| `role-provider-dropped` | `E` | — | `REGISTER_VERSION=<v>` of R1.12's role seed | `PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef` |
""")

rep("""fixture v2 used for `targets-rejected`; it now fails where R1.2 says it fails.)""",
"""fixture v2 used for `targets-rejected`; it now fails where R1.2 says it fails. `role-provider-dropped`
prints `evaluatorRoleRef`, not `synthesizerRoleRef`: its synthesizer row names `vendor:a`, which the
roster keeps, so a command that refuses whenever a role row exists prints the wrong key.)""")

rep("""2. `cd` into the slice lane the orchestrator names in the TEST(S) ticket and run
   `pnpm pes:accept-publish-set 2>&1 | tee /tmp/pes-s01-accept.log`. Read its output to the end.
3. The first line reads `PES-S01 SCRATCH-DB port=<p> seeded-version=4 rows=32`, where `<p>` is the
   port the operating system assigned (R1.12).""",
"""2. `cd` into the slice lane the orchestrator names in the TEST(S) ticket and run
   `pnpm pes:accept-publish-set > /tmp/pes-s01-accept.log 2>&1; echo "exit=$?"`, which prints the
   acceptance's exit code; then read the whole log with `cat /tmp/pes-s01-accept.log`. The log may
   begin with pnpm's own echo line, `$ tsx …`, and, after a non-zero exit, end with pnpm's own
   notice, a line beginning `[ELIFECYCLE]`; neither line is the acceptance's output.
3. The acceptance's first line — the log's first line, or its second when the first is pnpm's
   `$ tsx …` echo — reads `PES-S01 SCRATCH-DB port=<p> seeded-version=4 rows=32`, where `<p>` is the
   port the operating system assigned (R1.12).""")

rep("""   the seed's 32 rows with the `configuredProviderSet` row replaced and none added — and whose
   `registerVersion` is greater than 4.""",
"""   the seed's 32 rows with the `configuredProviderSet` row replaced and none added — and whose
   `registerVersion` is greater than 4. Next comes `PES-S01 ROLE-SEED version=<v>` (R1.12), and then
   the `role-provider-dropped` case's line.""")

rep("""6. The run's LAST stdout line is exactly `PES-S01-ACCEPT: PASS`. A failing run's last line begins
   `PES-S01-ACCEPT: FAIL ` and names the first case that did not hold.""",
"""6. The verdict is the LAST line of the acceptance's OWN output: the log's last line, or the line
   before it when the log's last line begins `[ELIFECYCLE]`. A passing run's verdict is exactly
   `PES-S01-ACCEPT: PASS` and step 2 printed `exit=0`. A failing run's verdict begins
   `PES-S01-ACCEPT: FAIL ` and names the first case that did not hold, and step 2 printed `exit=1`.
   A run whose scratch database of R1.12 could not start — the one outcome this acceptance reports
   UNVERIFIED — has the verdict `PES-S01-ACCEPT: UNVERIFIED ` followed by the database's own error,
   and step 2 printed `exit=1`. Every case that runs is decided PASS or FAIL.""")

rep("""One `V-ROW: NEW` block is raised by this pass, in `DECISIONS.md` of this slice: whether the hosted
publication should refuse when a role row carried forward by R1.2 (`synthesizerRoleRef`,
`evaluatorRoleRef`) names a provider the new set drops. SPEC-v3 carries every non-provider-set row
forward byte for byte and builds no such check; the seed of R1.12 holds neither row, so the
acceptance is unaffected either way.""",
"""None open. Pass 3's `V-ROW: NEW` — whether the hosted publication refuses when a role row carried
forward by R1.2 (`synthesizerRoleRef`, `evaluatorRoleRef`) names a provider the new set drops — was
transcribed as V-10, and V ruled "Yes, refuse at publish"
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:22`). R1.14 is that ruling, and §5's
`role-provider-dropped` case proves it. V's ruling on V-12/V-13
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:24`) is §5 steps 2, 3 and 6.""")

open(S + "SPEC-v4.md", "w", encoding="utf-8").write(t)
print("written", len(t.split("\n")))
