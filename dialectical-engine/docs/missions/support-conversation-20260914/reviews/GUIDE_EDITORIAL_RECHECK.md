# GUIDE_EDITORIAL_RECHECK — cumulative eight-record verdict

- **Ticket:** `t_c4cd1131`
- **Reviewer:** `/root/baseline`
- **Native reviewer session:** `01a09ef7-e096-7c31-9b35-806840028cf0`
- **Parent thread:** `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- **Reviewed on:** 2026-09-17
- **Product revision:** `af02290219c734d2ad2fe7df878356fec9043b15`
- **Verdict:** **PASS**
- **Owner ratification:** `ratifiedBy=""`, `ratifiedOn=""`

The four corrected records resolve the prior two editorial findings in both languages and in every changed shipped component. The four earlier PASS records are byte-identical to their reviewed hashes. The cumulative eight-record set is editorially ready for the separate manifest attestation step; this verdict does not itself admit the records or accept CP1.

## Cumulative exact dispositions

| Record | Article / body SHA-256 | Model projection SHA-256 | Fallback SHA-256 | Disposition |
|---|---|---|---|---|
| `app-navigation.en` | `a92e96c24c3df6d7a9b3e73a3fafde79321cd7445612588024ea205fb5c6e6db` / `1fe205870d5f6a9019e4bc15aae02c542d65c87b7246b12d40309adeb8d66db4` | `3f17d7323fcd88f34b6f9f1a4da904b0da28a18a09f6fa7f814e6333f4b83b29` | `4264551f61745540e92932ee99a99405152e94edf8b167e0ee19c5463526411d` | **PASS** — corrected body/projection; retained fallback. |
| `app-navigation.ro` | `a6f79cd55e0856780bff01ec3134df02a068b41453f44a8847c5c58050af8a23` / `cddc4e50a5898f611974837bba55d09d4b93c69a246e6133e7134088effe1f23` | `04001a0ddc6b3f743946fec81d2d3d5caed672f5f14d430eb3af74dc1421e3a3` | `e6a00272d90624b8367c54d60b8ecad42ee69ddf8155729b972eb8463a2d1cde` | **PASS** — corrected body/projection; retained fallback. |
| `debate-workspace-menus.en` | `dd5673e995acba7c108c52ff31080880206bdf0d51b2ca9f0113b0828e7be607` / `51f5b6a42043f37a0c15f53edc63e128fa78b82a9dffb9f7292249c7a660746a` | `7577c504c4b671b0027e49b37f64f0d2a456df9412a9349e58a98e631f8494bf` | `4028dd08b5d16d4ab54fba253595f758273d5d8dc9f8d6784ccf9b5c47d70618` | **PASS retained**. |
| `debate-workspace-menus.ro` | `3cd8b0cdabe438779873f8f940cdff4bb2039ff55742f9400f8805320c8cbc39` / `1e2080d9a727f2b2cfe6c3cc591ce632edd98db91f569a9c9f1eeb9ddced8841` | `e24fe21a32ba3cadd4539cc77afe806630b38b67dce8e33815665017cc3b03ef` | `7d0c57c3f8bb32eee70788195fe3d9971cbcb7ee4548249ea9a600207ac9ac0f` | **PASS retained**. |
| `settings-help-menus.en` | `2f1fd92ebe1f560f631a0990b8883e0aa857783114751f9532cabcf97ba86ede` / `aea10de1460d0eb837f3280ae7b8d6392c0dedffafb291a059a51d2f731e6ce4` | `3677572a1b6fe513930ad82259a89b985f0c3ce023c57be4489794be27147a79` | `ea5720fab4e9755c489c63daec5e85d0cf6b3a0fa9d30a97827dadc7d0e166b5` | **PASS** — corrected body/projection/fallback. |
| `settings-help-menus.ro` | `57b5e6f5d34327177b504261fcc2b4f24e1e7693093f2d42cfd3348fc17872f7` / `d09d141f29cfa542a955f8d47ac559f00a64b8276f11fddb216b05e5151ec761` | `4c8e8ab9af79965af5234b0da312f2970bf9d36f3b131765c4ac31353c5d2495` | `574aef1c82b5203dcab7fd229ad3c6b9bcaa13c64a55924e7ffc49c5bab2d3cc` | **PASS** — corrected body/projection/fallback. |
| `support-status-limits.en` | `f5344e3c0e5f0bec3bb3b5b10dff77b12a85d90233a6d7a7cf8a31f38cc7bfe7` / `22afc752389590aa454e6d0015ce80b1eee1dc21f0fa79eafeaed5a97fd8bad9` | `932f33969c279c6e7db4dc9d0d47fee7eb535b0d1cb593f9b9e9ccc743913385` | `3aafc3b34626b517e8827a8ff0ab9fa6deadf978dee235bd6d78936f37354375` | **PASS retained**. |
| `support-status-limits.ro` | `0ba2909d0b6bf0dbb731e6c19ceff73cd99babbfed69949aec3b28d57f732bfa` / `48662f4fb25887ded7d01b3ba5a003188ee088670b7be39792cb152711079cde` | `05ede1015a5f66f5a5e2e564d061353d433c3af82ea2871bf9489764a27915f0` | `b14e495dcccbcf8d01c1e6213e28ee4c738ee405c6ea8eb4cc572d79f7a73b5e` | **PASS retained**. |

## Recheck findings

1. **Visible menu label corrected.** Both `app-navigation` records now say **Transcripts** and explain that it opens the sample debate transcript. This matches `LandingChrome.tsx:33-35` and preserves the visible UI term for free-text discovery.
2. **Bug workflow corrected.** Both navigation and settings pairs now state that **Report a bug** primes ordinary public-guide text and does not itself create a human case. They separately identify **Escalate to a human** as the human handoff and email as a mail workflow. This matches `Assistant.tsx:803-823`.
3. **Parity and boundaries preserved.** EN/RO meanings match. The corrections add no operator/private authority, credential operation, dynamic private destination, recovery substitute, or action. Account/Settings, fixed Settings fragments, public status limits, private-data denials, separate case handling, and unresolved/actionless Forgot remain intact.

## Attestation handoff

The separate attestation author may copy this reviewer identity, date, evidence path, and the eight exact hashes above into the manifest. Owner fields remain blank. The attestation must bind product revision `af02290219c734d2ad2fe7df878356fec9043b15` and component file SHA-256 `0c06363ee4409efe96807786ad96ed73e46659481f61c56e957eeb340fff3b94`.

## Limits

This is factual editorial review only. No code/security/usefulness/runtime/preview/checkpoint/owner verdict is implied. No tests, build, model, browser, HTTP, runtime, private-data read, product/source/Git/index write, manifest edit, or heavy lease occurred. Usage: `UNAVAILABLE`.
