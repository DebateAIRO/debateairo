# Runs the pass-3 checks (p3_checks.py, unchanged) on SPEC-v4 of S01 and S02. The one v4 case
# the pass-3 executor cannot model (role-provider-dropped: it needs R1.12's role seed) is left to
# p4_checks.check_v10 and dropped here, by name only.
import sys; sys.path.insert(0, "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REQ-FIX-PES")
import p3_checks as c
real_read = c.read
c.spec = lambda version, code: real_read(f"{c.MISSION}/slices/{code}/SPEC-v4.md")
real_cases = c.s01_cases
c.s01_cases = lambda text, version: [x for x in real_cases(text, "v3") if x[0] != "role-provider-dropped"]
sys.argv = ["p3_checks.py", "v3"]
sys.exit(c.main())
