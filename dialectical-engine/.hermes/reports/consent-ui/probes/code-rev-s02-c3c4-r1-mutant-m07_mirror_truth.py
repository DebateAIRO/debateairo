import io,sys
p="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c3c4/dialectical-engine/apps/ui/components/SignUpFlow.tsx"
s=io.open(p,encoding="utf-8").read()
old="""if (data.get(\"adult-affirmed\") !== \"on\" || data.get(\"privacy-accepted\") !== \"on\") return;"""
new="""if (!adultAffirmed || !privacyAccepted) return;"""
assert s.count(old)==1, "anchor count %d for m07_mirror_truth" % s.count(old)
io.open(p,"w",encoding="utf-8").write(s.replace(old,new))
