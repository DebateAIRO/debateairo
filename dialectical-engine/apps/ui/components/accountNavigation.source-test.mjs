import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=path=>readFileSync(path,'utf8');
test('account navigation has no synthetic identity or legacy-claim surface and retains real sessions',()=>{
 const settings=read('components/SettingsPageClient.tsx');assert.doesNotMatch(settings,/identityRows|LegacyRunClaimControls|settings\.identity\./);assert.match(settings,/<SessionControls/);assert.match(settings,/settings\/security/);
 const kb=read('../../packages/support-kb/src/catalog.ts');assert.doesNotMatch(kb,/claim-legacy|Claim legacy debates/);assert.match(kb,/active-sessions/);
});
test('Help popup escapes header containing block and has a raised stacking context',()=>{
 const css=read('app/globals.css');assert.match(css,/\.supportHeader\s*\{[^}]*position:\s*relative[^}]*z-index:\s*100[^}]*backdrop-filter:\s*none/s);assert.match(css,/\.supportDesk\s*\{[^}]*overflow:\s*visible/s);
});
test('named CTA button and text hover geometry has no transforms',()=>{
 const css=read('app/globals.css');for(const name of ['lpCtaNav','lpCtaHero','lpCtaClosing','lpCtaGhost','ndStart','libStart']) {const rules=[...css.matchAll(new RegExp('\\.'+name+':hover[^}]*\\}', 'g'))];assert.ok(rules.length>0,name);for(const [rule] of rules) assert.doesNotMatch(rule,/transform:\s*(?:scale|translate)/,name);}
});
test('report and provisioned MFA issuer use the product brand, preserving company identity',()=>{
 assert.doesNotMatch(read('lib/report/ReportDocument.tsx'),/(?:author|creator|producer)="DebateAI"/);assert.match(read('../../packages/register/src/mfa-policy.ts'),/"issuer": "Dialectical Engine"/);
});
