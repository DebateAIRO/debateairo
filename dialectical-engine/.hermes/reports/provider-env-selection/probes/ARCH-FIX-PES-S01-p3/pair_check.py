# ARCH-FIX-PES-S01-p3 — C3-F1's detector as a standalone script (PLAN §4 V14): the rule of
# tests/architecture/p3-production-database-principals.test.ts:582-600, restated without Vitest. Every file under
# apps/api/src, apps/runner/src, apps/scheduler/src (recursive, *.ts) plus apps/observation-agent/src/main.ts that
# contains "createPool" or "new pg.Pool" contributes one pair per `…DATABASE_URL` token it contains; the manifest's
# executable connection purposes (bindings WIRED, WIRED_WHEN_ENABLED, DEVELOPMENT_ONLY, DEVELOPMENT_ONLY_UNBOUND,
# environmentKey not null) contribute `sourceFile::environmentKey`. The two SETS must be equal.
# Usage: python3 pair_check.py <root>   (root = a dialectical-engine directory: the lane or a mirror)
import json, os, re, sys
root = sys.argv[1]
TOKEN = re.compile(r"\b(?:[A-Z][A-Z0-9_]*_)?DATABASE_URL\b")
paths = []
for base in ("apps/api/src", "apps/runner/src", "apps/scheduler/src"):
    for d, _, files in os.walk(os.path.join(root, base)):
        paths += [os.path.relpath(os.path.join(d, f), root) for f in files if f.endswith(".ts")]
paths.append("apps/observation-agent/src/main.ts")
source = set()
for p in paths:
    text = open(os.path.join(root, p), encoding="utf-8").read()
    if "createPool" not in text and "new pg.Pool" not in text: continue
    source |= {f"{p}::{m.group(0)}" for m in TOKEN.finditer(text)}
m = json.load(open(os.path.join(root, "docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")))
purposes = [c for p in m["principals"] for c in p["connectionPurposes"]] + m["developmentOnlyPrincipalBindings"] + m["unboundConnectionPurposes"]
EXEC = {"WIRED", "WIRED_WHEN_ENABLED", "DEVELOPMENT_ONLY", "DEVELOPMENT_ONLY_UNBOUND"}
manifest = {f"{c.get('sourceFile')}::{c['environmentKey']}" for c in purposes if c["binding"] in EXEC and c["environmentKey"] is not None}
extra, missing = sorted(source - manifest), sorted(manifest - source)
print(f"source pairs {len(source)} · manifest pairs {len(manifest)}")
for e in extra: print("  undeclared in the manifest:", e)
for e in missing: print("  declared but not in source:", e)
print("PAIRS:", "PASS" if not extra and not missing else "FAIL"); sys.exit(0 if not extra and not missing else 1)
