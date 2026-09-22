"""CODE-REV-S01-C3C4 r1 — mutant planter. Applies ONE exact edit, or reverts it.

Usage: mutate.py apply <id>   /   mutate.py check <id>
Every mutant is an exact literal replacement, so a silent no-op is impossible:
the script exits 2 if the anchor is not found exactly once.
"""
import sys, pathlib

BAR = "apps/ui/components/consent/CookieBar.tsx"
CARD = "apps/ui/components/consent/CookiePreferencesCard.tsx"
CSS = "apps/ui/app/globals.css"

MUTANTS = {
    # --- author concern 4: the three that were green-while-wrong until mutation ---
    "A-essential-operable": (CARD,
        "    if (category.locked || id === \"essential\") return;\n",
        ""),
    # A2: the ONLY real enforcement point of the lock is `stateOf`'s hard-coded
    # `true`. Mutate that as well, i.e. hold `essential` in state and flip it
    # like the others — the shape the author's comment claims to have measured.
    "A2-lock-both-points": (CARD,
        "  const stateOf = (id: CookieCategory[\"id\"]): boolean =>\n    id === \"essential\" ? true : toggles[id];\n\n  const flip = (category: CookieCategory): void => {",
        "  const stateOf = (id: CookieCategory[\"id\"]): boolean =>\n    (toggles as Record<string, boolean>)[id] ?? true;\n\n  const flip = (category: CookieCategory): void => {"),
    "A3-drop-flip-guard-only": (CARD,
        "    if (category.locked || id === \"essential\") return;\n",
        ""),
    "B-second-bottom": (CSS,
        ".consentBar {\n  position: fixed;\n  left: 22px;\n  right: 22px;\n  bottom: calc(22px + var(--safe-b));\n",
        ".consentBar {\n  position: fixed;\n  left: 22px;\n  right: 22px;\n  bottom: calc(22px + var(--safe-b));\n  bottom: 88px;\n"),
    "C-ts7053": (CARD,
        "    const id = category.id;\n    if (category.locked || id === \"essential\") return;\n    setToggles((current) => ({ ...current, [id]: !current[id] }));",
        "    if (category.locked || category.id === \"essential\") return;\n    setToggles((current) => ({ ...current, [category.id]: !current[category.id] }));"),
    # --- reviewer's own, from the SPEC properties ---
    "D-ignore-initial": (CARD,
        "    quality: initial.quality,\n    analytics: initial.analytics",
        "    quality: false,\n    analytics: false"),
    "E-paraphrase-title": (BAR,
        "We store only what keeps the bench running — unless you say otherwise.",
        "We store only what keeps the bench running - unless you say otherwise."),
    "F-button-order": (BAR,
        "            <button type=\"button\" className=\"consentGhost\" onClick={onEssentialOnly}>\n              Essential only\n            </button>\n",
        ""),
    "F2-button-order-tail": (BAR,
        "            <button type=\"button\" className=\"consentPrimary\" onClick={onAcceptAll}>\n              Accept all\n            </button>\n",
        "            <button type=\"button\" className=\"consentPrimary\" onClick={onAcceptAll}>\n              Accept all\n            </button>\n            <button type=\"button\" className=\"consentGhost\" onClick={onEssentialOnly}>\n              Essential only\n            </button>\n"),
    "G-close-glyph": (BAR,
        "          </div>\n        </div>\n      </div>\n    </div>\n  );",
        "          </div>\n          <button type=\"button\" className=\"consentGhost\" aria-label=\"Close\">×</button>\n        </div>\n      </div>\n    </div>\n  );"),
    "H-inline-category": (CARD,
        "<div className=\"consentCatDesc\">{category.description}</div>",
        "<div className=\"consentCatDesc\">Aggregate page and feature usage. No cross-site tracking, no advertising, never sold.</div>"),
    "I-save-swapped": (CARD,
        "onSave({ essential: true, quality: toggles.quality, analytics: toggles.analytics })",
        "onSave({ essential: true, quality: toggles.analytics, analytics: toggles.quality })"),
    "J-no-labelledby": (CARD,
        " aria-labelledby={titleId}",
        ""),
    "K-colour-literal": (CSS,
        ".consentGhostStrong { color: var(--ink); }",
        ".consentGhostStrong { color: #29261F; }"),
    "L-second-block": (CSS,
        "/* === end consent-ui S01 === */",
        "/* === end consent-ui S01 === */\n/* === consent-ui S01 === */\n.consentStray { color: var(--ink); }\n/* === end consent-ui S01 === */"),
    "M-no-media-query": (CSS,
        "@media (max-width: 719.98px) {",
        "@media (max-width: 1px) {"),
    "N-space-not-handled": (CARD,
        "                      if (event.key !== \" \" && event.key !== \"Enter\") return;",
        "                      if (event.key !== \"Enter\") return;"),
}

def main():
    action, mid = sys.argv[1], sys.argv[2]
    rel, old, new = MUTANTS[mid]
    p = pathlib.Path(rel)
    text = p.read_text(encoding="utf8")
    src, dst = (old, new) if action == "apply" else (new, old)
    if text.count(src) != 1:
        print("ANCHOR NOT UNIQUE (%d occurrences) for %s in %s" % (text.count(src), mid, rel))
        sys.exit(2)
    p.write_text(text.replace(src, dst, 1), encoding="utf8")
    print("%s %s -> %s" % (action, mid, rel))

main()
