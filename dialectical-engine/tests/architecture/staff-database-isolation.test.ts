import { readFile } from "node:fs/promises";
import { describe,expect,it } from "vitest";
const path="docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json";
it("declares a closed independent recovery identity without runtime or private-content membership",async()=>{
 const manifest=JSON.parse(await readFile(path,"utf8"));
 const recovery=manifest.principals.find((p:{id:string})=>p.id==="staff-recovery");
 expect(recovery).toMatchObject({roleName:"debateai_prod_staff_recovery",directMemberships:["debateai_staff_recovery"],effectiveMemberships:["debateai_staff_recovery"]});
 expect(manifest.credentialRequirements.find((p:{principalId:string})=>p.principalId==="staff-recovery")).toMatchObject({lifecycle:"CLOSED_JIT_5_MINUTES"});
 expect(manifest.ownershipRoles.find((p:{roleName:string})=>p.roleName==="debateai_staff_security_owner")).toMatchObject({login:false,directMemberships:[]});
});
it('exports the adapter and denies direct secret columns in the staff migration',async()=>{
 const sql=await readFile('migrations/0085_staff_access_foundation.sql','utf8');
 expect(sql).toContain('identity.staff_rotation_binding_current');
 expect(sql).toContain('CREATE TABLE IF NOT EXISTS staff.password_totp_rotation_receipt');
 expect(sql).not.toContain('SELECT * INTO v_factor FROM identity.mfa_factor');
 expect(await readFile('packages/db/src/index.ts','utf8')).toContain('"./staff-access.js"');
 expect(await readFile('packages/db/src/sessions.ts','utf8')).toContain('readAccountSecurityHold');
});
