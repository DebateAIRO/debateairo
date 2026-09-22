import io,sys
p="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c3c4/dialectical-engine/apps/ui/components/SignUpFlow.tsx"
s=io.open(p,encoding="utf-8").read()
old="""                  event.currentTarget.checked && !event.nativeEvent.defaultPrevented"""
new="""                  event.currentTarget.checked"""
assert s.count(old)==1, "anchor count %d for m11_no_b1_guard" % s.count(old)
io.open(p,"w",encoding="utf-8").write(s.replace(old,new))
