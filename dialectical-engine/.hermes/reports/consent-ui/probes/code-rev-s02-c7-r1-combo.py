#!/usr/bin/env python3
"""usage: combo.py <LANE> <LABEL> <COMBO-NAME>   — lane from argv (COMMON 10.35)."""
import subprocess, sys, os, re
ACK_DOM_ONLY = ("    if (input !== null) input.checked = true;\n    setPrivacyAccepted(true);",
                "    if (input !== null) input.checked = true;")
MEMBER2 = ("    setPrivacyAccepted(privacyInputRef.current?.checked ?? false);\n    setPolicyOpen(false);",
           "    setPolicyOpen(false);")
GUARD = ("                setPrivacyAccepted(\n                  event.currentTarget.checked && !event.nativeEvent.defaultPrevented\n                )",
         "                setPrivacyAccepted(event.currentTarget.checked)")
COMBOS = {"M8": [ACK_DOM_ONLY, MEMBER2], "R8": [GUARD, MEMBER2]}
lane, label, name = sys.argv[1], sys.argv[2], sys.argv[3]
p = os.path.join(lane, "apps/ui/components/SignUpFlow.tsx")
src = open(p, encoding="utf8").read()
for old, new in COMBOS[name]:
    assert src.count(old) == 1, f"anchor count {src.count(old)}"
    src = src.replace(old, new, 1)
open(p, "w", encoding="utf8").write(src)
r = subprocess.run("pnpm exec vitest run tests/render/consent-signup-modal.test.tsx", cwd=lane, shell=True, capture_output=True, text=True)
out = r.stdout + r.stderr
print(f"{label} | exit={r.returncode} | " + [l.strip() for l in out.splitlines() if re.match(r"^\s*Tests\s+", l)][-1])
for l in sorted(set(x.strip() for x in out.splitlines() if x.startswith(" FAIL "))): print("   " + l.split(" > ")[-1])
subprocess.run("git checkout HEAD -- apps/ui/components/SignUpFlow.tsx", cwd=lane, shell=True)
print("   restore porcelain:", repr("\n".join(l for l in subprocess.run("git status --porcelain", cwd=lane, shell=True, capture_output=True, text=True).stdout.splitlines() if ".review-scratch" not in l and "zz-rev" not in l)) or "EMPTY")
