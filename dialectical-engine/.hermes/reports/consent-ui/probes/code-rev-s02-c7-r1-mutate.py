#!/usr/bin/env python3
"""CODE-REV-S02-C7 r1 mutator kit. LANE COMES FROM argv (COMMON 10.35) — no hard-coded path.

usage: mutate.py <LANE> <MUTANT> [testfile ...]
       mutate.py <LANE> list
Applies one exact-string mutation, runs vitest on the given files, prints the summary and the
FAIL test names, then reverts with `git checkout HEAD -- <path>` and prints `git status --porcelain`.
"""
import subprocess, sys, os, re

SIGNUP = "apps/ui/components/SignUpFlow.tsx"
GROUP = "tests/render/consent-signup-group.test.tsx"
MODSEM = "apps/ui/components/consent/modalSemantics.ts"

MUTANTS = {
    # --- re-plants of the author's matrix ---
    "M1_predicate_reads_dom": (SIGNUP, "    if (privacyAccepted) {", "    if (input.checked) {"),
    "M2_no_preventdefault": (SIGNUP, "    event.preventDefault();\n    /* The helper returns focus", "    /* The helper returns focus"),
    "M3_no_click_uncheck": (SIGNUP, "      if (event.target !== input) input.click();", "      /* mutant: uncheck path removed */"),
    "M4_uncheck_by_assignment": (SIGNUP, "      if (event.target !== input) input.click();", "      if (event.target !== input) input.checked = false;"),
    "M5_ack_dom_only": (SIGNUP, "    if (input !== null) input.checked = true;\n    setPrivacyAccepted(true);", "    if (input !== null) input.checked = true;"),
    "M6_ack_mirror_only": (SIGNUP, "    if (input !== null) input.checked = true;\n    setPrivacyAccepted(true);", "    setPrivacyAccepted(true);"),
    "M7_member2_removed": (SIGNUP, "    setPrivacyAccepted(privacyInputRef.current?.checked ?? false);\n    setPolicyOpen(false);", "    setPolicyOpen(false);"),
    "M9_no_focus": (SIGNUP, "    input.focus();\n    setPolicyOpen(true);", "    setPolicyOpen(true);"),
    "M10_resync_inline": (SIGNUP,
        "    queueMicrotask(() => {\n      const box = privacyInputRef.current;\n      if (box !== null) box.checked = false;\n    });",
        "    input.checked = false;"),
    "M11_resync_removed": (SIGNUP,
        "    queueMicrotask(() => {\n      const box = privacyInputRef.current;\n      if (box !== null) box.checked = false;\n    });",
        "    /* mutant: tracker resync removed entirely */"),
    "M12_disabled_true": (SIGNUP, "disabled={busy || sent || !adultAffirmed || !privacyAccepted}", "disabled={true}"),
    "M13_modal_inside_form": (SIGNUP, "      </form>\n", "      "),  # handled specially below
    "M14_mode_read": (SIGNUP, 'mode="consent"', 'mode="read"'),
    "N1_handler_ignores_buttons": (SIGNUP,
        "    const input = privacyInputRef.current;\n    if (input === null) return;",
        "    const input = privacyInputRef.current;\n    if (input === null) return;\n    if ((event.target as HTMLElement).tagName === \"BUTTON\") return;"),
    "m09_no_type_button": (SIGNUP, '<button type="button" className="consentPolicyLink"', '<button className="consentPolicyLink"'),
    "MN4_clause_removed": (MODSEM,
        "    if (!other.isConnected) continue;\n    if (!held.isConnected) {\n      top = candidate;\n      continue;\n    }\n",
        ""),
    # --- MY OWN mutants (reviewer-built, beyond the author's matrix) ---
    "R1_reentrancy_guard_removed": (SIGNUP, "      if (event.target !== input) input.click();", "      input.click();"),
    "R2_conditional_mount_to_open_prop": (SIGNUP,
        "      {policyOpen ? (\n        <PrivacyPolicyModal\n          open\n",
        "      {true ? (\n        <PrivacyPolicyModal\n          open={policyOpen}\n"),
    "R3_ack_does_not_close": (SIGNUP, "    setPrivacyAccepted(true);\n    setPolicyOpen(false);", "    setPrivacyAccepted(true);"),
    "R4_resync_true_not_false": (SIGNUP, "      if (box !== null) box.checked = false;", "      if (box !== null) box.checked = true;"),
    "R5_focus_after_open": (SIGNUP, "    input.focus();\n    setPolicyOpen(true);", "    setPolicyOpen(true);\n    input.focus();"),
    "R6_settimeout_instead_of_microtask": (SIGNUP, "    queueMicrotask(() => {", "    setTimeout(() => {"),
    "R7_onchange_drops_defaultprevented": (SIGNUP,
        "                setPrivacyAccepted(\n                  event.currentTarget.checked && !event.nativeEvent.defaultPrevented\n                )",
        "                setPrivacyAccepted(event.currentTarget.checked)"),
}

def sh(cmd, cwd):
    return subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    lane = sys.argv[1]
    name = sys.argv[2]
    if name == "list":
        for k in MUTANTS: print(k)
        return
    files = sys.argv[3:] or ["tests/render/consent-signup-modal.test.tsx"]
    path, old, new = MUTANTS[name]
    full = os.path.join(lane, path)
    src = open(full, encoding="utf8").read()
    if src.count(old) != 1:
        print(f"MUTANT {name}: anchor count = {src.count(old)} (expected 1) — NOT APPLIED"); sys.exit(3)
    open(full, "w", encoding="utf8").write(src.replace(old, new, 1))
    r = sh("pnpm exec vitest run " + " ".join(files), lane)
    out = r.stdout + r.stderr
    summ = [l for l in out.splitlines() if re.match(r"^\s*Tests\s+", l)]
    fails = sorted(set(l.strip() for l in out.splitlines() if l.startswith(" FAIL ")))
    print(f"MUTANT {name} | vitest exit={r.returncode}")
    print("  " + (summ[-1].strip() if summ else "NO SUMMARY LINE (broken run)"))
    for f in fails: print("  " + f)
    if not fails: print("  (no FAIL lines — mutant NOT caught)")
    sh(f"git checkout HEAD -- {path}", lane)
    p = sh("git status --porcelain", lane).stdout.strip()
    p = "\n".join(l for l in p.splitlines() if ".review-scratch" not in l)
    print("  restore: git status --porcelain (excluding .review-scratch) = " + (repr(p) if p else "EMPTY"))

main()
