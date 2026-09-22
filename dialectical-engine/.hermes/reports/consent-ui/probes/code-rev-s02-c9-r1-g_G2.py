import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
m='/* === end consent-ui S01 === */'
assert s.count(m)==1
open(p,'w',encoding='utf-8').write(s.replace(m, m+'\n.c9revMutantStray { display: block; }',1))
