#!/usr/bin/env python3
"""REQ-FIX-PES pass-3 checkers — one per finding assigned by reviews/REQ-REV-p2.md, plus the
class members the sweep found. Each tests the PROPERTY the lens named by EXECUTING the shipped
functions of the read-only planning lane (through p3_exec.ts), not by finding a string.

    python3 p3_checks.py v2    # the SPEC of record the lens reviewed — MUST FAIL
    python3 p3_checks.py v3    # the rework                             — MUST PASS

Written and run against v2 BEFORE any v3 text existed, so no check was shaped to fit v3.
What a check reads from a SPEC is only WHICH fixture, rule or name the SPEC states; the verdict is
what the shipped code does with it. Exit 0 = every check held, 1 = at least one did not.
"""
import json
import re
import subprocess
import sys

REPO = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LANE = f"{REPO}/.worktrees/pes-base/dialectical-engine"
MISSION = f"{REPO}/docs/missions/provider-env-selection"
HERE = f"{REPO}/.hermes/reports/provider-env-selection/probes/REQ-FIX-PES"
TSX = f"{LANE}/node_modules/.bin/tsx"

# A valid roster element — the v2 claims are about a DUPLICATE of an otherwise-valid element, so
# the v2 reading needs one. The v3 reading takes E from the SPEC's own fenced block instead.
DEFAULT_E = {
    "provider_ref": "vendor:a", "adapter_kind": "openai-compatible-http", "maker": "Acme",
    "vetting": {"data_use_terms_reviewed_on": "2026-09-01",
                "retention_terms_reviewed_on": "2026-09-01", "named_in_privacy_notice": True},
    "base_url": "https://api.acme.example/v1", "model": "acme-large",
    "runner_authorization_file": "/etc/debateai/runner/providers/acme.header",
    "api_authorization_file": "/etc/debateai/api/providers/acme.header",
    "input_price_micros_per_million": 1000, "output_price_micros_per_million": 2000,
}


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def git_show(ref, repo_relative):
    return subprocess.run(["git", "-C", REPO, "show", f"{ref}:{repo_relative}"],
                          capture_output=True, text=True, check=True).stdout


def execute(request):
    result = subprocess.run([TSX, f"{HERE}/p3_exec.ts", json.dumps(request)],
                            capture_output=True, text=True, cwd=LANE, timeout=120)
    lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
    if not lines:
        raise RuntimeError(f"executor gave no JSON (rc={result.returncode}): {result.stderr[-400:]}")
    return json.loads(lines[-1])


def spec(version, slice_code):
    name = "SPEC-v2.md" if version == "v2" else "SPEC-v3.md"
    return read(f"{MISSION}/slices/{slice_code}/{name}")


def block(text, requirement):
    """The paragraph that starts with **<requirement> (up to the next requirement or heading)."""
    match = re.search(rf"^\*\*{re.escape(requirement)}\b.*?(?=^\*\*R\d|^## )", text, re.S | re.M)
    return match.group(0) if match else ""


def acceptance(text):
    return text.split("## 5. Acceptance")[-1]


# ---------------------------------------------------------------- B1 (S01)
def s01_cases(text, version):
    """[(case, elements, env, expected)] as the SPEC states them."""
    if version == "v2":
        claim = re.search(r"declares the same\s+`provider_ref` twice, so the code is\s+`([A-Z_]+)`", text)
        if not claim:
            return []
        return [("targets-rejected", [DEFAULT_E, DEFAULT_E], {},
                 f"PES_PUBLISH_SET_TARGETS_REJECTED:{claim.group(1)}")]
    fenced = re.search(r"ROSTER ELEMENT E[^\n]*\n+```json\n(.+?)\n```", text, re.S)
    element = json.loads(fenced.group(1)) if fenced else None
    cases = []
    for row in re.findall(r"^\| `([a-z-]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$", text, re.M):
        name, elements, change, env, expected = (cell.strip() for cell in row)
        if element is None:
            continue
        e = json.loads(json.dumps(element))
        if change not in ("—", "-"):
            path, value = (part.strip() for part in change.strip("`").split("=", 1))
            target = e
            keys = path.split(".")
            for key in keys[:-1]:
                target = target[key]
            target[keys[-1]] = json.loads(value)
        count = len([p for p in elements.strip("`").split(",") if p.strip()])
        environment = {}
        if env not in ("—", "-"):
            for pair in env.strip("`").split(","):
                key, value = pair.strip().split("=", 1)
                environment[key.strip()] = value.strip()
        cases.append((name, [e] * count, environment, expected.strip().strip("`")))
    return cases


# The roster gate's uniqueness RULE, as a sentence: the ref "is unique", or a ref appearing in two
# (or more) elements "is refused". A bare keyword is not the rule: the refusal's print format
# ("the repeated ref, for a repeat") names a repeat without stating that a repeat is refused, and
# the first version of this detection (a keyword regex) was satisfied by that clause alone.
UNIQUE_RULE = re.compile(r"`provider_ref` is unique\b"
                         r"|`provider_ref` appears in (two|more than one) elements[^.]*\brefused\b"
                         r"|`provider_ref` appears more than once[^.]*\brefused\b")


def states_unique_gate(r12_block):
    return bool(UNIQUE_RULE.search(" ".join(r12_block.split())))


def check_b1_fixture_codes(version):
    """The lens's first check: the code each fixture prints is the code the shipped functions
    throw for that roster, in the order the command takes them."""
    text = spec(version, "S01")
    cases = s01_cases(text, version)
    if not cases:
        return ["the SPEC names no fixture->code pair to execute"]
    unique = states_unique_gate(block(text, "R1.2"))
    seed = seed_of(text)
    base = seed or {"version": "4", "requiredDistinctMakers": 1, "sourceRef": "stand-in"}
    problems = []
    for name, elements, env, expected in cases:
        printed = execute({"op": "s01_case", "elements": elements,
                           "mode": env.get("DEBATEAI_DEPLOYMENT_MODE"),
                           "registerVersion": env.get("REGISTER_VERSION"),
                           "gate": {"uniqueRefs": unique}, "base": base})["printed"]
        want = "PUBLISHABLE" if name == "published" else expected
        if printed != want:
            problems.append(f"case {name}: the SPEC says `{want}`, the shipped chain prints `{printed}`")
    return problems


def seed_of(text):
    """The base-row source the SPEC names for the acceptance database, read from the lane."""
    path = re.search(r"(tests/support/fixtures/[\w.\-]+\.json)", text)
    version = re.search(r"importHistoricalRegisterFixture\([^,]*,\s*(\d+)", text)
    if not (path and version):
        return None
    rows = json.loads(read(f"{LANE}/{path.group(1)}"))
    for row in rows:
        if row["rowKey"] == "configuredProviderSet":
            value = json.loads(row["valueJsonText"])
            return {"version": version.group(1), "requiredDistinctMakers": value["requiredDistinctMakers"],
                    "sourceRef": row["sourceRef"], "rowCount": len(rows), "path": path.group(1)}
    return {"version": version.group(1), "requiredDistinctMakers": None, "sourceRef": "",
            "rowCount": len(rows), "path": path.group(1)}


def check_b1_base_row(version):
    """N4's pass test: each builder argument has one named source, and that source EXISTS in the
    database the acceptance creates."""
    text = spec(version, "S01")
    seed = seed_of(text)
    if seed is None:
        return ["the acceptance database is seeded from nothing the SPEC names, so the base "
                "`configuredProviderSet` row R1.2 reads `requiredDistinctMakers` and "
                "`sealedSourceRef` from does not exist in it"]
    problems = []
    if not isinstance(seed["requiredDistinctMakers"], int) or seed["requiredDistinctMakers"] < 1:
        problems.append(f"{seed['path']} carries no usable configuredProviderSet.requiredDistinctMakers")
    if not seed["sourceRef"]:
        problems.append(f"{seed['path']} carries no configuredProviderSet sourceRef")
    claimed = re.search(r"rowCount`?[^0-9\n]{0,60}(\d+)", acceptance(text))
    if not claimed or int(claimed.group(1)) != seed["rowCount"]:
        problems.append(f"the published case's rowCount is not the seed's measured {seed['rowCount']} rows")
    if not re.search(rf"REGISTER_VERSION={seed['version']}\b", text):
        problems.append(f"the publishing case's REGISTER_VERSION is not the seed version {seed['version']}")
    return problems


# ---------------------------------------------------------------- B2 (S02)
def check_b2_layout(version):
    """The lens's second check: ONE directory layout satisfies R2.8 (custody), R2.9 (iii) (never
    print the file or its 0700 directory), step 5 (print the scratch path) and step 7 (a grep that
    looks at the real credential path and can fail)."""
    text = spec(version, "S02")
    grep = re.search(r"SCRATCH-DIR //p'[^)]*\)(/[^\"]+)\"", acceptance(text))
    if not grep:
        return ["step 7 names no grep composed from the printed scratch path"]
    suffix = grep.group(1)
    named = re.search(r"`<scratch>/([\w.\-]+/[\w.\-]+)`", block(text, "R2.8"))
    relative = named.group(1) if named else suffix.lstrip("/")
    layout = execute({"op": "s02_layout", "fileRelative": relative,
                      "header": "Bearer pes-s02-fake-vendor-token"})
    problems = []
    if layout["reader"] != "READ_OK":
        problems.append(f"the layout fails the shipped custody reader: {layout['reader']}")
    scratch_line = f"PES-S02 SCRATCH-DIR {layout['scratch']}"
    for forbidden in (layout["file"], layout["custodyDirectory"]):
        if forbidden in scratch_line and forbidden != "":
            problems.append(f"step 5's line prints {forbidden.replace(layout['scratch'], '<scratch>') or '<scratch>'}, "
                            "the credential's 0700 directory, which R2.9 (iii) forbids")
    pattern = layout["scratch"] + suffix
    if not layout["file"].startswith(pattern):
        problems.append(f"step 7 greps `<scratch>{suffix}`, which is not the credential's path")
    leak = f"PES-S02 LEAK {layout['file']}"
    if pattern not in leak:
        problems.append("step 7's grep cannot fail: a line printing the credential path does not match it")
    if pattern in scratch_line:
        problems.append("step 7's grep matches step 5's own lawful line, so it can never print 0")
    return problems


def s02_refusal_readings(text, version):
    """[(expected code prefix, [every lawful reading of the fixture])] for R2.7's five refusals."""
    header = "/etc/debateai/api/providers/acme.header"
    good = "https://api.localtest.me:4455/v1"
    price = {"input_price_micros_per_million": 1000, "output_price_micros_per_million": 2000}
    base = {"provider_ref": "vendor:a", "model": "fake-model"}
    if version == "v2":
        # v2's R2.7 names each case in prose; where the prose leaves a choice open, every
        # reading a coder could take is listed, and a determinate SPEC gives them one outcome.
        return [
            ("PROVIDER_TARGET_LOOPBACK_REFUSED:", [
                {**base, **price, "base_url": "http://127.0.0.1:4455/v1", "authorization_file": header},
                {**base, **price, "base_url": "https://127.0.0.1:4455/v1", "authorization_file": header}]),
            ("PROVIDER_INLINE_CREDENTIAL_REFUSED:", [
                {**base, **price, "base_url": good, "authorization_header": "Bearer x"}]),
            ("PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT", [
                {**base, **price, "base_url": good, "authorization_file": header,
                 "authorization_header": "Bearer x"}]),
            ("PROVIDER_AUTHORIZATION_FILE_ABSENT:", [
                {**base, **price, "base_url": good, "authorization_file": "/nonexistent/pes/absent.header"}]),
            ("PROVIDER_TARGET_PRICE_REQUIRED:", [
                {**base, "base_url": good, "authorization_file": header}]),
        ]
    readings = []
    for row in re.findall(r"^\| `(refused-[a-z-]+)` \| `([^`]+)` \| `([A-Z_:]+)` \|$", text, re.M):
        _, target_json, expected = row
        readings.append((expected, [json.loads(target_json)]))
    return readings


def check_s02_refusals_determinate(version):
    """Class sweep member (found by execution, not assigned): each refusal step 5 names is what
    the shipped chain prints for EVERY lawful reading of its fixture."""
    text = spec(version, "S02")
    readings = s02_refusal_readings(text, version)
    if len(readings) != 5:
        return [f"R2.7 names {len(readings)} executable refusal fixtures, step 5 needs 5"]
    problems = []
    for expected, targets in readings:
        for target in targets:
            outcome = execute({"op": "s02_chain", "target": target})["outcome"]
            if not outcome.startswith(expected):
                problems.append(f"a lawful reading ({target['base_url']}) prints `{outcome}`, "
                                f"step 5 requires `{expected}`")
    return problems


# ---------------------------------------------------------------- N1 (S02)
def check_n1_integers(version):
    text = spec(version, "S02")
    r28 = block(text, "R2.8")
    fresh = re.search(r"probeFreshnessMs`?[^0-9\n]{0,30}([\d_]+)", r28)
    timeout = re.search(r"probeTimeoutMs`?[^0-9\n]{0,30}([\d_]+)", r28)
    as_int = lambda m: int(m.group(1).replace("_", "")) if m else None
    outcome = execute({"op": "n1_resolver", "probeFreshnessMs": as_int(fresh),
                       "probeTimeoutMs": as_int(timeout)})["outcome"]
    problems = []
    if outcome != "CONSTRUCTED":
        problems.append(f"the resolver R2.8 composes, with the integers it names, throws `{outcome}`")
    default = re.search(r"PROVIDER_PROBE_TIMEOUT_MS: positiveInteger\.default\(([\d_]+)\)",
                        read(f"{LANE}/packages/register/src/runtime-environment.ts"))
    if timeout and default and as_int(timeout) != int(default.group(1).replace("_", "")):
        problems.append(f"probeTimeoutMs {as_int(timeout)} is not the loader default {default.group(1)}")
    return problems


# ---------------------------------------------------------------- N2 (S02)
def check_n2_stdout_rule(version):
    """R2.9 (i), applied as the SPEC states it, to the lines the acceptance MUST print."""
    text = spec(version, "S02")
    clause = re.search(r"\(i\)(.+?)\(ii\)", block(text, "R2.9"), re.S)
    if not clause:
        return ["R2.9 has no clause (i)"]
    clause = clause.group(1)
    literal_tail = "pes-s02-fake-vendor-token"
    if "any substring" in clause:
        forbidden = lambda line: any(ch in line for ch in set(literal_tail))  # every 1-char substring
    else:
        token = re.search(r"`([a-z0-9\-]+)`", clause)
        if not token:
            return ["R2.9 (i) names no token"]
        forbidden = lambda line, t=token.group(1): t in line
    codes = [execute({"op": "s02_chain", "target": t})["outcome"] for _, ts in
             s02_refusal_readings(spec("v3" if version == "v3" else "v2", "S02"), version) for t in ts[-1:]]
    required = ["PES-S02 SCRATCH-DIR /tmp/pes-s02-abc", "PES-S02 FAKE-VENDOR https://api.localtest.me:4455/v1"] \
        + [f"PES-S02 REFUSED {code}" for code in codes] \
        + ["PES-S02 ADMITTED vendor:a", "PES-S02 VENDOR-REQUESTS 1 matched 0 rejected", "PES-S02-ACCEPT: PASS"]
    hits = [line for line in required if forbidden(line)]
    return [f"R2.9 (i) forbids a line step 5-8 require: `{hits[0]}`"] if hits else []


# ---------------------------------------------------------------- N3 (S01 PLAN)
PASS2_PLAN_COMMIT = "0e625a59"  # the commit that holds the PLAN the lens reviewed with SPEC-v2


def check_n3_plan_cell(version):
    plan = git_show(PASS2_PLAN_COMMIT, "dialectical-engine/docs/missions/provider-env-selection/slices/S01/PLAN.md") \
        if version == "v2" else read(f"{MISSION}/slices/S01/PLAN.md")
    cell = next((line for line in plan.splitlines() if line.startswith("| R1.9 ")), "")
    spec_r19 = block(spec(version, "S01"), "R1.9")
    problems = []
    if "PES_HOSTED_TARGETS_" in spec_r19 and "PES_HOSTED_TARGETS_" not in cell:
        problems.append(f"PLAN's R1.9 cell forbids the path everywhere while the SPEC admits it on the "
                        f"two PES_HOSTED_TARGETS_*_V1= lines: `{cell.strip()[:90]}`")
    if re.search(r"path,? anywhere", cell):
        problems.append("PLAN's R1.9 cell still reads `path, anywhere`")
    return problems


CHECKS = [
    ("B1  targets-rejected & every case: printed code == shipped chain's code", check_b1_fixture_codes),
    ("B1  base row exists in the acceptance database (N4 pass test)", check_b1_base_row),
    ("B2  one layout satisfies R2.8, R2.9(iii), step 5 and step 7", check_b2_layout),
    ("--  R2.7 refusal fixtures determinate (sweep member)", check_s02_refusals_determinate),
    ("N1  resolver integers named and constructible", check_n1_integers),
    ("N2  R2.9(i) forbids no required line", check_n2_stdout_rule),
    ("N3  PLAN R1.9 cell agrees with SPEC R1.9", check_n3_plan_cell),
]


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "v3"
    failed = 0
    print(f"REQ-FIX-PES pass-3 checkers against {version}")
    for label, check in CHECKS:
        try:
            problems = check(version)
        except Exception as error:  # a crash is a FAIL, never a pass
            problems = [f"CHECK CRASHED: {type(error).__name__}: {error}"]
        if problems:
            failed += 1
            print(f"  FAIL  {label}")
            for problem in problems:
                print(f"          - {problem}")
        else:
            print(f"  pass  {label}")
    print(f"{version}: {'FAIL' if failed else 'PASS'} ({failed} failing checks)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
