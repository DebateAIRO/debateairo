import { Pool } from "pg";
import { migrate } from "../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/packages/db/src/index.ts";
import { startTestDatabase } from "../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/tests/support/testDatabase.ts";

const database=await startTestDatabase();
const role="guide_security_support_probe";
const password="guide-security-fixture-only";
let runtime:Pool|undefined;
try {
  await migrate(database.pool);
  await database.pool.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
  await database.pool.query(`GRANT debateai_support TO ${role}`);
  const url=new URL(database.connectionString);
  url.username=role; url.password=password;
  runtime=new Pool({connectionString:url.toString(),max:1});
  const identity=(await runtime.query(`SELECT session_user,current_user,
    rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
    pg_has_role(current_user,'debateai_support','MEMBER') AS support_member
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
  const supportSelect=await runtime.query("SELECT count(*)::int AS count FROM support.session");
  const denied=[] as Array<{relation:string;code:string|null}>;
  for (const relation of [
    'identity."user"','core.run','serve.answer','register.register_row','obs.occurrence'
  ]) {
    try {
      await runtime.query(`SELECT * FROM ${relation} LIMIT 0`);
      denied.push({relation,code:null});
    } catch (error) {
      denied.push({relation,code:typeof error==='object' && error!==null && 'code' in error
        ? String((error as any).code) : 'UNKNOWN'});
    }
  }
  const result={revision:"c34c64d4e643e404cefe96dfaf167536ae364a94",
    fixture:"isolated embedded PostgreSQL; synthetic empty database; real LOGIN role",
    identity,supportSessionRows:supportSelect.rows[0]?.count,denied,
    pass:identity.session_user===role && identity.current_user===role
      && identity.rolsuper===false && identity.support_member===true
      && denied.every((item)=>item.code==='42501')};
  console.log(JSON.stringify(result,null,2));
  if (!result.pass) process.exitCode=1;
} finally {
  await runtime?.end().catch(()=>undefined);
  await database.pool.query(`DROP ROLE IF EXISTS ${role}`).catch(()=>undefined);
  await database.stop();
}
