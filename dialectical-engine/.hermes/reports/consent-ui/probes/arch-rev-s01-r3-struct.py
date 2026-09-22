import re, os, sys
BASE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/"
LANE=BASE+".worktrees/consent-s01/dialectical-engine/"
plan=open(BASE+"docs/missions/consent-ui/slices/S01/PLAN.md",encoding="utf-8").read()
spec=open(BASE+"docs/missions/consent-ui/slices/S01/SPEC.md",encoding="utf-8").read()
pl=plan.split("\n")
if pl and pl[-1]=="": pl=pl[:-1]
print("PLAN lines:", len(pl))
# steps
steps=[]
for i,l in enumerate(pl,1):
    m=re.match(r'^\*\*S01-S(\d{2})\b', l)
    if m: steps.append((i,"S01-S"+m.group(1)))
ids=[s[1] for s in steps]
print("steps defined:", len(ids), "unique:", len(set(ids)), "min:",min(ids),"max:",max(ids),
      "contiguous:", sorted(int(x[-2:]) for x in ids)==list(range(1,len(ids)+1)))
# fields per step: serves/files/test/accept/cluster
missing={}
for k,(ln,sid) in enumerate(steps):
    end = steps[k+1][0]-1 if k+1<len(steps) else len(pl)
    body="\n".join(pl[ln-1:end])
    for f in ["serves:","files:","test:","accept:","cluster:"]:
        if ("· "+f) not in body and ("·"+f) not in body:
            missing.setdefault(f,[]).append(sid)
print("steps missing a field:", {k:v for k,v in missing.items()} or "NONE")
print("steps carrying a serves:", sum(1 for k,(ln,sid) in enumerate(steps)
      if "· serves:" in "\n".join(pl[ln-1:(steps[k+1][0]-1 if k+1<len(steps) else len(pl))])))
# SPEC requirements
reqs=sorted(set(re.findall(r'\bS01-R\d{2}\b', spec)))
print("reqs in SPEC (distinct S01-Rnn):", len(reqs))
# trace rows: table rows starting | **S01-Rnn**
rows=re.findall(r'^\|\s*\**\s*(S01-R\d{2})\s*\**\s*\|(.*)$', plan, re.M)
print("trace rows in PLAN:", len(rows), "distinct:", len(set(r[0] for r in rows)))
rowreq=set(r[0] for r in rows)
print("reqs with no trace row:", sorted(set(reqs)-rowreq) or "none")
print("trace rows with no SPEC req:", sorted(rowreq-set(reqs)) or "none")
stepsinrows=set()
for r in rows: stepsinrows |= set(re.findall(r'S01-S\d{2}', r[1]))
print("steps named in >=1 row:", len(stepsinrows), " steps in NO row:", sorted(set(ids)-stepsinrows) or "none")
print("row ids not defined as steps:", sorted(stepsinrows-set(ids)) or "[]")
# refutation table rows
ref=re.findall(r'^\|\s*\**\s*(S01-S\d{2})\s*\**\s*\|(.*)\|(.*)\|', plan, re.M)
print("refutation rows (S01-Snn table rows):", len(ref))
short=[r[0] for r in ref if len(r[1].strip())<15 or len(r[2].strip())<10]
print("  short/empty cells:", short or "none")
# banned words
banned=["improve","better","robust","handle","appropriate"]
hits=[]
for i,l in enumerate(pl,1):
    for b in banned:
        if re.search(r'\b'+b+r'\b', l, re.I): hits.append((i,b))
print("banned-word hits:", len(hits), sorted(set(h[0] for h in hits)))
# path:line citations
cites=sorted(set(re.findall(r'`?([A-Za-z0-9_./-]+\.(?:ts|tsx|css|mjs|js|md|json)):(\d+)(?:-(\d+))?`?', plan)))
ok=0; bad=[]
for f,a,b in cites:
    cand=[LANE+f, BASE+f, BASE+"docs/missions/consent-ui/"+f, BASE+"docs/missions/consent-ui/slices/S01/"+f,
          BASE+"docs/missions/consent-ui/slices/S02/"+f, BASE+"docs/missions/consent-ui/design/"+f,
          LANE+"apps/ui/"+f, BASE+".hermes/planning/consent-ui/packets/"+f]
    p=next((c for c in cand if os.path.isfile(c)), None)
    if p is None: bad.append((f,a,"FILE NOT FOUND")); continue
    n=sum(1 for _ in open(p,encoding="utf-8",errors="replace"))
    hi=int(b) if b else int(a)
    if int(a)<1 or hi>n: bad.append((f,a+("-"+b if b else ""),"OUT OF RANGE (file has %d)"%n))
    else: ok+=1
print("path:line citations: %d total, %d resolve in range" % (len(cites), ok))
print("  problems:", bad or "none")
