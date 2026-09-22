import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
m='/* === end consent-ui S02 === */'
assert s.count(m)==1
open(p,'w',encoding='utf-8').write(s.replace(m,'/* S02 close marker deleted by CODE-REV-S02-C9 */',1))
