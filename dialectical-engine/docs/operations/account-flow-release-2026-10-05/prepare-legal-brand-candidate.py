#!/usr/bin/env python3
"""Generate/check an unpublished product-brand-only candidate from exact inventory spans.
Never modifies canonical/generated legal notices, dates, versions or operator facts.
"""
import argparse,difflib,hashlib,json,pathlib
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
def prepare():
 inventory=json.loads((HERE/'legal-brand-inventory.json').read_text())
 entries=sorted((x for x in inventory['entries'] if x['path'].startswith('apps/ui/legal/')),key=lambda x:x['path'])
 assert len(entries)==70
 patches=[];hashes=[];replaced=0;protected=0
 for entry in entries:
  path=entry['path'];source=(ROOT/path).read_bytes();assert sha(source)==entry['sha256'],path
  original=source.decode('utf8');lines=original.splitlines(keepends=True);by_line={}
  for match in entry['matches']:
   line,column,token=match['line']-1,match['column']-1,match['token']
   assert lines[line][column:column+len(token)]==token,path
   if match['registeredIdentityLiteral']:assert token=='DebateAIRO'
   if token=='DebateAIRO':
    protected+=1;continue # Protect every identity token, even outside corporate-context spans.
   assert token=='DebateAI';by_line.setdefault(line,[]).append(column);replaced+=1
  for line,columns in by_line.items():
   for column in sorted(columns,reverse=True):lines[line]=lines[line][:column]+'Dialectical Engine'+lines[line][column+len('DebateAI'):]
  candidate=''.join(lines)
  assert candidate.count('DebateAIRO')==original.count('DebateAIRO'),path
  assert candidate.count('DebateAI')==candidate.count('DebateAIRO'),path
  assert candidate.replace('Dialectical Engine','DebateAI')==original,path
  patches.extend(difflib.unified_diff(original.splitlines(keepends=True),candidate.splitlines(keepends=True),fromfile='a/'+path,tofile='b/'+path))
  hashes.append({'path':path,'currentSha256':sha(source),'brandCandidateSha256':sha(candidate.encode())})
 return ''.join(patches),json.dumps(hashes,indent=2)+'\n',replaced,protected
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args()
 patch,hashes,replaced,protected=prepare()
 for name,text in [('legal-brand-candidate.patch',patch),('legal-brand-candidate-hashes.json',hashes)]:
  target=HERE/name
  if a.check:assert target.read_text()==text,name
  else:target.write_text(text)
 print(json.dumps({'mode':'CHECK' if a.check else 'DRAFT_ONLY','files':70,'productSpansReplaced':replaced,'identityLiteralsPreserved':protected,'canonicalNoticesModified':False}))
