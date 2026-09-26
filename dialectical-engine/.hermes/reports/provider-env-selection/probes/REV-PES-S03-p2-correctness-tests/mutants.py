#!/usr/bin/env python3
"""REV-PES-S03-p2-correctness-tests — temporary mutants against the S03 slice.

Written against head 60993d2db. Root: $WORKTREE or argv[1]; logs beside this script.
Each mutant edits README / the v9 test / packages/providers/src/index.ts from the bytes
CAPTURED at start (never a literal), runs the v9 file, then restores from those captured
bytes and proves the restore path by path: cmp-equal AND `git status --porcelain -- <path>`
identical to the line captured before the first mutant.
Usage: mutants.py <root> [name ...]   (no names = all)
"""
from __future__ import annotations
import os, re, subprocess, sys
from pathlib import Path

WT = Path(os.environ.get("WORKTREE") or sys.argv[1])
OUT = Path(__file__).resolve().parent
PATHS = {
    "readme": "deploy/vps/README.md",
    "test": "tests/unit/v9-provider-credential-files.test.ts",
    "providers": "packages/providers/src/index.ts",
}
ENV = dict(os.environ, PATH="/opt/homebrew/bin:" + os.environ.get("PATH", ""))
orig = {k: (WT / p).read_bytes() for k, p in PATHS.items()}
def porcelain(p): return subprocess.run(["git", "status", "--porcelain", "--", p], cwd=WT, capture_output=True, text=True, env=ENV).stdout
pre = {k: porcelain(p) for k, p in PATHS.items()}

def drop_line(text, prefix):
    lines = text.split("\n"); kept = [l for l in lines if not l.startswith(prefix)]
    assert len(kept) == len(lines) - 1, f"prefix hits {len(lines)-len(kept)}: {prefix}"
    return "\n".join(kept)
def replace_once(text, old, new):
    assert text.count(old) == 1, f"count {text.count(old)}: {old[:60]}"
    return text.replace(old, new, 1)

SUPPORT_ROW_PREFIX = "| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` |"
DAILY_ROW = "| `DAILY_COST_ENVELOPE_REACHED` | a run's daily cost envelope is spent. |"
GUARD = "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed"

def after_support_row(text, insert):
    lines = text.split("\n"); i = [n for n, l in enumerate(lines) if l.startswith(SUPPORT_ROW_PREFIX)]
    assert len(i) == 1; lines.insert(i[0] + 1, insert); return "\n".join(lines)
def before_guard(text, block):
    lines = text.split("\n"); i = [n for n, l in enumerate(lines) if l.startswith(GUARD)]
    assert len(i) == 1; lines[i[0]:i[0]] = block.split("\n"); return "\n".join(lines)

RETYPE = '''    const union = new Set<string>([
      "COST_ENVELOPE_POLICY_INVALID", "COST_ENVELOPE_POLICY_UNRESOLVED", "CUSTODY_GROUP_UNRESOLVED",
      "PROVIDER_CREDENTIAL_FILE_ABSENT", "PROVIDER_CREDENTIAL_FILE_INVALID",
      "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "PROVIDER_TARGET_PRICE_REQUIRED", "PROVIDER_TARGET_PRICE_ZERO",
      "SECRET_CUSTODY_INVALID", "SUPPORT_ADMISSION_SCOPES_NOT_SEALED", "SUPPORT_MODEL_CREDENTIAL_ABSENT",
      "SUPPORT_MODEL_PATH_NOT_RATIFIED"
    ]);
'''
def retype(src):
    s = src.find("    const providers = await read("); e = src.find("    expect(union.size).toBe(12);")
    assert s > 0 and e > s; return src[:s] + RETYPE + src[e:]
def src_rename(p):
    return replace_once(p, "throw new TypeError(`PROVIDER_TARGET_PRICE_ZERO:${target.providerRef}`);",
                        "throw new TypeError(`PROVIDER_TARGET_PRICE_NONPOSITIVE:${target.providerRef}`);")
def src_add(p):
    return replace_once(p, '  if (mode !== "hosted") return;\n  for (const target of targets) {\n    const price = providerTargetPrice(target);',
        '  if (mode !== "hosted") return;\n  if (targets.length === 0) throw new TypeError(`PROVIDER_TARGETS_EMPTY:hosted`);\n  for (const target of targets) {\n    const price = providerTargetPrice(target);')

R = lambda f: ("readme", f)
MUTANTS = {
    # pass-1 correctness lens (mutants.sh + mutants-sweep.sh), re-implemented with this seat's paths
    "p1ct-row-unique": [R(lambda t: drop_line(t, SUPPORT_ROW_PREFIX))],
    "p1ct-row-price-zero-779-781": [R(lambda t: drop_line(t, "| `PROVIDER_TARGET_PRICE_ZERO:`"))],
    "p1ct-row-price-required-780": [R(lambda t: drop_line(t, "| `PROVIDER_TARGET_PRICE_REQUIRED:`"))],
    "p1ct-row-discovery-price-invalid-779": [R(lambda t: drop_line(t, "| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` |"))],
    "p1ct-price-one-env": [R(lambda t: replace_once(t, '"input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/api/providers/acme.header"', '"authorization_file":"/etc/debateai/api/providers/acme.header"'))],
    "p1ct-daily-cap": [R(lambda t: replace_once(t, "deployment still needs sealed cost envelopes (V-28).", "the daily call cap is the only ceiling until the cost envelope is published. deployment still needs sealed cost envelopes (V-28)."))],
    "p1ct-cost-number": [R(lambda t: replace_once(t, "The development seed publishes `600000`.", "The development seed publishes a value."))],
    "p1ct-stale-bullet": [R(lambda t: replace_once(t, "a first provision, so read this list before following the section:\n\n", "a first provision, so read this list before following the section:\n\n- **§11's hosted provider target example** does not carry\n  `input_price_micros_per_million`.\n"))],
    "p1ct-r34-sentence": [R(lambda t: replace_once(t, "when that version sealed none", "when that version sealed nothing"))],
    "p1ct-row-wording": [R(lambda t: replace_once(t, "With the shipped source it is unreachable at runtime.", "With the shipped source it is unreachable in production."))],
    "p1ct-section10-old-code": [R(lambda t: replace_once(t, "or `COST_ENVELOPE_POLICY_INVALID`.", "or `COST_ENVELOPE_POLICY_INVALID`, or `COST_ENVELOPES_NOT_SEALED`."))],
    "p1ct-policy-unresolved-row": [R(lambda t: drop_line(t, "| `COST_ENVELOPE_POLICY_UNRESOLVED` |"))],
    "p1ct-policy-invalid-row": [R(lambda t: drop_line(t, "| `COST_ENVELOPE_POLICY_INVALID` |"))],
    "p1ct-retype": [("test", retype)],
    # pass-1 security lens: A = drop PRICE_REQUIRED row (same bytes as p1ct-row-price-required), B = drop SUPPORT row
    # (same as p1ct-row-unique), and the V-8 insert beside :784
    "p1sd-insert-daily-row": [R(lambda t: after_support_row(t, DAILY_ROW))],
    # this seat — neighbours of F1's class (a V-8 code inside the refusal span's tables, rows standing in for rows)
    "p2-insert-each-v8-row-RUN": [R(lambda t: after_support_row(t, "| `RUN_COST_ENVELOPE_MONEY_REACHED` | x. |"))],
    "p2-second-table-daily": [R(lambda t: before_guard(t, "| Code | Meaning |\n|---|---|\n" + DAILY_ROW + "\n"))],
    "p2-second-table-daily-other-header": [R(lambda t: before_guard(t, "| Run-time code | Meaning |\n|---|---|\n" + DAILY_ROW + "\n"))],
    "p2-daily-in-meaning-cell": [R(lambda t: replace_once(t, "no `costEnvelopePolicy` row exists at the resolved `REGISTER_VERSION`. |", "no `costEnvelopePolicy` row exists at the resolved `REGISTER_VERSION`; not `DAILY_COST_ENVELOPE_REACHED`. |"))],
    "p2-price-rows-swapped-codes": [R(lambda t: replace_once(replace_once(t, "| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, and a declared input", "| `@@Z@@` and the provider ref | hosted mode, and a declared input"), "| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, and a debate target declares no price pair.", "| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, and a debate target declares no price pair.").replace("`@@Z@@`", "`PROVIDER_TARGET_PRICE_REQUIRED:`"))],
    "p2-price-zero-row-emptied-meaning": [R(lambda t: replace_once(t, "| hosted mode, and a declared input or output price is below 1 micro-unit per million tokens. |", "| |"))],
    "p2-price-zero-moved-to-meaning": [R(lambda t: replace_once(drop_line(t, "| `PROVIDER_TARGET_PRICE_ZERO:`"), "a debate target declares no price pair. |", "a debate target declares no price pair; a zero price is `PROVIDER_TARGET_PRICE_ZERO`. |"))],
    # retype residual ruling: source drift is what the source-read defends
    "p2-src-rename-zero": [("providers", src_rename)],
    "p2-src-add-code": [("providers", src_add)],
    "p2-retype+src-rename-zero": [("test", retype), ("providers", src_rename)],
    "p2-retype+src-add-code": [("test", retype), ("providers", src_add)],
}

def restore():
    bad = []
    for k, p in PATHS.items():
        (WT / p).write_bytes(orig[k])
        if (WT / p).read_bytes() != orig[k] or porcelain(p) != pre[k]: bad.append(p)
    return bad

names = sys.argv[2:] or list(MUTANTS)
summary = []
try:
    for name in names:
        for key, fn in MUTANTS[name]:
            path = WT / PATHS[key]
            path.write_text(fn(path.read_text()))
        log = OUT / f"mutant-{name}.log"
        proc = subprocess.run(["pnpm", "exec", "vitest", "run", PATHS["test"]], cwd=WT, env=ENV, capture_output=True, text=True)
        log.write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr)
        tests = [l.strip() for l in proc.stdout.splitlines() if l.strip().startswith("Tests ")]
        fails = sorted(set(re.findall(r"(?:FAIL|×)\s+tests/unit/v9-provider-credential-files\.test\.ts > (.+?)(?:\s\d+ms)?$", proc.stdout, re.M)))
        bad = restore()
        line = f"{name}: rc={proc.returncode} {tests[-1] if tests else 'NO TESTS LINE'} | failed: {fails or '-'} | restore {'OK cmp=0 porcelain-identical' if not bad else 'BAD ' + str(bad)}"
        print(line, flush=True); summary.append(line)
        if bad: raise SystemExit("RESTORE FAILED")
finally:
    bad = restore()
    print("final restore", "OK" if not bad else f"BAD {bad}")
