import io,sys
p="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c3c4/dialectical-engine/apps/ui/components/SignUpFlow.tsx"
s=io.open(p,encoding="utf-8").read()
old="""<button type=\"button\" className=\"consentPolicyLink\">Privacy Policy</button>"""
new="""<button className=\"consentPolicyLink\">Privacy Policy</button>"""
assert s.count(old)==1, "anchor count %d for m09_no_type_button" % s.count(old)
io.open(p,"w",encoding="utf-8").write(s.replace(old,new))
