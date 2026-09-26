from pathlib import Path
import json, os, re, subprocess, sys
ROOT = Path(__file__).resolve().parent
LANE = Path.cwd()
assert LANE == Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine")
README = LANE / "deploy/vps/README.md"
TEST = LANE / "tests/unit/v9-provider-credential-files.test.ts"
RUNNER = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh"
phase, count, group = sys.argv[1:]
count = int(count)
base = README.read_text()
heading = "### What the hosted mode refuses, in code"
end_heading = "### The credential-file contract"
span = base.split(heading, 1)[1].split(end_heading, 1)[0]
rows = [line for line in span.splitlines() if line.startswith("| `")]
row_codes = [re.search(r"^\| `([A-Z_]+):?`", line)[1] for line in rows]
forbidden = ["RUN_COST_ENVELOPE_MONEY_REACHED", "PROVIDER_USAGE_UNREPORTED", "COST_ENVELOPE_CHARGE_UNREPRESENTABLE", "DAILY_COST_ENVELOPE_REACHED"]
if group == "review":
    cases = [("drop-"+code, "drop", code, True) for code in ["PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "PROVIDER_TARGET_PRICE_REQUIRED", "PROVIDER_TARGET_PRICE_ZERO"]]
    cases += [("insert-DAILY_COST_ENVELOPE_REACHED", "insert", "DAILY_COST_ENVELOPE_REACHED", True), ("control-support", "drop", "SUPPORT_ADMISSION_SCOPES_NOT_SEALED", True)]
elif group == "class":
    cases = [("drop-"+code, "drop", code, True) for code in row_codes]
    cases += [("insert-"+code, "insert", code, True) for code in forbidden]
    cases += [("duplicate-row", "duplicate", "PROVIDER_TARGET_PRICE_REQUIRED", True), ("move-to-meaning", "meaning", "PROVIDER_TARGET_PRICE_REQUIRED", True), ("move-to-prose", "prose", "PROVIDER_TARGET_PRICE_REQUIRED", True), ("second-code-in-cell", "second", "DAILY_COST_ENVELOPE_REACHED", True), ("nested-credential-outside-table", "nested", "SECRET_CUSTODY_INVALID", True), ("all-credentials-outside-table", "credentials", "", True)]
elif group == "regression":
    names = ["row-unique", "row-price-zero", "price-one-env", "daily-cap", "cost-number", "stale-bullet", "r34-sentence", "row-wording", "section10-old-code", "retype"]
    cases = [(name, "reviewer", name, name != "retype") for name in names]
elif group == "neighbour":
    cases = [("wrapped-prose-and-row-order", "neighbour", "", False)]
else:
    raise SystemExit("unknown group")
print("SWEEP",group,"row codes",len(row_codes),"cases",len(cases),flush=True)
results = []
for label, operation, value, should_fail in cases:
    log = ROOT / f"{phase}-{label}-attempt-1.log"
    assert not log.exists(), log
    originals = {p: p.read_bytes() for p in [README, TEST]}
    before = {p: subprocess.check_output(["git", "status", "--porcelain", "--", str(p)], text=True) for p in originals}
    snapshots = {}
    for p, data in originals.items():
        snapshot = ROOT / f"{phase}-{label}-{p.name}.saved"
        snapshot.write_bytes(data)
        snapshots[p] = snapshot
    try:
        text = originals[README].decode()
        if operation == "reviewer":
            subprocess.run(["python3", str(ROOT / "reviewer-ct-mutate.py"), value, str(README), str(TEST)], check=True)
        else:
            if operation in ["drop", "duplicate", "meaning", "prose"]:
                row = rows[row_codes.index(value)]
                assert text.count(row+"\n") == 1
                if operation == "duplicate": text = text.replace(row+"\n", row+"\n"+row+"\n", 1)
                else:
                    text = text.replace(row+"\n", "", 1)
                    if operation == "meaning": text = text.replace("one price member is declared", "`"+value+"` — one price member is declared", 1)
                    if operation == "prose": text = text.replace(end_heading, "A prose example follows.\n\n```text\n"+row+"\n```\n\n"+end_heading, 1)
            elif operation == "insert": text = text.replace("| Code | Meaning |", "| Code | Meaning |", 1).replace("\n\n`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised", "\n| `"+value+"` | mutant runtime spend stop |\n\n`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised", 1)
            elif operation == "second": text = text.replace("| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref |", "| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref, or `"+value+"` |", 1)
            elif operation in ["nested", "credentials"]:
                codes = [value] if operation == "nested" else ["SECRET_CUSTODY_INVALID", "CUSTODY_GROUP_UNRESOLVED", "PROVIDER_CREDENTIAL_FILE_INVALID", "PROVIDER_CREDENTIAL_FILE_ABSENT"]
                a=text.index(heading); b=text.index(end_heading)
                table=text[a:b]
                for code in codes: table=table.replace(code, "MUTANT_REASON")
                text=text[:a]+table+"\n"+", ".join("`"+code+"`" for code in codes)+"\n\n"+text[b:]
            elif operation == "neighbour":
                a=rows[row_codes.index("PROVIDER_TARGET_PRICE_REQUIRED")]; b=rows[row_codes.index("PROVIDER_TARGET_PRICE_ZERO")]
                text=text.replace(a+"\n"+b,b+"\n"+a,1)
                text=text.replace("are parsed, before", "are parsed,\n before",1)
                text=text.replace(end_heading, "Runtime discussion outside the table: `DAILY_COST_ENVELOPE_REACHED`.\n\n"+end_heading,1)
            else: raise AssertionError(operation)
            assert text != originals[README].decode(), label
            README.write_text(text)
        env=os.environ.copy(); env["LOG"]=str(log)
        run=subprocess.run(["zsh", RUNNER, f"tests/unit/v9-provider-credential-files.test.ts:{count}:0", "tests/architecture/vps-deployment-baseline.test.ts:31:0"],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        print(label+"\n"+run.stdout,flush=True)
        content=log.read_text()
        pair=re.search(r"tests/unit/v9-provider-credential-files.test.ts rc=(\d+) passed=(\d+) failed=(\d+)",content)
        assert pair and int(pair[2])+int(pair[3])==count, "broken suite or pair drift"
        killed = int(pair[3]) > 0
        assert "BROKEN" not in run.stdout
        ok = killed == should_fail
        results.append({"label":label,"passed":int(pair[2]),"failed":int(pair[3]),"expected_killed":should_fail,"matched":ok,"log":str(log)})
        print("DETECTOR", "GREEN" if ok else "RED", label, flush=True)
    finally:
        for p, data in originals.items():
            if p.read_bytes()!=data: p.write_bytes(data)
            subprocess.run(["cmp", "-s", str(snapshots[p]), str(p)], check=True)
            after=subprocess.check_output(["git", "status", "--porcelain", "--", str(p)],text=True)
            assert after==before[p], (p,before[p],after)
            print("RESTORE",str(p.relative_to(LANE)),"cmp=0", "before="+repr(before[p]),"after="+repr(after),flush=True)
result_path=ROOT/f"{phase}-results.json"
assert not result_path.exists()
result_path.write_text(json.dumps(results,indent=2)+"\n")
print("F1_DETECTOR_"+("GREEN" if all(r["matched"] for r in results) else "RED"),flush=True)
sys.exit(0 if all(r["matched"] for r in results) else 1)
