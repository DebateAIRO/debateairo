import sys,re
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
O='/* === consent-ui S02 === */'; C='/* === end consent-ui S02 === */'
i=s.index(O)+len(O); j=s.index(C)
blk=s[i:j]
first=re.search(r'/\*[\s\S]*?\*/',blk).group(0)
open(p,'w',encoding='utf-8').write(s[:i]+blk.replace(first,'/* CODE-REV-S02-C9: comment TEXT changed, not duplicated */',1)+s[j:])
