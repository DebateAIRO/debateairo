import sys
p=sys.argv[1]; L=open(p,encoding='utf-8').read().split('\n')
# delete lines 150-153 (1-based) = the queueMicrotask block
assert L[149].strip().startswith('queueMicrotask'), L[149]
assert L[152].strip()=='});', L[152]
del L[149:153]
open(p,'w',encoding='utf-8').write('\n'.join(L))
