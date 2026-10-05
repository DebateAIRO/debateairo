# Task 12 KB editorial source review

Editorial self-review session: `/root/implement_task12`; date: 2026-10-05. This is a SOL source/editorial review of the current working tree based on `903407d27b1b66bdcd1b724bb87d0580ca94658f`. It is not an OWNER signature or a future independent review.

The account articles and recovery projections now describe the shared Account / Security / Log out menu, email changes, Active sessions, consent, deletion, masked and unverified phone metadata, explicit temporary reveal, exact sensitive-action confirmation, optional recovery email, passkeys/TOTP, recovery codes and configured providers. Legacy-claim guidance/actions and synthetic scope/ASKER displays were removed. The server still independently prevents removal of the last complete sign-in path. Help may explain and navigate, but cannot receive credentials or operate account controls. Legal entity identity and approved legal text were preserved.

The reviewed source seams are AccountMenu.tsx, SecuritySettings.tsx, PhoneProfileCard.tsx, SessionControls.tsx, SettingsPageClient.tsx and endSession.ts. The action manifest retains active-sessions and adds security; ui-labels.ts is regenerated from all 35 catalogs. Changed entries retire their prior signature/ratification and use this exact-byte editorial record; unchanged entries retain their original evidence.

## Exact reviewed bytes

- `catalog`: `cb302f5103c91c53990efeee1604083ec0bc099296a356968ba43d421e5e5df5`
- `account-settings.en`: `5f04df88af009daf56f03dccaa8d8a271d458bac913f66bd0f63a810919f9cde`
- `account-settings.ro`: `60cef78be7c3eb7dafaf5686d2648beaea9a058d597b49ec2fef9d99ac5fc298`
- `settings-help-menus.en`: `b19d5a8f0da2325584d2ef25e7e7d30f11156833709a011d0a312eeaaf425348`
- `settings-help-menus.ro`: `4b3d62f781328233dbccfedcd9a9a0ebce84e66f342b5ee5e862b7d2fab8c2fc`
- `recovery:account-settings.en`: `d06a03b1142436d6891820a1fcbccf4a538065cf7d486f393c10d8adc08d07ad`
- `recovery:account-settings.ro`: `2a5f162f57092d1ce851a1a7a4abaffc07ddeb981096859ec70159e54080048b`
- `recovery:settings-help-menus.en`: `3b1d8e536df6d5760d732308e6e08be95a05f7e1c54f1e3837b3841dae5b4808`
- `recovery:settings-help-menus.ro`: `c728d7fd0698dc1f8b2361d467425116fd680559d655696fa997647c9e5a0f07`
- recovery component file: `d1f78c54167213308872790a423977974801ce029502ad9fbcdd8485657e7cc4`

## Source snapshot

- `apps/ui/components/AccountMenu.tsx`: `e779c7f9e09f79be2224a026bb022101914f6ee9a9d5447de13682bf9497535d`
- `apps/ui/components/SecuritySettings.tsx`: `030105b254208f3fa95fd8e7db7dd92f3686274ba099031883d2c08b0a0d15f3`
- `apps/ui/components/PhoneProfileCard.tsx`: `a3eacf0d3dfb8ee5f2ac59967d75c44c03fd48c3ffff15aa297daf7d62b45e36`
- `apps/ui/components/SettingsPageClient.tsx`: `a9ecf0448439257b9aa99b4706ba8e30852ee2d401fd7cd4ffe94a875eab3fb7`
- `apps/ui/components/SessionControls.tsx`: `704fb611a5aa743a96092a2115ce3a182b5ca1791a5c8f1dd7cb5dfd255c2a4e`
- `apps/ui/lib/endSession.ts`: `47ab0221fa0023e73be144bf67158e5b6e4ed84b15ffa7437deecf6690fa6274`
