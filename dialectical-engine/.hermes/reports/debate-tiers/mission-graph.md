```mermaid
flowchart LR
  t_11abead2["(V) S01 — Choose Free or Premium above the question on /new; Free lock"]:::ready
  t_e4b4ab3a["(V) S02 — The tier picks the fleet: a Free run debates with GPT 5.6 Lu"]:::ready
  t_cb9482de["(claude-opus-5) REQ — mission compass + SPEC S01/S02 (frozen) + scaffo"]:::done
  t_e95f08a5["(claude-opus-5) REQ-REV — blind review of the REQ packet + compass + S"]:::done
  t_a4a6ea69["(claude-opus-5) REQ-FIX — rework pass 2 of 3 after REQ-REV p1: close B"]:::done
  t_485d6613["(claude-opus-5) REQ-REV — pass 2 of 3, scoped: the B1–B4 closures + fo"]:::done
  t_103dce54(["(finding) REQ-REV-p1 B1 — S02 R6: the roster refusal has no ordering; "]):::done
  t_c0d928e3(["(finding) REQ-REV-p1 B2 — S01 R13's createDebate guard breaks tests/un"]):::done
  t_bf631f0b(["(finding) REQ-REV-p1 B3 — S01 R7 pins the Free risk-tier VALUE but not"]):::done
  t_90015321(["(finding) REQ-REV-p1 B4 — S02 R12/R13 + acceptance step 9 order a BUIL"]):::done
  t_d316d314(["(finding) REQ-REV-p1 N1 — V-DECISIONS-PACKET.md rows V-11/V-12 truncat"]):::done
  t_6f812bf4(["(finding) REQ-REV-p1 N2 — INSTRUCTIONS.md:65-66 names one of the three"]):::done
  t_a5b40dbc(["(finding) REQ-REV-p1 N3 — three R19 suites have no recorded baseline: "]):::ready
  t_30b2f287(["(finding) REQ-REV-p1 N4 — S02 R5 misstates assertMakerAdmission (throw"]):::done
  t_25ca3234(["(finding) REQ-REV-p1 N5 — packet defect (orchestrator): packets/REQ.md"]):::done
  t_83843b64(["(finding) REQ-REV-p1 N6 — packet defect (orchestrator): COMMON.md:41 l"]):::done
  t_55b979c7(["(finding) REQ-REV-p1 N7 — the / composer is a route FALLBACK from a fa"]):::done
  t_90bfab57(["(finding) REQ-REV-p1 N8 — S01/PLAN.md:31 says 'the thirteen controls';"]):::done
  t_ca7e0ec5(["(finding) REQ-FIX-p2 (a) — tests/unit/t9-mode-tokens.test.ts is named "]):::done
  t_be1a11d7(["(finding) REQ-FIX-p2 (b) — V-DECISIONS-PACKET.md V-12 cites BASELINE.m"]):::done
  t_43263b80(["(finding) REQ-FIX-p2 (c) — tests/render/prov01-honesty-drawer.test.tsx"]):::done
  t_37a8e5c8(["(finding) REQ-FIX-p2 packet defect (orchestrator) — REQ-FIX-p2.md §1/c"]):::done
  t_dfd8f52d["(claude-opus-5) ARCH S01 — PLAN.md for the selector + Free locks slice"]:::done
  t_57d602a5["(claude-opus-5) ARCH S02 — PLAN.md for the tier-picks-the-fleet slice "]:::done
  t_0e278df0["(claude-opus-5) ARCH-REV S01 — blind review of PLAN.md + the ARCH pack"]:::done
  t_08c8abe2["(claude-opus-5) ARCH-REV S02 — blind review of PLAN.md + the ARCH pack"]:::done
  t_c1cf2c21(["(finding) REQ-REV-p2 N1 — five binding sentences still say the 21:40 b"]):::done
  t_4a7ccb0c(["(finding) REQ-REV-p2 N2 — six suites the requirements will turn RED ha"]):::done
  t_9e274b2d(["(finding) REQ-REV-p2 N3 — S01/SPEC-v2 R20-B count sentence is off by o"]):::done
  t_98313d55(["(finding) REQ-REV-p2 N4 — S01/DONE.md:9 and :29 still point at SPEC.md"]):::done
  t_fb6b20c7(["(finding) REQ-REV-p2 P1 packet defect (orchestrator) — REQ-REV-p2 char"]):::done
  t_2db5d7c1(["(finding) REQ-REV-p2 P2 packet defect (orchestrator) — the reviewer's "]):::done
  t_c6648f8a(["(finding) REQ-REV-p2 P3 packet defect (orchestrator) — three different"]):::done
  t_8eb3dcff(["(finding) ARCH-S02 F-1 — SPEC R5's maker-span check is unbuildable fro"]):::ready
  t_6fdb7da9(["(finding) ARCH-S02 F-2 — the orchestrator's N2 fold parenthetical woul"]):::done
  t_a5b998ff(["(finding) ARCH-S02 F-3 — the N2 fold under-counts by one: api.test.ts:"]):::done
  t_1b4420f7(["(finding) ARCH-S02 F-4 — tests/integration/register-version-boundaries"]):::done
  t_457e2e85(["(finding) ARCH-S02 F-5 packet defect (orchestrator) — ARCH-S02 charge "]):::done
  t_4fdfce80(["(finding) ARCH-S02 P-A packet defect (orchestrator) — ARCH-S02 charge "]):::done
  t_ac7da71c(["(finding) ARCH-S02 P-B packet defect (orchestrator) — both ARCH packet"]):::done
  t_38f2276c(["(finding) ARCH-S01 F1 — tests/render/ux01-new-debate-form.test.tsx:57-"]):::ready
  t_cc5fa2a7(["(finding) ARCH-S01 F2 — tests/unit/v2ui-pages.test.ts:83 slices an EMP"]):::ready
  t_1b8a5ad8(["(finding) ARCH-S01 F3 — tests/unit/consent-s02-style-contract.test.ts:"]):::ready
  t_db48537d(["(finding) ARCH-S01 F4 — SPEC R19 and BASELINE.md index by 'suites a re"]):::done
  t_68ce7adc(["(finding) ARCH-S01 F5 packet defect (orchestrator) — ARCH-S01 charge 5"]):::done
  t_e1d8ca6d(["(finding) ARCH-S01 F6 packet defect (orchestrator) — packet §1 says 't"]):::done
  t_06c7dc57(["(finding) ARCH-S01 F7 packet/COMMON gap — nothing states whether an AR"]):::done
  t_fcd13dd8(["(finding) ARCH-S01 F8 (seat's own, caught) — vitest prints 'Tests 2 fa"]):::done
  t_ffb56aba["(claude-opus-5) ARCH-FIX S02 — rework pass 2 of 3 after ARCH-REV p1: T"]:::done
  t_1dc7049a["(claude-opus-5) ARCH-REV S02 — pass 2 of 3, scoped: the B1 closure + t"]:::done
  t_7a207605(["(finding) ARCH-REV-S02-p1 B1 — the step order writes code before tests"]):::done
  t_109ac1ed(["(finding) ARCH-REV-S02-p1 N1 — S02-C2-S11, S02-C3-S5, S02-C3-S6 sit ou"]):::done
  t_6390ae3b(["(finding) ARCH-REV-S02-p1 N2 — R15's forward trace row attributes RED "]):::done
  t_aa90e1c7(["(finding) ARCH-REV-S02-p1 N3 — .hermes/TOOLING-TRAPS.md:1041 is cited "]):::done
  t_591dd950(["(finding) ARCH-REV-S02-p1 N4 — eight citation drifts in PLAN.md, each "]):::done
  t_532fa71f(["(finding) ARCH-REV-S02-p1 N5 — the orchestrator's ADR renumber (0023→0"]):::done
  t_b911aa65(["(finding) ARCH-REV-S02-p1 N6 — cluster S02-C3 has no RED frame and the"]):::done
  t_44813002(["(finding) ARCH-REV-S02-p1 N7 — the filter's shape (roster.flatMap over"]):::done
  t_563ba267(["(finding) ARCH-REV-S02-p1 N8 — the plan says it does not guess S01's e"]):::done
  t_5ea9b6b7(["(finding) ARCH-REV-S02-p1 N9 — SPEC R10 says the /new error surface is"]):::done
  t_fe0efe7b(["(finding) ARCH-REV-S02-p1 N10 — F-4 is a class (suites inside SPEC R13"]):::done
  t_97d3cd5c(["(finding) ARCH-REV-S02-p1 N11 — PLAN.md §5's header claims every comma"]):::done
  t_54027d98["(claude-opus-5) MOCK S01 — the Free/Premium selector on /new as a Clau"]:::done
  t_484dffaa(["(finding) ARCH-REV-S01-p1 N1 — the Free lock leaves TWO false claims o"]):::done
  t_3fbece20(["(finding) ARCH-REV-S01-p1 N2 — SPEC R17's 'no colour literal outside t"]):::ready
  t_d20b1ffd(["(finding) ARCH-REV-S01-p1 N3 — step S01-42 has no done-criterion, and "]):::ready
  t_60e806a8(["(finding) ARCH-REV-S01-p1 N4 — S01-24's done-criterion is false at bas"]):::ready
  t_750a12c2(["(finding) ARCH-REV-S01-p1 N5 — PLAN §8 credits C2 with a detection it "]):::done
  t_8afd38d0(["(finding) ARCH-REV-S01-p1 N6 — two of the six screens under-specify th"]):::ready
  t_23cd2a0e(["(finding) ARCH-REV-S01-p1 N7 — 'Eight are RED at base' is seven (the s"]):::done
  t_b5bc6288(["(finding) ARCH-REV-S01-p1 N8 — the R21 delta command writes a shared g"]):::ready
  t_0cac29d7(["(finding) ARCH-REV-S01-p1 N9 — 'globals.css styles :disabled for exact"]):::ready
  t_251cd802(["(finding) ARCH-REV-S01-p1 P1 packet defect (orchestrator) — ARCH-REV-S"]):::done
  t_c3eeee2b(["(finding) ARCH-REV-S01-p1 P2 packet defect (orchestrator) — the inputs"]):::done
  t_64f2363d(["(finding) ARCH-REV-S01-p1 P3 packet defect (orchestrator) — the exhaus"]):::done
  t_f05c54bd["(V) DONE S01 — V defines done on the canvas: https://claude.ai/code/ar"]:::done
  t_e82bc6b0["(V) DONE S01 — define done on the canvas (https://claude.ai/code/artif"]:::done
  t_95c4c2ee(["(finding) MOCK-S01 F1 (product) — .ndSelect draws the box while the na"]):::ready
  t_4b5c0d2f(["(finding) MOCK-S01 F2 packet defect (orchestrator) — MOCK-S01.md:24 na"]):::done
  t_dc5c78a7(["(finding) MOCK-S01 F3 (repo) — tests/render/stubs/next-navigation.ts l"]):::ready
  t_68d0730a(["(finding) MOCK-S01 F4 packet defect (orchestrator) — charge 3 enumerat"]):::done
  t_337549e2(["(finding) MOCK-S01 F5 packet defect (orchestrator, minor) — charge 3's"]):::done
  t_fc4f384d(["(finding) ARCH-FIX-S02 F-6 — the published R13 ask-literal grep answer"]):::done
  t_853d7670(["(finding) ARCH-FIX-S02 F-7 — C2/C3/C4's absolute green targets (53, 41"]):::ready
  t_36b90c6f(["(finding) ARCH-FIX-S02 seat's own defect, corrected on the record — th"]):::done
  t_422678f3["(gpt-5.6-sol) BUILD S02-C1 — the run records its tier (store side): mi"]:::done
  t_7273eea5["(gpt-5.6-sol) BUILD S02-C3 — roster read discipline (architecture guar"]:::blocked
  t_1675b61f["(gpt-5.6-sol) BUILD S02-C2 — the filter and the typed refusal (evaluat"]:::blocked
  t_05227ae2["(gpt-5.6-sol) BUILD S02-C4 — the wire: the ask's tier reaches the run "]:::todo
  t_e407c049(["(finding) ARCH-REV-S02-p2 N1 — S02-V1's published total is off by two:"]):::ready
  t_2c90d113(["(finding) ARCH-REV-S02-p2 N2 — the receipt that certifies F-6's blesse"]):::done
  t_79bc55d3(["(finding) ARCH-REV-S02-p2 N3 — grep is two binaries on this Mac: inlin"]):::done
  t_b901849e(["(finding) ARCH-REV-S02-p2 N4 — R15's frame numbering contradicts itsel"]):::ready
  t_6c204de6(["(finding) ARCH-REV-S02-p2 N5 — INHERITED, recorded not charged: SPEC-v"]):::ready
  t_216c7104(["(finding) ARCH-REV-S02-p2 N6 packet defect (orchestrator) — ARCH-REV-S"]):::done
  t_cfd428dd(["(finding) ARCH-REV-S02-p2 N7 packet defect (orchestrator) — the freeze"]):::done
  t_8920309f(["(finding) ARCH-REV-S02-p2 N8 packet defect (orchestrator) — the ARCH-F"]):::done
  t_a682a931["(gpt-5.6-sol) BUILD S01-C1 — the contract: plan_tier on the ask, the t"]:::done
  t_085d4fa4["(gpt-5.6-sol) BUILD S01-C2 — the ask wire: the builder's tier + proven"]:::done
  t_d1dc1913["(gpt-5.6-sol) BUILD S01-C3 — the page: the selector, the fourteen lock"]:::done
  t_cd5642d0["(gpt-5.6-sol) BUILD S01-C4 — the stylesheet: the selector's rules + th"]:::done
  t_6e2413b7["(gpt-5.6-sol) BUILD S01-C5 — the DONE.md measurements: one assertion p"]:::done
  t_a02cca8b(["(finding) BUILD-S02-C1 F1 (plan) — PLAN.md:267 case 2's UPDATE probe: "]):::done
  t_1a083e6e(["(finding) BUILD-S02-C1 F2 (packet, orchestrator) — verbatim-frame char"]):::done
  t_2e1b3dc2(["(finding) BUILD-S02-C1 F3 (plan) — S02-C1-S4 (PLAN.md:318-321, the Dri"]):::done
  t_b97424de(["(finding) BUILD-S02-C1 F4 (packet, orchestrator) — the 'byte-for-byte'"]):::done
  t_68b151cb(["(finding) BUILD-S02-C1 F5 (tooling) — embedded-Postgres logs dominated"]):::done
  t_678be355(["(finding) BUILD-S02-C1 F6 (packet defect, orchestrator) — reading orde"]):::done
  t_fc968fd5(["(finding) BUILD-S01-C1 F1 (plan) — S01-3's done-criterion needs S01-4'"]):::done
  t_571b25a8(["(finding) BUILD-S01-C1 F2 (plan) — S01-6's response body { error: MALF"]):::done
  t_0ae63967(["(finding) BUILD-S01-C1 F3 (plan) — S01-8's oracle 'grep -rc steering_a"]):::done
  t_1e4fccc1(["(finding) BUILD-S01-C1 F4 (repo, class) — unsafe source-region helpers"]):::ready
  t_26f22a53(["(finding) BUILD-S01-C1 F5 (packet defect, orchestrator) — the packet's"]):::done
  t_3efba3fd(["(finding) BUILD-S01-C2 F1 (plan runner) — run_suites (PLAN.md:518-527)"]):::done
  t_6d125d74(["(finding) BUILD-S01-C2 F2 (packet defect, orchestrator, second occurre"]):::done
  t_7d8dc081(["(finding) BUILD-S01-C2 F3 (protocol) — the TOOLING-TRAPS 'index' comma"]):::done
  t_64ee3061(["(finding) BUILD-S01-C2 F4 (packet, orchestrator) — the compiler gate i"]):::done
  t_35326f29(["(finding) BUILD-S01-C3/C4 dispatch (packet defect, orchestrator) — lin"]):::done
  t_78419e48(["(finding) BUILD-S01-C4 F1 (packet, orchestrator) — the R21 delta extra"]):::done
  t_8ec58290(["(finding) BUILD-S01-C4 F2 (packet defect, orchestrator) — BASELINE.md "]):::done
  t_5a25bccf(["(finding) BUILD-S01-C4 F3 (protocol) — the pointer prompt says 'post y"]):::done
  t_336f8159(["(finding) BUILD-S01-C3 F1 (packet defect, orchestrator) — BASELINE.md "]):::done
  t_9e50c4dd(["(finding) BUILD-S01-C3 F2 (packet defect, orchestrator) — charge 3 sai"]):::done
  t_05ce40c7(["(finding) BUILD-S01-C3 F3 (packet, orchestrator) — the packet demanded"]):::done
  t_53805be6(["(finding) BUILD-S01-C5 F1 (packet, orchestrator) — 'never a product ed"]):::done
  t_a043c943(["(finding) BUILD-S01-C5 F2 (packet defect, orchestrator) — 'the last co"]):::done
  t_844ba282(["(finding) BUILD-S01-C5 F3 (packet defect, orchestrator) — the self-rep"]):::done
  t_9bec090b(["(finding) BUILD-S01-C5 F4 (packet, orchestrator) — the runner's raw-lo"]):::done
  t_7be7acf3["(orchestrator) GATE S01 — assemble review-packages/S01-p1 (mechanical:"]:::done
  t_df524f91["(claude-opus-5) REV S01 p1 — lens correctness/tests (blind, own detach"]:::done
  t_660e86e5["(claude-opus-5) REV S01 p1 — lens security/data-safety (blind, own det"]:::done
  t_8ea6c036["(claude-opus-5) REV S01 p1 — lens product-truth (blind, own detached w"]:::done
  t_6365fd82(["(finding) REV-S01-p1 correctness N1 — tests/unit/tier01-style-contract"]):::done
  t_318c1522(["(finding) REV-S01-p1 correctness N2 — tests/render/tier01-new-plan-tie"]):::ready
  t_1c27e245(["(finding) REV-S01-p1 correctness N3 — apps/ui/app/new/page.tsx:65-70 +"]):::done
  t_3c762b9f(["(finding) REV-S01-p1 correctness N4 — tests/unit/tier01-style-contract"]):::done
  t_75aa04a6(["(finding) REV-S01-p1 correctness N5 (packet) — packets/REV-S01-p1-corr"]):::done
  t_89f72ff6(["(finding) REV-S01-p1 correctness N6 (packet) — packets/REV-S01-p1-corr"]):::done
  t_f6b570a3(["(finding) REV-S01-p1 correctness R1 (package) — dev-stack.md gave thre"]):::done
  t_9a1c95b4(["(finding) REV-S01-p1 security N1 — the Free gauge set is enforced only"]):::ready
  t_b79ef27e(["(finding) REV-S01-p1 security N2 — apps/ui/app/new/defaults.tsx:74: a "]):::ready
  t_2eded532(["(finding) REV-S01-p1 security N3 — apps/ui/app/new/page.tsx:207 the ti"]):::ready
  t_0d2518e7(["(finding) REV-S01-p1 security P1 (packet) — the three REV-S01-p1 packe"]):::done
  t_b9bd6417(["(finding) REV-S01-p1 security P2 (packet) — COMMON §4 orders V-ROW blo"]):::done
  t_4786b961(["(finding) REV-S01-p1 security P3 (package) — dev-stack.md's no-touch l"]):::done
  t_77100e37(["(finding) REV-S01-p1 security T4 (pre-existing, out of S01's diff) — P"]):::ready
  t_1bf44393(["(finding) REV-S01-p1 product-truth B1 (BLOCKING) — apps/ui/app/new/pag"]):::done
  t_8f4927d4(["(finding) REV-S01-p1 product-truth N1 — globals.css .ndTierModel (S01 "]):::done
  t_15c43eda(["(finding) REV-S01-p1 product-truth N2 — page.tsx:44 the Premium promis"]):::ready
  t_7f4df45a(["(finding) REV-S01-p1 product-truth N3 — page.tsx:449/:451 the lock exp"]):::ready
  t_48de05b6(["(finding) REV-S01-p1 product-truth N4 (packet) — COMMON.md:25 orders V"]):::done
  t_dcf9531e(["(finding) REV-S01-p1 orchestrator D1 — slices/S01/DONE.md M7 omitted t"]):::done
  t_db4c7267["(gpt-5.6-sol) FIX S01 p1 — F1 page surface: product B1 (max-tokens val"]:::done
  t_95c01e3d["(gpt-5.6-sol) FIX S01 p1 — F2 stylesheet surface: product N1 (.ndTierM"]:::done
  t_f8494fff["(claude-opus-5) REV S01 p2 — lens correctness/tests (scoped: the pass-"]:::done
  t_4fcba563["(claude-opus-5) REV S01 p2 — lens product-truth (scoped: B1/N1/N3 in t"]:::done
  t_2e66b415(["(finding) FIX-S01-p1-F2 P1 (packet) — the only-lines law named the fin"]):::done
  t_e74b5bf1(["(finding) FIX-S01-p1-F2 S1 (orchestrator, version skew) — the lane car"]):::done
  t_a7cb6dad(["(finding) FIX-S01-p1-F1 P1 (packet) — FIX.md §2 asks the reviewer's pr"]):::done
  t_0b2afbff(["(finding) FIX-S01-p1-F1 P2 (packet, class) — the union split FIX nodes"]):::done
  t_83865b1b(["(finding) FIX-S01-p1-F1 P3 (packet) — the pair-restatement line (becom"]):::done
  t_cd86bced(["(finding) REV-S01-p2 correctness B1 (BLOCKING) — tests/unit/tier01-sty"]):::done
  t_16b00d0e(["(finding) REV-S01-p2 correctness N1 — tests/render/tier01-new-plan-tie"]):::done
  t_6312c7ca(["(finding) REV-S01-p2 correctness N2 — tier01-new-plan-tier.test.tsx:39"]):::done
  t_759ceb20(["(finding) REV-S01-p2 correctness N3 — tier01-new-plan-tier.test.tsx:21"]):::done
  t_2288b5e7(["(finding) REV-S01-p2 correctness N4 — tier01-style-contract.test.ts:12"]):::ready
  t_87a3aa3a(["(finding) REV-S01-p2 correctness N5 (orchestrator) — promoted pass-1 p"]):::done
  t_468fd7a4(["(finding) REV-S01-p2 correctness N6 (orchestrator) — the F20_S1 remedy"]):::done
  t_4ea89dd7(["(finding) REV-S01-p2 correctness PD1 (packet) — REV.md:10 describes ev"]):::done
  t_3ecd27f8(["(finding) REV-S01-p2 correctness PD2 (packet) — REV.md:17 demands the "]):::done
  t_dc7510a2(["(finding) REV-S01-p2 correctness PD3 (packet) — packet:9 (cwd = the le"]):::done
  t_07ba5757(["(finding) REV-S01-p2 product-truth B1 (BLOCKING) — the Free lock is no"]):::done
  t_5675766d(["(finding) REV-S01-p2 product-truth N1 (pre-existing) — globals.css:616"]):::done
  t_b82271c7(["(finding) REV-S01-p2 product-truth N2 — only 2 of the 10 hints (riskTi"]):::ready
  t_e352a782(["(finding) REV-S01-p2 product-truth N3 — under Free the keyboard path t"]):::done
  t_62644380["(gpt-5.6-sol) FIX S01 p2 — ONE node: converge the Free lock on the rat"]:::done
  t_479e4751["(claude-opus-5) REV S01 p3 — lens correctness/tests (the LAST pass; sc"]:::done
  t_19085d3f["(claude-opus-5) REV S01 p3 — lens product-truth (the LAST pass; scoped"]:::done
  t_9b998d4e(["(finding) FIX-S01-p2 P1 (pointer) — the launcher pointer said your wri"]):::done
  t_552cb0b3(["(finding) FIX-S01-p2 P4 (packet, cost) — read in FULL every file in al"]):::done
  t_94f82f12(["(finding) REV-S01-p3 correctness B1 (BLOCKING, at the cap → V row) — F"]):::ready
  t_0d714096(["(finding) REV-S01-p3 correctness N1 — tests/render/tier01-new-plan-tie"]):::ready
  t_108a9322(["(finding) REV-S01-p3 correctness N2 (orchestrator) — probes/REV-S01-p2"]):::done
  t_e976fd9b(["(finding) REV-S01-p3 correctness N3 (orchestrator) — a REV lens has no"]):::done
  t_b152303d(["(finding) REV-S01-p3 correctness PD1 (package) — review-packages/S01-p"]):::done
  t_e268a842(["(finding) REV-S01-p3 correctness PD2 (orchestrator) — the .codex mirro"]):::done
  t_9740cdb4(["(finding) REV-S01-p3 product-truth B1 (BLOCKING, at the cap → row V-21"]):::ready
  t_1d72bc63(["(finding) REV-S01-p3 product-truth N1 (orchestrator, probe hygiene) — "]):::done
  t_ec9ca195(["(finding) REV-S01-p3 product-truth N2 (pre-existing, NOT S01's — conse"]):::ready
  t_5859ed3f(["(finding) REV-S01-p3 product-truth N3 (orchestrator, package) — review"]):::done
  t_978dfce7(["(finding) REV-S01-p3 product-truth P1 (the seat, self-reported) — used"]):::done
  t_960275af(["(finding) TEST(S01) gate (orchestrator, V-reported) — the gate message"]):::todo
  t_cb9482de --> t_e95f08a5
  t_e95f08a5 --> t_a4a6ea69
  t_a4a6ea69 --> t_485d6613
  t_485d6613 --> t_dfd8f52d
  t_485d6613 --> t_57d602a5
  t_dfd8f52d --> t_0e278df0
  t_57d602a5 --> t_08c8abe2
  t_08c8abe2 --> t_ffb56aba
  t_ffb56aba --> t_1dc7049a
  t_0e278df0 --> t_54027d98
  t_54027d98 --> t_e82bc6b0
  t_1dc7049a --> t_422678f3
  t_1dc7049a --> t_7273eea5
  t_1dc7049a --> t_1675b61f
  t_422678f3 --> t_05227ae2
  t_1675b61f --> t_05227ae2
  t_e82bc6b0 --> t_a682a931
  t_a682a931 --> t_085d4fa4
  t_085d4fa4 --> t_d1dc1913
  t_085d4fa4 --> t_cd5642d0
  t_d1dc1913 --> t_6e2413b7
  t_cd5642d0 --> t_6e2413b7
  t_6e2413b7 --> t_7be7acf3
  t_7be7acf3 --> t_df524f91
  t_7be7acf3 --> t_660e86e5
  t_7be7acf3 --> t_8ea6c036
  t_df524f91 --> t_6365fd82
  t_df524f91 --> t_318c1522
  t_df524f91 --> t_1c27e245
  t_df524f91 --> t_3c762b9f
  t_df524f91 --> t_75aa04a6
  t_df524f91 --> t_89f72ff6
  t_df524f91 --> t_f6b570a3
  t_660e86e5 --> t_9a1c95b4
  t_660e86e5 --> t_b79ef27e
  t_660e86e5 --> t_2eded532
  t_660e86e5 --> t_0d2518e7
  t_660e86e5 --> t_b9bd6417
  t_660e86e5 --> t_4786b961
  t_660e86e5 --> t_77100e37
  t_8ea6c036 --> t_1bf44393
  t_8ea6c036 --> t_8f4927d4
  t_8ea6c036 --> t_15c43eda
  t_8ea6c036 --> t_7f4df45a
  t_8ea6c036 --> t_48de05b6
  t_8ea6c036 --> t_dcf9531e
  t_8ea6c036 --> t_db4c7267
  t_8ea6c036 --> t_95c01e3d
  t_db4c7267 --> t_f8494fff
  t_95c01e3d --> t_f8494fff
  t_db4c7267 --> t_4fcba563
  t_95c01e3d --> t_4fcba563
  t_95c01e3d --> t_2e66b415
  t_95c01e3d --> t_e74b5bf1
  t_db4c7267 --> t_a7cb6dad
  t_db4c7267 --> t_0b2afbff
  t_db4c7267 --> t_83865b1b
  t_f8494fff --> t_cd86bced
  t_f8494fff --> t_16b00d0e
  t_f8494fff --> t_6312c7ca
  t_f8494fff --> t_759ceb20
  t_f8494fff --> t_2288b5e7
  t_f8494fff --> t_87a3aa3a
  t_f8494fff --> t_468fd7a4
  t_f8494fff --> t_4ea89dd7
  t_f8494fff --> t_3ecd27f8
  t_f8494fff --> t_dc7510a2
  t_4fcba563 --> t_07ba5757
  t_4fcba563 --> t_5675766d
  t_4fcba563 --> t_b82271c7
  t_4fcba563 --> t_e352a782
  t_f8494fff --> t_62644380
  t_4fcba563 --> t_62644380
  t_62644380 --> t_479e4751
  t_62644380 --> t_19085d3f
  t_62644380 --> t_9b998d4e
  t_62644380 --> t_552cb0b3
  t_479e4751 --> t_94f82f12
  t_479e4751 --> t_0d714096
  t_479e4751 --> t_108a9322
  t_479e4751 --> t_e976fd9b
  t_479e4751 --> t_b152303d
  t_479e4751 --> t_e268a842
  t_19085d3f --> t_9740cdb4
  t_19085d3f --> t_1d72bc63
  t_19085d3f --> t_ec9ca195
  t_19085d3f --> t_5859ed3f
  t_19085d3f --> t_978dfce7
  t_11abead2 --> t_960275af
  t_e95f08a5 --> t_103dce54
  t_e95f08a5 --> t_c0d928e3
  t_e95f08a5 --> t_bf631f0b
  t_e95f08a5 --> t_90015321
  t_e95f08a5 --> t_d316d314
  t_e95f08a5 --> t_6f812bf4
  t_e95f08a5 --> t_a5b40dbc
  t_e95f08a5 --> t_30b2f287
  t_e95f08a5 --> t_25ca3234
  t_e95f08a5 --> t_83843b64
  t_e95f08a5 --> t_55b979c7
  t_e95f08a5 --> t_90bfab57
  t_a4a6ea69 --> t_ca7e0ec5
  t_a4a6ea69 --> t_be1a11d7
  t_a4a6ea69 --> t_43263b80
  t_a4a6ea69 --> t_37a8e5c8
  t_485d6613 --> t_c1cf2c21
  t_485d6613 --> t_4a7ccb0c
  t_485d6613 --> t_9e274b2d
  t_485d6613 --> t_98313d55
  t_485d6613 --> t_fb6b20c7
  t_485d6613 --> t_2db5d7c1
  t_485d6613 --> t_c6648f8a
  t_57d602a5 --> t_8eb3dcff
  t_57d602a5 --> t_6fdb7da9
  t_57d602a5 --> t_a5b998ff
  t_57d602a5 --> t_1b4420f7
  t_57d602a5 --> t_457e2e85
  t_57d602a5 --> t_4fdfce80
  t_57d602a5 --> t_ac7da71c
  t_dfd8f52d --> t_38f2276c
  t_dfd8f52d --> t_cc5fa2a7
  t_dfd8f52d --> t_1b8a5ad8
  t_dfd8f52d --> t_db48537d
  t_dfd8f52d --> t_68ce7adc
  t_dfd8f52d --> t_e1d8ca6d
  t_dfd8f52d --> t_06c7dc57
  t_dfd8f52d --> t_fcd13dd8
  t_08c8abe2 --> t_7a207605
  t_08c8abe2 --> t_109ac1ed
  t_08c8abe2 --> t_6390ae3b
  t_08c8abe2 --> t_aa90e1c7
  t_08c8abe2 --> t_591dd950
  t_08c8abe2 --> t_532fa71f
  t_08c8abe2 --> t_b911aa65
  t_08c8abe2 --> t_44813002
  t_08c8abe2 --> t_563ba267
  t_08c8abe2 --> t_5ea9b6b7
  t_08c8abe2 --> t_fe0efe7b
  t_08c8abe2 --> t_97d3cd5c
  t_0e278df0 --> t_484dffaa
  t_0e278df0 --> t_3fbece20
  t_0e278df0 --> t_d20b1ffd
  t_0e278df0 --> t_60e806a8
  t_0e278df0 --> t_750a12c2
  t_0e278df0 --> t_8afd38d0
  t_0e278df0 --> t_23cd2a0e
  t_0e278df0 --> t_b5bc6288
  t_0e278df0 --> t_0cac29d7
  t_0e278df0 --> t_251cd802
  t_0e278df0 --> t_c3eeee2b
  t_0e278df0 --> t_64f2363d
  t_54027d98 --> t_95c4c2ee
  t_54027d98 --> t_4b5c0d2f
  t_54027d98 --> t_dc5c78a7
  t_54027d98 --> t_68d0730a
  t_54027d98 --> t_337549e2
  t_ffb56aba --> t_fc4f384d
  t_ffb56aba --> t_853d7670
  t_ffb56aba --> t_36b90c6f
  t_1dc7049a --> t_e407c049
  t_1dc7049a --> t_2c90d113
  t_1dc7049a --> t_79bc55d3
  t_1dc7049a --> t_b901849e
  t_1dc7049a --> t_6c204de6
  t_1dc7049a --> t_216c7104
  t_1dc7049a --> t_cfd428dd
  t_1dc7049a --> t_8920309f
  t_422678f3 --> t_a02cca8b
  t_422678f3 --> t_1a083e6e
  t_422678f3 --> t_2e1b3dc2
  t_422678f3 --> t_b97424de
  t_422678f3 --> t_68b151cb
  t_422678f3 --> t_678be355
  t_a682a931 --> t_fc968fd5
  t_a682a931 --> t_571b25a8
  t_a682a931 --> t_0ae63967
  t_a682a931 --> t_1e4fccc1
  t_a682a931 --> t_26f22a53
  t_085d4fa4 --> t_3efba3fd
  t_085d4fa4 --> t_6d125d74
  t_085d4fa4 --> t_7d8dc081
  t_085d4fa4 --> t_64ee3061
  t_d1dc1913 --> t_35326f29
  t_cd5642d0 --> t_78419e48
  t_cd5642d0 --> t_8ec58290
  t_cd5642d0 --> t_5a25bccf
  t_d1dc1913 --> t_336f8159
  t_d1dc1913 --> t_9e50c4dd
  t_d1dc1913 --> t_05ce40c7
  t_6e2413b7 --> t_53805be6
  t_6e2413b7 --> t_a043c943
  t_6e2413b7 --> t_844ba282
  t_6e2413b7 --> t_9bec090b
  classDef done fill:#dfe9df,stroke:#3E7A4E
  classDef running fill:#f3ece0,stroke:#A8823E
  classDef ready fill:#fdfbf6,stroke:#6E675C
  classDef review fill:#e6e8e8,stroke:#3D5A80
  classDef blocked fill:#f4e5de,stroke:#B0432F
  classDef todo fill:#efe9e0,stroke:#6E675C
  classDef scheduled fill:#efe9e0,stroke:#6E675C
  classDef triage fill:#efe9e0,stroke:#6E675C
```

_rendered 2026-09-10 10:30 from board `debate-tiers` — 192 nodes, 193 edges_
