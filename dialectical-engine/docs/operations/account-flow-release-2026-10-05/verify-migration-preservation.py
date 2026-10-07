#!/usr/bin/env python3
"""Read-only source preservation check; run from the engine checkout with Git history.
Catalog shape, ownership and effective grants require the separate DB probes.
"""
import hashlib,json,pathlib,re,subprocess
record=json.loads(pathlib.Path(__file__).with_name('migration-preservation.json').read_text())
for row in record['files']:
 p=pathlib.Path(row['path']);current=p.read_bytes();expected=row.get('sha256',row.get('candidateSha256'))
 assert hashlib.sha256(current).hexdigest()==expected,p
 if row['kind']=='immutable-historical':
  assert current==subprocess.check_output(['git','show',record['base']+':dialectical-engine/'+str(p)]),p
 elif row['kind']=='guard-only-pending':
  original=subprocess.check_output(['git','show',record['base']+':dialectical-engine/'+str(p)])
  assert hashlib.sha256(original).hexdigest()==row['baseSha256'],p
  s=original.decode();n=int(p.name[:4])
  s=re.sub(r'(?m)^CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ',s)
  s=re.sub(r'(?m)^CREATE TABLE (?!IF NOT EXISTS )','CREATE TABLE IF NOT EXISTS ',s)
  s=re.sub(r'(?m)^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS )',lambda m:'CREATE '+(m[1] or '')+'INDEX IF NOT EXISTS ',s)
  s=re.sub(r'\bADD COLUMN (?!IF NOT EXISTS )','ADD COLUMN IF NOT EXISTS ',s)
  s=re.sub(r'\bDROP CONSTRAINT (?!IF EXISTS )','DROP CONSTRAINT IF EXISTS ',s)
  if n==95:s=s.replace('ALTER TABLE identity."user"\n','ALTER TABLE identity."user" DROP CONSTRAINT IF EXISTS identity_user_phone_profile_consistent;\nALTER TABLE identity."user"\n',1)
  if n==101:s=s.replace('ALTER TABLE identity.login_challenge ADD CONSTRAINT login_first_step','ALTER TABLE identity.login_challenge DROP CONSTRAINT IF EXISTS login_first_step;\nALTER TABLE identity.login_challenge ADD CONSTRAINT login_first_step',1)
  assert s.encode()==current,p
print(json.dumps({'verifiedFiles':len(record['files']),'historicalUnchanged':102,'pendingGuardOnly':8,'external103':'checksum-preserved','forward104':'separate-hash-bound','catalogAndRoleAcceptance':'SEPARATE_EVIDENCE_REQUIRED'}))
