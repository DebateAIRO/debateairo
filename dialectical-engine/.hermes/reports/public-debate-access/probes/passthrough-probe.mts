import { PublicDebateSchema } from "../../../../packages/contract/src/index.ts";
const node: any = {
  node_id:"n1", claim:"c", way_of_knowing:"REASONING",
  base_score:{ value:0.5, kind:"k", source:"REDACTED_OWNER_ONLY", producer:"pr", provenance_ref:"REDACTED_OWNER_ONLY", replay_handle:"REDACTED_OWNER_ONLY" },
  final_strength:null, provenance_ref:"REDACTED_OWNER_ONLY", maker_lineage:null, review:null, locator:null,
  stranger_restatement:{ check_status:"PASS", SMUGGLED_OWNER_SECRET:"ledger:abc-123" },
  defeater_refs:[], defeater_exhaustion_marked:false, disagreement:null, condition_marks:[],
  abstention:null, staleness_state:"FRESH", relevant_as_of:new Date(0).toISOString()
};
const doc: any = { public_ref:"11111111-1111-4111-8111-111111111111", author_pseudonym:"p", question:"q",
  published_at:new Date(0).toISOString(),
  answer:{ terminal:"SERVED", verdict:"SUPPORTED", verdict_available:true, confidence_band:"high",
    summary_segments:[{text:"s"}], badges:[], residual_objections:[], reversal_point:"r",
    as_of:new Date(0).toISOString(), nodes:[node], tree_included:true } };
const r = PublicDebateSchema.safeParse(doc);
console.log("parse_success:", r.success);
if (r.success) {
  const sr: any = (r.data as any).answer.nodes[0].stranger_restatement;
  console.log("keys_that_survived:", JSON.stringify(Object.keys(sr)));
  console.log("SMUGGLED_VALUE:", sr.SMUGGLED_OWNER_SECRET ?? "(absent)");
  console.log("VERDICT_SIGNAL:", sr.SMUGGLED_OWNER_SECRET ? "PASSTHROUGH_LEAKS_UNKNOWN_KEYS" : "STRIPPED_SAFE");
} else {
  console.log("rejected:", JSON.stringify(r.error.issues[0]));
  console.log("VERDICT_SIGNAL: SCHEMA_REJECTS_UNKNOWN_KEYS");
}
