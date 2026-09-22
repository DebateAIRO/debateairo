import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="""const failingAt = (alpha: number): string[] =>
  ratiosAt(alpha)
    .filter(([, ratio]) => ratio < 4.5)
    .map(([label]) => label);"""
new="""const failingAt = (alpha: number): string[] =>
  labelsAt(alpha).filter((entry) => Number.parseFloat(entry.split(" ")[1]!) < 4.5);"""
assert s.count(old)==1, s.count(old)
open(p,'w',encoding='utf-8').write(s.replace(old,new))
