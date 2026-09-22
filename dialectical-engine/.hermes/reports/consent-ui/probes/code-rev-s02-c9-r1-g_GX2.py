import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
o='/* === consent-ui S01 === */'; c='/* === end consent-ui S01 === */'
assert s.count(o)==1 and s.count(c)==1
open(p,'w',encoding='utf-8').write(s.replace(c, c+'\n'+o+'\n.c9revDupS01 { color: var(--ink); }\n'+c,1))
