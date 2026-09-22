import sys,re
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
O='/* === consent-ui S02 === */'; C='/* === end consent-ui S02 === */'
i=s.index(O)+len(O); j=s.index(C)
blk=re.sub(r'/\*[\s\S]*?\*/','',s[i:j])
open(p,'w',encoding='utf-8').write(s[:i]+blk+s[j:])
