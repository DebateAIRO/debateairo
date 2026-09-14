import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("FIX-09 chain grants", () => {
  it("proves exact roles, routine ownership, fixed search paths, bounded returns, ACLs, and denials", async () => {
    const owner=await database.pool.query(`SELECT rolname,rolcanlogin,rolinherit,rolsuper,
      rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_catalog.pg_roles
      WHERE rolname='debateai_obs_chain_probe_owner'`);
    expect(owner.rows).toEqual([{
      rolname:"debateai_obs_chain_probe_owner",rolcanlogin:false,rolinherit:false,rolsuper:false,
      rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,
    }]);
    const routines=await database.pool.query(`SELECT procedure.proname,
      pg_catalog.pg_get_userbyid(procedure.proowner) AS owner,procedure.prosecdef,
      procedure.provolatile,procedure.proparallel,procedure.proconfig
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname='obs' AND procedure.proname LIKE 'audit_chain_%'
      ORDER BY procedure.proname`);
    expect(routines.rows.map((row)=>row.proname)).toEqual([
      "audit_chain_action_head","audit_chain_enforce_mode","audit_chain_epoch_microseconds",
      "audit_chain_occurrence_head","audit_chain_probe_action","audit_chain_probe_occurrence",
      "audit_chain_tag_jsonb_v1",
    ]);
    for(const row of routines.rows){
      if(row.proname!=="audit_chain_enforce_mode") expect(row.owner).toBe("debateai_obs_chain_probe_owner");
      expect(row.proconfig).toEqual(["search_path=pg_catalog"]);
    }
    expect(routines.rows.filter((row)=>row.proname.startsWith("audit_chain_probe_"))
      .every((row)=>row.prosecdef===true)).toBe(true);
    const publicExecute=await database.pool.query(`SELECT procedure.proname
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(procedure.proacl,
        pg_catalog.acldefault('f',procedure.proowner))) AS acl
      WHERE namespace.nspname='obs' AND procedure.proname LIKE 'audit_chain_%'
        AND acl.grantee=0 AND acl.privilege_type='EXECUTE'`);
    expect(publicExecute.rows).toEqual([]);
    const runtimeExecute=await database.pool.query(`SELECT pg_catalog.pg_get_userbyid(acl.grantee) AS grantee,
      procedure.proname FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) AS acl
      WHERE namespace.nspname='obs' AND procedure.proname LIKE 'audit_chain_%'
        AND acl.privilege_type='EXECUTE' AND acl.grantee<>procedure.proowner
      ORDER BY grantee,procedure.proname`);
    expect(runtimeExecute.rows).toEqual([
      {grantee:"debateai_obs_listener",proname:"audit_chain_action_head"},
      {grantee:"debateai_obs_listener",proname:"audit_chain_probe_action"},
      {grantee:"debateai_obs_watchdog",proname:"audit_chain_epoch_microseconds"},
      {grantee:"debateai_obs_writer",proname:"audit_chain_occurrence_head"},
      {grantee:"debateai_obs_writer",proname:"audit_chain_probe_occurrence"},
    ]);
    const activation=await database.pool.query(`SELECT grantee,privilege_type
      FROM information_schema.role_table_grants WHERE table_schema='obs'
        AND table_name='audit_chain_activation' AND grantee<>current_user
      ORDER BY grantee,privilege_type`);
    expect(activation.rows).toEqual([
      {grantee:"debateai_obs_human",privilege_type:"SELECT"},
      {grantee:"debateai_obs_listener",privilege_type:"SELECT"},
      {grantee:"debateai_obs_watchdog",privilege_type:"SELECT"},
      {grantee:"debateai_obs_writer",privilege_type:"SELECT"},
    ]);
  });
});
