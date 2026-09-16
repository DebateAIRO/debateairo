# EDITFIX_P2 evidence

- Node/ticket/session: `EDITFIX_P2` / `t_8edac644` / `/root/requirements`
- Base: `f440287179f71e18a4b4b93607951c1e5f862cc1`
- One-file commit: `dfeb7eef93de31e19367760d87c09ca1ef76544e`
- Product path: `packages/support-kb/recovery/components.json`

The correction changes exactly the `modelProjection` and `fallback` strings for `account-access.en` and `account-access.ro`. Both language pairs now state the password step, the configured-authenticator-code or saved-unused-recovery-code alternatives, required email verification, required authenticator enrollment, and continuation only from valid account-flow state. Both fallbacks omit internal Forgot-destination verification commentary. All four strings retain an explicit prohibition on putting credential material in Support.

The first semantic capture was an expected failing correction iteration: `account-access.en.modelProjection` was rejected by fixed predicate `CREDENTIAL_OPERATION`. The same diagnostic showed the first wording also failed that predicate in the EN fallback and both RO strings, with the RO fallback additionally triggering `CREDENTIAL_VALUE`. The correction separated email verification and authenticator enrollment into factual stages and used the established explicit negative Support boundary. No policy code was changed.

`EDITFIX_P2-semantic-final.log` is rc0. The actual parser admitted all 36 ordered records, from `account-access.en` through `view-public-debate.ro`; exactly four strings changed; 34 records compare byte-for-byte equal after JSON decoding; every article digest and all metadata remained unchanged.

- Old component SHA-256: `54e871653032b1190d79182483f2a28ea2516ab180672a8a91f429a86b584d6f`
- New component SHA-256: `5ee8d592c3f1b3550c1f2af74c030fbbc12e80e258dc71b57aa28de045f99e8a`
- EN projection: `1944f976feb66a39095e70ec81b3c7c6c6e97d075394d4393f513497b40f2680` → `c138d4ed2ecd19847cb74b1fd7ad91eb9b047369cb2a391f15563e0915ec192a`
- EN fallback: `988e3d91bc3bec8b7032aceec3d5ec14088e37e7d5917a8e4d18f121b8730855` → `6b5d2dcff5c21d11eae6c6a92cabea39ec253e8e54b5d890d9b25d56f9eab32d`
- RO projection: `5cdd8c33646c533997da2d3bb01e3b51e52c16d8f8c18da05aa1413bdfb48688` → `e3ca804d9cd657ec82e9a9f81fd2dc1299997ee59cc4a752e757cd9e67d6ef98`
- RO fallback: `02815ee2bc5080d301a06e03dd8dc4b3d425d64cf4a6a9b1cce4a2155191d748` → `47d2b4b41acc0d0ef976bab9e08e5f617303612bfeda2b969a2958d6618ad8c0`

`EDITFIX_P2-editorial-digests.json` supplies the new complete 36-row editorial handoff under the prior schema. `EDITFIX_P2-changed-records.json` binds the four old/new hashes and every retained row. `EDITFIX_P2-product-manifest.json` binds the exact one-file commit.

The component corpus remains unreviewed and ineligible. No manifest attestation, reviewer identity, owner ratification, policy change, runtime request, preview action, or CP1 readiness is claimed. The separate EDITREV_P2 reviewer must decide whether these exact bytes resolve the editorial findings.

Actual skill bodies retained and applied in this author session: `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`, `receiving-code-review`, and `verification-before-completion`.
