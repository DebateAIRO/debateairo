#!/usr/bin/env python3
"""REV-PES-S03-p3-correctness-tests — temporary mutants against the REBASED S03 slice.

Written against head 9f29022f3 (slice/provider-env-selection-s03 on a6d6382ba). Root: $WORKTREE or argv[1].
Logs land beside this script (mutant-<name>.log) and a summary in mutants.out (tee'd by the caller).
Families:
  p1ct-* / p1sd-* / p2-*  the pass-1 and pass-2 correctness mutants (REV-PES-S03-p{1,2}-correctness-tests),
                          re-anchored to the rebased README's text (dev's rows, dev's JSON member order);
  fix-*                   the rebase seat's changed-pin mutants and its FIX-p1 class members (FIX-PES-S03-p2);
  p3-*                    this seat's: dev's SECOND refusal table, dev's KEPT rows, R3.1/R3.2/R3.6 values.
Each mutant edits the bytes CAPTURED at start (never a literal), runs the v9 file, then restores FROM those
captured bytes and proves the restore path by path: bytes equal AND `git status --porcelain -- <path>`
identical to the line captured before the first mutant. Source mutants write packages/providers/src/index.ts
in THIS worktree only, and are restored the same way.
Usage: mutants.py <root> [name ...]   (no names = all). `expect` is the reviewer's prediction, not an oracle.
"""
from __future__ import annotations
import os, re, subprocess, sys
from pathlib import Path

WT = Path(os.environ.get("WORKTREE") or sys.argv[1])
OUT = Path(__file__).resolve().parent
PATHS = {"readme": "deploy/vps/README.md", "test": "tests/unit/v9-provider-credential-files.test.ts",
         "providers": "packages/providers/src/index.ts"}
ENV = dict(os.environ, PATH="/opt/homebrew/bin:" + os.environ.get("PATH", ""))
orig = {k: (WT / p).read_bytes() for k, p in PATHS.items()}
def porcelain(p): return subprocess.run(["git", "status", "--porcelain", "--", p], cwd=WT, capture_output=True, text=True, env=ENV).stdout
pre = {k: porcelain(p) for k, p in PATHS.items()}

PRIMARY = ("### What the hosted mode refuses, in code", "### The credential-file contract")
def span(t, a=PRIMARY[0], b=PRIMARY[1]):
    i = t.index(a); j = t.index(b, i); return i, j
def in_primary(t, fn):
    i, j = span(t); return t[:i] + fn(t[i:j]) + t[j:]
def drop_line(block, prefix):
    lines = block.split("\n"); kept = [l for l in lines if not l.startswith(prefix)]
    assert len(kept) == len(lines) - 1, f"prefix hits {len(lines)-len(kept)}: {prefix}"
    return "\n".join(kept)
def drop_primary(prefix): return lambda t: in_primary(t, lambda b: drop_line(b, prefix))
def once(old, new):
    def f(t):
        assert t.count(old) == 1, f"count {t.count(old)}: {old[:70]}"
        return t.replace(old, new, 1)
    return f
def row(t, prefix):
    hits = [l for l in t[span(t)[0]:span(t)[1]].split("\n") if l.startswith(prefix)]; assert len(hits) == 1, prefix; return hits[0]
def after_row(prefix, insert):
    def f(t):
        return in_primary(t, lambda b: b.replace(row(t, prefix) + "\n", row(t, prefix) + "\n" + insert + "\n", 1))
    return f
def chain(*fs):
    def f(t):
        for g in fs: t = g(t)
        return t
    return f

SUPPORT = "| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` |"
NOT_SEALED = "| `COST_ENVELOPES_NOT_SEALED` |"
GUARD = "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed never reaches the other two."
DAILY_ROW = "| `DAILY_COST_ENVELOPE_REACHED` | a run's daily cost envelope is spent. |"
API_PRICES = '"authorization_file":"/etc/debateai/api/providers/acme.header","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000'
RUN_PRICES = '"authorization_file":"/etc/debateai/runner/providers/acme.header","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000'
PRICE_INVALID_MEANING = "| a price that is not a whole, non-negative number, or only one of the two price members. |"
UNRESOLVED_TAIL = "published before the envelopes existed. Both services refuse. |"
MEMBER_IN = "| an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million input tokens. Declaring either price member without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |"
MEMBER_OUT = "| an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million output tokens. Declaring either price member without the other refuses with `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. |"
SUPPORT_CEILING = "so for the support chat its own daily call cap and per-visitor share are still the only ceilings"
PUBLISHER_LAST = "| `FX-REG-SEALED_VERSION_MISMATCH` |"

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
    assert 0 < s < e; return src[:s] + RETYPE + src[e:]
src_rename = once("throw new TypeError(`PROVIDER_TARGET_PRICE_ZERO:${target.providerRef}`);",
                  "throw new TypeError(`PROVIDER_TARGET_PRICE_NONPOSITIVE:${target.providerRef}`);")
src_add = once('  if (mode !== "hosted") return;\n  for (const target of targets) {\n    const price = providerTargetPrice(target);',
               '  if (mode !== "hosted") return;\n  if (targets.length === 0) throw new TypeError(`PROVIDER_TARGETS_EMPTY:hosted`);\n  for (const target of targets) {\n    const price = providerTargetPrice(target);')

ROWS17 = ["DEPLOYMENT_MODE_UNRESOLVED", "DEPLOYMENT_MODE_INVALID", "PROVIDER_BASE_URL_TLS_REQUIRED:", "PROVIDER_TARGET_LOOPBACK_REFUSED:",
          "PROVIDER_INLINE_CREDENTIAL_REFUSED:", "PROVIDER_AUTHORIZATION_FILE_ABSENT:", "PROVIDER_AUTHORIZATION_FILE_UNUSABLE:",
          "COST_ENVELOPE_POLICY_UNRESOLVED", "COST_ENVELOPE_POLICY_INVALID", "COST_ENVELOPES_NOT_SEALED", "SUPPORT_ADMISSION_SCOPES_NOT_SEALED",
          "PROVIDER_TARGET_PRICE_REQUIRED:", "PROVIDER_TARGET_PRICE_ZERO:", "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "RUNNER_PRIMARY_PROVIDER_REF_DRIFT",
          "SUPPORT_MODEL_CREDENTIAL_ABSENT", "SUPPORT_MODEL_PATH_NOT_RATIFIED"]

R = lambda f: ("readme", f)
M: dict[str, tuple[str, list]] = {
    "control-unmutated": ("GREEN", []),
    # ---- pass-1 / pass-2 correctness mutants, re-anchored to the rebased README
    "p1ct-row-unique": ("RED", [R(drop_primary(SUPPORT))]),
    "p1ct-row-price-zero": ("RED", [R(drop_primary("| `PROVIDER_TARGET_PRICE_ZERO:`"))]),
    "p1ct-row-price-required": ("RED", [R(drop_primary("| `PROVIDER_TARGET_PRICE_REQUIRED:`"))]),
    "p1ct-row-discovery-price-invalid": ("RED", [R(drop_primary("| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` |"))]),
    "p1ct-price-one-env": ("RED", [R(once(API_PRICES, '"authorization_file":"/etc/debateai/api/providers/acme.header"'))]),
    "p1ct-daily-cap": ("RED", [R(once("deployment still needs sealed cost envelopes (V-28).", "the daily call cap is the only ceiling until the cost envelope is published. deployment still needs sealed cost envelopes (V-28)."))]),
    "p1ct-cost-number": ("RED", [R(once("The development seed publishes `600000`.", "The development seed publishes a value."))]),
    "p1ct-stale-bullet": ("RED", [R(once("Refreshed by Task 14 (2026-09-25)", "- **§11's hosted provider target example** does not carry\n  `input_price_micros_per_million`.\n\nRefreshed by Task 14 (2026-09-25)"))]),
    "p1ct-r34-sentence": ("RED", [R(once("when that version sealed none", "when that version sealed nothing"))]),
    "p1ct-row-wording": ("RED", [R(once("With the shipped source it is unreachable at runtime.", "With the shipped source it is unreachable in production."))]),
    "p1ct-section10-old-code": ("RED", [R(once("or `COST_ENVELOPE_POLICY_INVALID`.\n", "or `COST_ENVELOPE_POLICY_INVALID`, or `COST_ENVELOPES_NOT_SEALED`.\n"))]),
    "p1ct-policy-unresolved-row": ("RED", [R(drop_primary("| `COST_ENVELOPE_POLICY_UNRESOLVED` |"))]),
    "p1ct-policy-invalid-row": ("RED", [R(drop_primary("| `COST_ENVELOPE_POLICY_INVALID` |"))]),
    "p1ct-retype": ("GREEN", [("test", retype)]),
    "p1sd-insert-daily-row": ("RED", [R(after_row(SUPPORT, DAILY_ROW))]),
    "p2-insert-each-v8-row-RUN": ("RED", [R(after_row(SUPPORT, "| `RUN_COST_ENVELOPE_MONEY_REACHED` | x. |"))]),
    "p2-second-table-daily": ("GREEN(R1)", [R(once(GUARD, "| Code | Meaning |\n|---|---|\n" + DAILY_ROW + "\n\n" + GUARD))]),
    "p2-second-table-daily-other-header": ("GREEN(R1)", [R(once(GUARD, "| Run-time code | Meaning |\n|---|---|\n" + DAILY_ROW + "\n\n" + GUARD))]),
    "p2-daily-in-meaning-cell": ("GREEN(R1)", [R(once(UNRESOLVED_TAIL, "published before the envelopes existed. Both services refuse; not `DAILY_COST_ENVELOPE_REACHED`. |"))]),
    "p2-price-rows-swapped-codes": ("GREEN(R2)", [R(lambda t: t.replace("| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | a debate target", "| `@@R@@` and the provider ref | a debate target", 1)
                                                   .replace("| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | a declared price", "| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | a declared price", 1)
                                                   .replace("`@@R@@`", "`PROVIDER_TARGET_PRICE_ZERO:`", 1))]),
    "p2-price-zero-row-emptied-meaning": ("GREEN(R2)", [R(once("| a declared price of zero, which would bound nothing. The floor is 1. |", "| |"))]),
    "p2-price-zero-moved-to-meaning": ("RED", [R(chain(drop_primary("| `PROVIDER_TARGET_PRICE_ZERO:`"), once("are required in hosted mode. |", "are required in hosted mode; a zero price is `PROVIDER_TARGET_PRICE_ZERO`. |")))]),
    "p2-src-rename-zero": ("RED", [("providers", src_rename)]),
    "p2-src-add-code": ("RED", [("providers", src_add)]),
    "p2-retype+src-rename-zero": ("GREEN(retype blind)", [("test", retype), ("providers", src_rename)]),
    "p2-retype+src-add-code": ("GREEN(retype blind)", [("test", retype), ("providers", src_add)]),
    # ---- rebase seat's changed-pin mutants (FIX-PES-S03-p2/changed-pin-mutants.py), same bytes
    "fix-below-UNRESOLVED": ("RED", [R(lambda t: in_primary(t, lambda b: b.replace(row(t, "| `COST_ENVELOPE_POLICY_UNRESOLVED` |") + "\n", "", 1).replace(row(t, NOT_SEALED), row(t, NOT_SEALED) + "\n" + row(t, "| `COST_ENVELOPE_POLICY_UNRESOLVED` |"), 1)))]),
    "fix-below-INVALID": ("RED", [R(lambda t: in_primary(t, lambda b: b.replace(row(t, "| `COST_ENVELOPE_POLICY_INVALID` |") + "\n", "", 1).replace(row(t, NOT_SEALED), row(t, NOT_SEALED) + "\n" + row(t, "| `COST_ENVELOPE_POLICY_INVALID` |"), 1)))]),
    "fix-stale-banner": ("RED", [R(once("Refreshed by Task 14", "## Known-stale sections\n\nRefreshed by Task 14"))]),
    "fix-stale-0": ("RED", [R(once("Refreshed by Task 14", "§11's hosted provider target example\n\nRefreshed by Task 14"))]),
    "fix-stale-1": ("RED", [R(once("Refreshed by Task 14", "§11's refusal-code table is incomplete\n\nRefreshed by Task 14"))]),
    "fix-stale-2": ("RED", [R(once("Refreshed by Task 14", "the daily call cap is the only ceiling\n\nRefreshed by Task 14"))]),
    "fix-neighbor-benign": ("GREEN", [R(lambda t: in_primary(t, lambda b: b.replace(row(t, "| `PROVIDER_TARGET_PRICE_REQUIRED:`") + "\n" + row(t, "| `PROVIDER_TARGET_PRICE_ZERO:`"), row(t, "| `PROVIDER_TARGET_PRICE_ZERO:`") + "\n" + row(t, "| `PROVIDER_TARGET_PRICE_REQUIRED:`"), 1).replace("are parsed, before", "are parsed,\n before", 1)))]),
    "fix-second-code-in-cell": ("RED", [R(once("| `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` |", "| `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` `DEPLOYMENT_MODE_INVALID` |"))]),
    "fix-nested-credential-outside-table": ("RED", [R(chain(once("it failed custody (`SECRET_CUSTODY_INVALID`), ", "it failed custody, "), once(GUARD, GUARD + " A custody failure reads `SECRET_CUSTODY_INVALID`.")))]),
    "fix-move-to-prose": ("RED", [R(chain(drop_primary("| `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` |"), once(GUARD, GUARD + " `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` is raised when `PROVIDER_REF` drifts.")))]),
    # ---- this seat: pass-3 scope (dev's structure) and the values R3.1 / R3.2 / R3.4 / R3.6 name
    "p3-publisher-table-v8-row": ("?", [R(once(PUBLISHER_LAST, DAILY_ROW + "\n" + PUBLISHER_LAST))]),
    "p3-publisher-table-drop-price-row": ("?", [R(lambda t: t.replace("\n| `PROVIDER_TARGET_PRICE_REQUIRED:` / `PROVIDER_TARGET_PRICE_ZERO:` + ref | the same refusals the units raise at start-up |", "", 1) if t.count("| `PROVIDER_TARGET_PRICE_REQUIRED:` / `PROVIDER_TARGET_PRICE_ZERO:` + ref | the same refusals the units raise at start-up |") == 1 else (_ for _ in ()).throw(AssertionError("publisher price row")))]),
    "p3-support-ceiling-paraphrase": ("?", [R(once(SUPPORT_CEILING, "so the only ceiling is the daily call cap"))]),
    "p3-support-ceiling-exact-base": ("RED", [R(once(SUPPORT_CEILING, "so the daily call cap is the only ceiling"))]),
    "p3-price-invalid-meaning-false": ("?", [R(once(PRICE_INVALID_MEANING, "| a price above 100 USD per million tokens. |"))]),
    "p3-member-values-wrong": ("?", [R(chain(once(MEMBER_IN, "| any number, in USD per input token. Optional. |"), once(MEMBER_OUT, "| any number, in USD per output token. Optional. |")))]),
    "p3-member-pair-rule-dropped": ("?", [R(chain(once(MEMBER_IN, "| an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million input tokens. |"), once(MEMBER_OUT, "| an integer from 1 through `Number.MAX_SAFE_INTEGER`, in micro-USD per million output tokens. |")))]),
    "p3-example-prices-zero": ("?", [R(chain(once(API_PRICES, API_PRICES.replace("3000000", "0").replace("15000000", "0")), once(RUN_PRICES, RUN_PRICES.replace("3000000", "0").replace("15000000", "0"))))]),
    "p3-example-price-string": ("?", [R(chain(once(API_PRICES, API_PRICES.replace(":3000000", ':"3000000"')), once(RUN_PRICES, RUN_PRICES.replace(":3000000", ':"3000000"'))))]),
    "p3-max-tokens-16": ("?", [R(once("spends `max_tokens: 8` per target", "spends `max_tokens: 16` per target"))]),
    "p3-no-minimum-dropped": ("?", [R(once(" Hosted mode enforces no minimum, so the number an operator publishes is the whole control.", ""))]),
    "p3-positive-integer-dropped": ("?", [R(once(", validated only as a positive integer.", "."))]),
    "p3-guard-sentence-above-table": ("RED", [R(chain(once("\n" + GUARD + "\n", "\n"), once("### What the hosted mode refuses, in code\n", "### What the hosted mode refuses, in code\n\n" + GUARD + "\n")))]),
    "p3-api-form-runner-path": ("RED", [R(once(API_PRICES, API_PRICES.replace("/api/", "/runner/")))]),
    "p3-r34-own-paragraph": ("RED", [R(once("when the row it sealed is malformed.\n", "when the row it sealed is malformed.\n\n"))]),
}
for code in ROWS17:
    M[f"fix-drop-{code.rstrip(':')}"] = ("RED", [R(drop_primary("| `" + code + "`"))])
for code in ["RUN_COST_ENVELOPE_MONEY_REACHED", "PROVIDER_USAGE_UNREPORTED", "COST_ENVELOPE_CHARGE_UNREPRESENTABLE", "DAILY_COST_ENVELOPE_REACHED"]:
    M[f"fix-insert-{code}"] = ("RED", [R(after_row(SUPPORT, f"| `{code}` | a run-time spend stop. |"))])
# duplicate: the support row twice
M["fix-duplicate-row"] = ("RED", [R(lambda t: after_row(SUPPORT, row(t, SUPPORT))(t))])

def restore():
    bad = []
    for k, p in PATHS.items():
        (WT / p).write_bytes(orig[k])
        if (WT / p).read_bytes() != orig[k] or porcelain(p) != pre[k]: bad.append(p)
    return bad

names = sys.argv[2:] or list(M)
try:
    for name in names:
        expect, ops = M[name]
        texts = {k: orig[k].decode() for k in PATHS}
        try:
            for key, fn in ops: texts[key] = fn(texts[key])
        except AssertionError as e:
            print(f"{name}: NOT-APPLICABLE anchor {e}", flush=True); continue
        for key, _ in ops: (WT / PATHS[key]).write_text(texts[key])
        if ops: assert any((WT / PATHS[k]).read_bytes() != orig[k] for k, _ in ops), f"{name}: no byte changed"
        proc = subprocess.run(["pnpm", "exec", "vitest", "run", PATHS["test"]], cwd=WT, env=ENV, capture_output=True, text=True)
        (OUT / f"mutant-{name}.log").write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr)
        tests = [l.strip() for l in proc.stdout.splitlines() if l.strip().startswith("Tests ")]
        fails = sorted(set(re.findall(r"(?:FAIL|×)\s+tests/unit/v9-provider-credential-files\.test\.ts > (.+?)(?:\s\d+ms)?$", proc.stdout, re.M)))
        bad = restore()
        verdict = "RED" if proc.returncode != 0 else "GREEN"
        print(f"{name}: {verdict} (expect {expect}) rc={proc.returncode} {tests[-1] if tests else 'NO TESTS LINE'} | failed: {fails or '-'} | restore {'OK bytes-equal porcelain-identical' if not bad else 'BAD ' + str(bad)}", flush=True)
        if bad: raise SystemExit("RESTORE FAILED")
finally:
    bad = restore()
    print("final restore", "OK" if not bad else f"BAD {bad}", "| porcelain:", repr(subprocess.run(["git", "status", "--porcelain"], cwd=WT, capture_output=True, text=True).stdout))
