import re, os, subprocess
BASE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/"
LANE=BASE+".worktrees/consent-s01/dialectical-engine/"
plan=open(BASE+"docs/missions/consent-ui/slices/S01/PLAN.md",encoding="utf-8").read()
pl=plan.split("\n")
cites=[]
for i,l in enumerate(pl,1):
    for m in re.finditer(r'([A-Za-z0-9_./-]+\.(?:ts|tsx|css|mjs|js|md|json)):(\d+)(?:-(\d+))?', l):
        cites.append((i,m.group(1),m.group(2),m.group(3)))
seen=set(); uniq=[]
for c in cites:
    k=(c[1],c[2],c[3])
    if k not in seen: seen.add(k); uniq.append(c)
print("distinct path:line citations:", len(uniq))
def find(f):
    for root in (LANE, BASE):
        p=os.path.join(root,f)
        if os.path.isfile(p): return p
    base=os.path.basename(f)
    for root in (LANE, BASE):
        try:
            out=subprocess.run(["find",root,"-name",base,"-not","-path","*/node_modules/*",
                                "-not","-path","*/.next/*","-not","-path","*/.git/*"],
                               capture_output=True,text=True,timeout=90).stdout.split()
        except Exception: out=[]
        cand=[o for o in out if o.endswith("/"+f) or o.endswith(f)]
        if cand: return sorted(cand,key=len)[0]
        if out: return sorted(out,key=len)[0]
    return None
bad=[];ok=0
for ln,f,a,b in uniq:
    p=find(f)
    if not p: bad.append((ln,f,a,"NOT FOUND")); continue
    n=sum(1 for _ in open(p,encoding="utf-8",errors="replace"))
    hi=int(b) if b else int(a)
    if int(a)<1 or hi>n: bad.append((ln,f,a+("-"+b if b else ""),"OUT OF RANGE (file has %d lines) -> %s"%(n,p)))
    else: ok+=1
print("resolve AND in range: %d / %d" % (ok,len(uniq)))
for x in bad: print("   PROBLEM:", x)
