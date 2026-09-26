#!/usr/bin/env python3
"""REQ-FIX-PES-p6 checks for V-15 (S01 R1.12's role seed). Each reads what the SPEC states and decides
it against the S01 lane at C1's head (read-only) and the ARCH-FIX-PES-S01-p2 probes (read-only),
never against the SPEC's own say-so.

    python3 checks.py v4    # S01 SPEC-v4.md: MUST FAIL (V-15 is not in it)
    python3 checks.py v5    # S01 SPEC-v5.md: MUST PASS
Exit 0 = every check held.
"""
import glob
import re
import sys

REPO = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LANE = f"{REPO}/.worktrees/pes-s01/dialectical-engine"
S01 = f"{REPO}/docs/missions/provider-env-selection/slices/S01"
VPACKET = f"{REPO}/docs/missions/provider-env-selection/V-DECISIONS-PACKET.md"
PROPOSED = f"{REPO}/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2/proposed/pes-s01-publish-set-acceptance.ts"
D2 = f"{REPO}/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2/d2-role-seed-debug.log"
ROLE_KEYS = ("synthesizerRoleRef", "evaluatorRoleRef")
WORDS = {"two": 2, "fifteen": 15, "seventeen": 17, "eighteen": 18, "sixteen": 16}


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def spec(version):
    return read(f"{S01}/SPEC-{version}.md")


def flat(text):
    return " ".join(text.split())


def block(text, req):
    m = re.search(rf"^\*\*{re.escape(req)}\b.*?(?=^\*\*R\d|^## )", text, re.S | re.M)
    return m.group(0) if m else ""


def lane(path):
    return read(f"{LANE}/{path}")


def manifest():
    """The register's required-row manifest, from every migration that inserts into register.required_row."""
    keys = set()
    for path in sorted(glob.glob(f"{LANE}/migrations/*.sql")):
        sql = read(path)
        if re.search(r"DELETE FROM register\.required_row\b(?!_)", sql):
            raise RuntimeError(f"{path} deletes from the manifest; this check does not model that")
        for m in re.finditer(r"INSERT INTO register\.required_row\s*\([^)]*\)\s*VALUES(.*?);", sql, re.S):
            keys |= set(re.findall(r"\(\s*'([A-Za-z]+)'", m.group(1)))
    return keys


def builder_keys():
    """Every rowKey literal inside the shipped buildAlgorithmRegisterRows (from its line to its closing brace)."""
    lines = lane("packages/register/src/algorithm-policy.ts").splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("export function buildAlgorithmRegisterRows("))
    end = next(i for i in range(start, len(lines)) if lines[i] == "}")
    return set(re.findall(r'rowKey: "([A-Za-z]+)"', "\n".join(lines[start:end + 1])))


def described_seed(r):
    """The row keys R1.12's role-seed publication holds, read from what R1.12 states."""
    f = flat(r)
    seed = {k for k in ROLE_KEYS if f"`{k}` with the value" in f}
    if "buildAlgorithmRegisterRows" in f and \
            "except that function's own `synthesizerRoleRef` and `evaluatorRoleRef` rows" in f:
        seed |= builder_keys() - set(ROLE_KEYS)
    return seed


def check_seed_accepted(version):
    """The seed R1.12 describes holds the whole required-row manifest (the database's rule, 0061:17-28),
    its stated count is the manifest's size, and the two role rows are v4's byte for byte."""
    r = block(spec(version), "R1.12")
    problems = []
    need, seed = manifest(), described_seed(r)
    missing = sorted(need - seed)
    if missing:
        problems.append(f"the seed R1.12 describes lacks {len(missing)} required rows "
                        f"(first {missing[0]}): the database refuses it (d2: "
                        f"{re.search(r'REGISTER_REQUIRED_ROW_MISSING:[a-zA-Z:]+', read(D2)).group(0)})")
    extra = sorted(seed - need)
    if extra:
        problems.append(f"the seed holds rows outside the manifest: {extra}")
    said = re.search(r"That makes (\w+) rows", flat(r))
    if not said or WORDS.get(said.group(1)) != len(need):
        problems.append(f"R1.12 does not state the seed's row count as the measured {len(need)}")
    if "15 other required algorithm rows" in flat(r) and len(need) - 2 != 15:
        problems.append("R1.12 says 15 other rows, but the manifest minus the two role rows is not 15")
    v4 = flat(block(spec("v4"), "R1.12"))
    for value in ('`{"kind":"SYNTHESIZER_ROLE_REF","providerRef":"vendor:a","provisional":true}`',
                  '`{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:z","provisional":true}`',
                  "each with the source ref `provider-env-selection/S01#acceptance-role-rows`"):
        if value in v4 and value not in flat(r):
            problems.append(f"a role row R1.12 names in v4 changed: {value[:50]}")
    if "scratch database only" not in flat(r):
        problems.append("R1.12 does not confine the added rows to the throwaway scratch database (V-15)")
    return problems


def check_builder_input(version):
    """The builder's signature is quoted as the lane has it, and the input R1.12 pins is the one probe d4/d1 ran."""
    f = flat(block(spec(version), "R1.12"))
    problems = []
    lines = lane("packages/register/src/algorithm-policy.ts").splitlines()
    sig = flat("\n".join(lines[232:235]))
    quoted = re.search(r"`(export function buildAlgorithmRegisterRows\(.*?\): readonly AlgorithmRegisterRow\[\])`", f)
    if not quoted:
        problems.append("R1.12 does not quote buildAlgorithmRegisterRows' signature")
    elif flat(quoted.group(1)) != sig.removesuffix(" {").replace("( ", "(").replace(" )", ")"):
        problems.append(f"the quoted signature is not algorithm-policy.ts:233-235 ({sig})")
    if "`packages/register/src/algorithm-policy.ts:233-235`" not in f:
        problems.append("R1.12 does not cite algorithm-policy.ts:233-235")
    ran = flat(read(PROPOSED))
    m = re.search(r"buildAlgorithmRegisterRows\(\{ (.*?) \}\)\.filter", ran)
    probe_input = m.group(1).replace("PES_S01_ROLE_ROWS_SOURCE_REF", '"provider-env-selection/S01#acceptance-role-rows"')
    stated = re.search(r"returns for exactly the input `\{ (.*?) \}`", f)
    norm = lambda s: re.sub(r"\s+", "", s).rstrip(",")
    if not stated:
        problems.append("R1.12 pins no builder input: two seats could seed different providerFamilyMap rows")
    elif norm(stated.group(1)) != norm(probe_input):
        problems.append(f"R1.12's builder input differs from the one probe d4/d1 ran: {probe_input}")
    return problems


CITES = {  # lane path:lines -> token the lines must hold
    ("migrations/0061_algorithm_publication_profiles.sql", "17-28"): "PERFORM register.assert_required_rows",
    ("packages/register/src/algorithm-policy.ts", "233-235"): "export function buildAlgorithmRegisterRows(",
    ("packages/register/src/algorithm-policy.ts", "404-413"): "SYNTHESIZER_ROLE_REF",
    ("tests/support/registerFixtures.ts", "70-86"): "export async function publishReplacementRegisterFixture(",
}


def check_citations(version):
    """Every lane citation V-15 adds holds its token; V's ruling is cited by row id and says what R1.12 does."""
    f = flat(block(spec(version), "R1.12"))
    problems = []
    for (path, lines), token in CITES.items():
        if f"`{path}:{lines}`" not in f:
            problems.append(f"R1.12 does not cite {path}:{lines}")
            continue
        a, _, b = lines.partition("-")
        if token not in "\n".join(lane(path).splitlines()[int(a) - 1:int(b or a)]):
            problems.append(f"{path}:{lines} does not hold `{token}` in the lane")
    if "rulings table, row V-15" not in f:
        problems.append("R1.12 does not cite V's ruling V-15 by row id")
    if re.search(r"V-DECISIONS-PACKET\.md:\d", f):
        problems.append("R1.12 cites the V packet by line number (its Pointer note: not stable)")
    rulings = read(VPACKET).split("## V's rulings", 1)[-1]
    row = next((l for l in rulings.splitlines() if l.startswith("| V-15 |")), "")
    if "Yes, seed all 17" not in row or "buildAlgorithmRegisterRows" not in row:
        problems.append("the V packet's rulings table has no V-15 ruling naming the 17-row seed")
    return problems


def check_supersession_and_identity(version):
    """Line 4 supersedes v4 on V-15 for R1.12; every other requirement and §1/§2/§4/§5/§6 are byte-identical to v4."""
    text = spec(version)
    lines = text.splitlines()
    problems = []
    head = lines[3] if len(lines) > 3 else ""
    for token in ("SUPERSEDES `SPEC-v4.md`", "pass 6", "on V's ruling V-15", "rulings table, row V-15", "**R1.12** only"):
        if token not in head:
            problems.append(f"line 4 does not say {token!r}")
    if lines[2] != "ui: no":
        problems.append("line 3 is not `ui: no`")
    base = spec("v4")
    reqs = lambda t: {m.group(1): m.group(0) for m in re.finditer(
        r"^\*\*(R\d+\.\d+[a-z]?)\b.*?(?=^\*\*R\d|^## )", t, re.S | re.M)}
    ra, rb = reqs(base), reqs(text)
    problems += [f"{k} differs from SPEC-v4" for k in rb if k != "R1.12" and ra.get(k) != rb[k]]
    problems += [f"{k} is missing" for k in ra if k not in rb]
    sec = lambda t: dict(re.findall(r"^(## [124569]\.[^\n]*)\n(.*?)(?=^## |\Z)", t, re.S | re.M))
    problems += [f"section {h[:12]} differs from SPEC-v4" for h, body in sec(text).items() if sec(base).get(h) != body]
    return problems


CHECKS = [("V-15 seed: the rows R1.12 describes = the manifest the database requires; role rows unchanged", check_seed_accepted),
          ("V-15 builder: signature quoted from the lane; input pinned = the one d4/d1 ran", check_builder_input),
          ("V-15 citations hold in the S01 lane; V cited by row id", check_citations),
          ("supersession line names V-15/R1.12; all else byte-identical to v4", check_supersession_and_identity)]


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "v5"
    failed = 0
    print(f"REQ-FIX-PES-p6 checks against S01 SPEC-{version}.md (manifest {len(manifest())} keys, builder {len(builder_keys())} keys)")
    for label, check in CHECKS:
        try:
            problems = check(version)
        except Exception as error:
            problems = [f"CHECK CRASHED: {type(error).__name__}: {error}"]
        print(f"  {'FAIL' if problems else 'pass'}  {label}")
        for p in problems:
            print(f"          - {p}")
        failed += bool(problems)
    print(f"{version}: {'FAIL' if failed else 'PASS'} ({failed} failing checks)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
