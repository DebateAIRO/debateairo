#!/usr/bin/env python3
"""REQ-FIX-PES-p5 checks for V-14 (S03 R3.4b). Each reads what the SPEC states and decides it
against the S03 lane at C2's head (read-only) — never against the SPEC's own say-so.

    python3 checks.py v2    # S03 SPEC-v2.md — MUST FAIL (V-14 is not in it)
    python3 checks.py v3    # S03 SPEC-v3.md — MUST PASS
Exit 0 = every check held.
"""
import re
import sys

REPO = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LANE = f"{REPO}/.worktrees/pes-s03/dialectical-engine"
S03 = f"{REPO}/docs/missions/provider-env-selection/slices/S03"
VPACKET = f"{REPO}/docs/missions/provider-env-selection/V-DECISIONS-PACKET.md"
CODE = "COST_ENVELOPES_NOT_SEALED"


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def spec(version):
    return read(f"{S03}/SPEC-{version}.md")


def block(text, req):
    m = re.search(rf"^\*\*{re.escape(req)}\*?\*?\b.*?(?=^\*\*R\d|^## )", text, re.S | re.M)
    return m.group(0) if m else ""


def lane_lines(path):
    return read(f"{LANE}/{path}").splitlines()


def span(path, cite):
    a, _, b = cite.partition("-")
    return "\n".join(lane_lines(path)[int(a) - 1:int(b or a)])


def readme_members():
    """Every README line naming the code, and the one inside R3.4's support-chat paragraph."""
    lines = lane_lines("deploy/vps/README.md")
    hits = [i + 1 for i, l in enumerate(lines) if CODE in l]
    text = "\n".join(lines)
    para = next(b for b in re.split(r"\n[ \t]*\n", text) if "SUPPORT_MODEL_COST_UNREPORTED" in b)
    start = text.index(para)
    first = text.count("\n", 0, start) + 1
    last = first + para.count("\n")
    owned = [h for h in hits if first <= h <= last]
    return hits, owned


def check_sweep(version):
    """Every README mention outside R3.4's paragraph is a member R3.4b names by line."""
    r = block(spec(version), "R3.4b")
    if not r:
        return ["no R3.4b: the other README mentions of the code are governed by nothing"]
    hits, owned = readme_members()
    problems = []
    cited = {int(x) for x in re.findall(r"`:(\d+)(?:-\d+)?`", r)} | \
            {n for a, b in re.findall(r"`:(\d+)-(\d+)`", r) for n in range(int(a), int(b) + 1)}
    for h in hits:
        if h in owned:
            if h not in cited:
                problems.append(f"README:{h} (R3.4's paragraph) is not named as R3.4's")
            continue
        if h not in cited:
            problems.append(f"README:{h} names {CODE} and R3.4b does not cover it")
    said = re.search(r"the file has (\w+) such lines", " ".join(r.split()))
    words = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}
    if not said or words.get(said.group(1)) != len(hits):
        problems.append(f"R3.4b's count of README lines is not the measured {len(hits)}")
    return problems


def check_end_state(version):
    """The stated post-edit grep count equals what the stated edits leave: R3.4's paragraph keeps
    the code, a KEPT table row keeps it, a re-worded bullet that 'names no other code' drops it."""
    r = " ".join(block(spec(version), "R3.4b").split())
    if not r:
        return ["no R3.4b end state"]
    keeps_row = "stays in the table" in r
    drops_bullet = "no longer says a hosted runner" in r and "names no other code" in r
    expected = 1 + (1 if keeps_row else 0) + (0 if drops_bullet else 1)
    said = re.search(r"prints exactly (\w+) lines", r)
    words = {"one": 1, "two": 2, "three": 3}
    problems = []
    if not said or words.get(said.group(1)) != expected:
        problems.append(f"the stated post-edit grep count is not the {expected} the stated edits leave")
    # R3.5's class keeps the row: dropping it would contradict R3.5
    if not keeps_row:
        problems.append("R3.4b drops the table row, but R3.5's class (every cost-envelope refusal code) requires it")
    if "cost-envelope" not in " ".join(block(spec(version), "R3.5").split()):
        problems.append("R3.5 no longer names the cost-envelope surface")
    return problems


CITES = {  # (path, lines) -> token the line must hold, in the S03 lane at C2's head
    ("deploy/vps/README.md", "737"): CODE,
    ("deploy/vps/README.md", "769"): f"| `{CODE}` |",
    ("deploy/vps/README.md", "776-777"): "COST_ENVELOPE_POLICY_UNRESOLVED",
    ("deploy/vps/README.md", "692-700"): "**The production maker path is now ruled",
    ("packages/register/src/runtime-environment.ts", "143-147"): f'"{CODE}"',
    ("packages/register/src/runtime-environment.ts", "112-115"): "unreachable",
    ("tests/architecture/vps-deployment-baseline.test.ts", "359"): CODE,
    ("tests/unit/v9-provider-credential-files.test.ts", "423"): "union.size).toBe(12)",
}


def check_citations(version):
    r = block(spec(version), "R3.4b")
    if not r:
        return ["no R3.4b to cite anything"]
    problems = []
    flat = " ".join(r.split())
    for (path, lines), token in CITES.items():
        short = path.split("/")[-1]
        if path == "deploy/vps/README.md":
            present = f"`:{lines}`" in flat
        else:
            present = f"{short}:{lines}`" in flat or (f"`:{lines}`" in flat and short in flat)
        if not present:
            problems.append(f"R3.4b does not cite {path}:{lines}")
            continue
        if token not in span(path, lines):
            problems.append(f"{path}:{lines} does not hold `{token}` in the lane")
    # the known-stale list holds no envelope bullet
    if re.search(r"envelope", span("deploy/vps/README.md", "14-27"), re.I):
        problems.append("the known-stale list at README:14-27 mentions the envelopes")
    # the pin's anchors really do not read the NOT_SEALED class
    pin = read(f"{LANE}/tests/unit/v9-provider-credential-files.test.ts")
    anchors = pin[pin.index("const anchors"):pin.index("const union")]
    if "CostEnvelopesNotSealed" in anchors and "not among them" in flat:
        problems.append("R3.4b says the pin does not count the code, but an anchor reads its class")
    # the V packet row it cites is where it says
    vp = read(VPACKET).splitlines()
    m = re.search(r"row V-14 — `:(\d+)` at this pass", flat)
    if not m or not vp[int(m.group(1)) - 1].startswith('| V-14 | "Yes, reword all three'):
        problems.append("R3.4b's pointer to V's V-14 ruling does not land on that ruling")
    return problems


def check_identity(version):
    """Every requirement but R3.4b is byte-identical to SPEC-v2."""
    if version == "v2":
        return []  # identity is a property of the new version only
    a, b = spec("v2"), spec(version)
    reqs = lambda t: {m.group(1): m.group(0) for m in re.finditer(
        r"^\*\*(R\d+\.\d+[a-z]?)\*?\*?.*?(?=^\*\*R\d|^## )", t, re.S | re.M)}
    ra, rb = reqs(a), reqs(b)
    problems = [f"{k} differs from SPEC-v2" for k in rb if k != "R3.4b" and ra.get(k) != rb[k]]
    problems += [f"{k} is missing from {version}" for k in ra if k not in rb]
    sec = lambda t: {h: body for h, body in re.findall(r"^(## [1245]\.[^\n]*)\n(.*?)(?=^## |\Z)", t, re.S | re.M)}
    problems += [f"section {h[:14]} differs from SPEC-v2" for h, body in sec(b).items() if sec(a).get(h) != body]
    return problems


CHECKS = [("V-14 sweep: every README mention is R3.4's or R3.4b's, counted", check_sweep),
          ("V-14 end state: stated grep count = what the stated edits leave; row kept per R3.5", check_end_state),
          ("V-14 citations hold in the S03 lane at C2's head", check_citations),
          ("identity: every other requirement and §1/§2/§4/§5 byte-identical to v2", check_identity)]


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "v3"
    failed = 0
    print(f"REQ-FIX-PES-p5 checks against S03 SPEC-{version}.md")
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
