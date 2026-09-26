#!/usr/bin/env python3
"""REV-PES-S03-p1 security-data-safety probe. Read-only against the review worktree."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

WT = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-sd/dialectical-engine")
OUT = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REV-PES-S03-p1-security-data-safety")
PKG_DIFF = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/review-packages/S03-p1/diff.patch")

readme = (WT / "deploy/vps/README.md").read_text()
start = readme.index("### What the hosted mode refuses, in code")
end = readme.index("### The credential-file contract")
span = readme[start:end]
lines = span.splitlines()
row_codes = []
for line in lines:
    m = re.match(r"^\| `([A-Z][A-Z0-9_]+)", line)
    if m:
        row_codes.append(m.group(1))
nested = sorted(set(re.findall(r"`([A-Z][A-Z0-9_]{4,})`", span)) - set(row_codes))

V8 = [
    "RUN_COST_ENVELOPE_MONEY_REACHED",
    "PROVIDER_USAGE_UNREPORTED",
    "COST_ENVELOPE_CHARGE_UNREPRESENTABLE",
    "DAILY_COST_ENVELOPE_REACHED",
]
V9 = [
    "PROVIDER_DISCOVERY_TARGETS_INVALID",
    "PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID",
    "PROVIDER_DISCOVERY_TARGET_DUPLICATE",
    "PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID",
]

# enumeration, same anchors as PLAN §1b, against THIS worktree
CODE = re.compile(r'[`"]([A-Z][A-Z0-9_]{4,})(?=[:`"])')

def slurp(rel: str) -> str:
    return (WT / rel).read_text()

def slice_anchor(source: str, frm: str, until: str) -> str:
    a = source.index(frm)
    b = source.index(until, a + len(frm))
    return source[a : b + len(until)]

providers = slurp("packages/providers/src/index.ts")
support = slurp("apps/api/src/support/model.ts")
envelope = slurp("packages/register/src/cost-envelope-policy.ts")
runtime = slurp("packages/register/src/runtime-environment.ts")
anchors = [
    ("E1", providers, "const PROVIDER_CREDENTIAL_REFUSAL_CODES", "] as const);"),
    ("E2", providers, "const PROVIDER_CREDENTIAL_ABSENT_CODE = ", ";"),
    ("E3", support, "export const SUPPORT_MODEL_STARTUP_REFUSAL_CODES", "] as const);"),
    ("E4", providers, "export function assertPricedProviderTargets", "\n}"),
    ("E5", providers, "function providerTargetPriceAmount", "\n}"),
    ("E6a", envelope, "export function costEnvelopePolicyFromValue", "\n}"),
    ("E6b", envelope, "export async function readCostEnvelopePolicy", "\n}"),
    ("E7", runtime, "export class SupportAdmissionScopesNotSealedError", "\n}"),
]
union: set[str] = set()
anchor_lines = []
for name, source, frm, until in anchors:
    body = slice_anchor(source, frm, until)
    codes = CODE.findall(body)
    union.update(codes)
    anchor_lines.append(f"{name} n={len(codes)} {codes}")

# throw-site scan: every .ts under apps/ and packages/
roots = [WT / "apps", WT / "packages"]
ts_files = []
for root in roots:
    ts_files.extend(p for p in root.rglob("*.ts") if "node_modules" not in p.parts)

def hits_for(code: str) -> list[str]:
    found = []
    needle = code
    for path in ts_files:
        text = path.read_text(errors="replace")
        if needle not in text:
            continue
        rel = path.relative_to(WT).as_posix()
        file_lines = text.splitlines()
        for i, line in enumerate(file_lines, 1):
            if needle not in line:
                continue
            window = "\n".join(file_lines[max(0, i - 12) : i])
            kind = "mention"
            if "throw " in line or "throw\n" in line:
                kind = "throw-line"
            elif re.search(r"\bthrow\b", window):
                kind = "throw-window"
            elif "class " in line and "Error" in line:
                kind = "error-class"
            found.append(f"{kind}\t{rel}:{i}\t{line.strip()[:180]}")
    return found

report = []
report.append(f"row_codes {len(row_codes)}")
for c in row_codes:
    report.append(f"  ROW {c}")
report.append(f"nested {nested}")
report.append(f"heading={lines[0]!r}")
report.append(f"union_size={len(union)}")
report.extend(anchor_lines)
missing_from_span = sorted(union - set(re.findall(r"`([A-Z][A-Z0-9_]{4,})`", span)))
report.append(f"enumerated_missing_from_refusal_span={missing_from_span}")
report.append("V8_in_span:")
for c in V8:
    report.append(f"  {c} count={span.count(c)}")
report.append("V9_in_span:")
for c in V9:
    report.append(f"  {c} count={span.count(c)}")

all_named = row_codes + nested
report.append("--- throw sites ---")
for code in all_named:
    hs = hits_for(code)
    throwish = [h for h in hs if h.startswith("throw") or h.startswith("error-class")]
    report.append(f"CODE {code} hits={len(hs)} throwish={len(throwish)}")
    shown = throwish[:4] if throwish else hs[:4]
    for h in shown:
        report.append("  " + h)
    if not hs:
        report.append("  NO HITS IN apps/ or packages/ .ts")

# secrets
diff = PKG_DIFF.read_text()
added = "\n".join(line[1:] for line in diff.splitlines() if line.startswith("+") and not line.startswith("+++"))
files = {
    "diff.patch": diff,
    "diff.added": added,
    "README.md": readme,
    "v9.test.ts": (WT / "tests/unit/v9-provider-credential-files.test.ts").read_text(),
}
report.append("--- secrets ---")
patterns = {
    "sk-": re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    "xai-": re.compile(r"xai-[A-Za-z0-9_\-]{8,}"),
    "AIza": re.compile(r"AIza[0-9A-Za-z_\-]{10,}"),
    "bearer": re.compile(r"Bearer\s+\S+"),
    "b64_40": re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/])"),
    "users_path": re.compile(r"/Users/\S+"),
    "home_path": re.compile(r"/home/\S+"),
    "abs_cred": re.compile(r"/etc/debateai/\S+"),
    "mode_0700": re.compile(r"\b0700\b"),
}
for label, text in files.items():
    report.append(f"FILE {label}")
    for name, cre in patterns.items():
        hits = cre.findall(text)
        # cap
        uniq = []
        for h in hits:
            if h not in uniq:
                uniq.append(h)
        report.append(f"  {name} n={len(hits)} uniq={uniq[:12]}")

# paid-probe paragraph
sec = readme[readme.index("## 11. Providers and vendors"):]
blocks = re.split(r"\n[ \t]*\n", sec)
para = next(b for b in blocks if "max_tokens" in b)
report.append("--- probe paragraph ---")
report.append(para.replace("\n", " "))
report.append(f"max_tokens_in_section={len(re.findall('max_tokens', sec))}")

text = "\n".join(report) + "\n"
(OUT / "security-probe.txt").write_text(text)
print(text)
