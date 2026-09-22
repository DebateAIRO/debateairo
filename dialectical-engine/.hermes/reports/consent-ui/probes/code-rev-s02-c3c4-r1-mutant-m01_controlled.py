import io,sys
p="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c3c4/dialectical-engine/apps/ui/components/SignUpFlow.tsx"
s=io.open(p,encoding="utf-8").read()
old="""              required
              disabled={busy || sent}
              onChange={(event) => setAdultAffirmed(event.currentTarget.checked)}"""
new="""              required
              checked={adultAffirmed}
              disabled={busy || sent}
              onChange={(event) => setAdultAffirmed(event.currentTarget.checked)}"""
assert s.count(old)==1, "anchor count %d for m01_controlled" % s.count(old)
io.open(p,"w",encoding="utf-8").write(s.replace(old,new))
