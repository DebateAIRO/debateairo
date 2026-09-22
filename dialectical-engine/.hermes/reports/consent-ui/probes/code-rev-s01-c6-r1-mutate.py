import sys, io
which = sys.argv[1]
cc = "apps/ui/components/consent/CookieConsent.tsx"
cp = "apps/ui/components/consent/CookiePreferencesCard.tsx"
def rw(p, a, b, expect=1):
    s = open(p, encoding="utf-8").read()
    assert s.count(a) == expect, f"anchor count {s.count(a)} != {expect} in {p}"
    open(p, "w", encoding="utf-8").write(s.replace(a, b))

if which == "MR1":  # DOM ORDER SWAPPED — policy element BEFORE the card
    s = open(cc, encoding="utf-8").read()
    card = """        <CookiePreferencesCard
          key={opens}
          initial={initial}
          onSave={(choice: ConsentChoice): void =>
            settle(decisionFor("save-choices", { quality: choice.quality, analytics: choice.analytics }))
          }
          onEssentialOnly={(): void => settle(decisionFor("essential-only"))}
          onDismiss={dismiss}
          onRequestPolicy={(): void => setPolicyOpen(true)}
        />
"""
    modal = """        {policyOpen && (
          <PrivacyPolicyModal open mode="read" onClose={(): void => setPolicyOpen(false)} />
        )}
"""
    assert s.count(card) == 1 and s.count(modal) == 1, "anchors"
    s = s.replace(card + modal, modal + card)
    open(cc, "w", encoding="utf-8").write(s)

elif which == "MR2":  # initialFocusRef -> the card container, not the first operable toggle
    rw(cp, "initialFocusRef: firstOperableRef", "initialFocusRef: cardRef")

elif which == "MR4":  # the helper is asked for nothing: open=false
    rw(cp, "useModalSurface(true, {", "useModalSurface(false, {")

elif which == "MR5":  # containerRef -> the SCRIM instead of the card
    rw(cp, "containerRef: cardRef", "containerRef: scrimRef")

else:
    raise SystemExit("unknown mutant " + which)
print("planted", which)
