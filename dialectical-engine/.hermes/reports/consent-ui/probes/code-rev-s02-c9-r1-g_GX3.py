# MY OWN: move S02's whole block INSIDE S01's block (between S01 open and S01 close).
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
so='/* === consent-ui S02 === */'; sc='/* === end consent-ui S02 === */'
i=s.index(so); j=s.index(sc)+len(sc)
block=s[i:j]; rest=s[:i]+s[j:]
c1='/* === end consent-ui S01 === */'
assert rest.count(c1)==1
open(p,'w',encoding='utf-8').write(rest.replace(c1, block+'\n'+c1,1))
