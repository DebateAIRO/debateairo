import io,sys
p="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c3c4/dialectical-engine/apps/ui/components/SignUpFlow.tsx"
s=io.open(p,encoding="utf-8").read()
old="""I am 18 or over."""
new="""I affirm that I am at least 18 years old."""
assert s.count(old)==1, "anchor count %d for m06_old_wording" % s.count(old)
io.open(p,"w",encoding="utf-8").write(s.replace(old,new))
