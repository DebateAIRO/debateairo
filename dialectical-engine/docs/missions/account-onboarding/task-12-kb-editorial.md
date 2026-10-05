# Task 12 KB editorial source review

Editorial self-review session: `/root/implement_task12`; date: 2026-10-05. This is a SOL source/editorial review of the current working tree based on `903407d27b1b66bdcd1b724bb87d0580ca94658f`. It is not an OWNER signature or a future independent review.

The account articles and recovery projections now describe the shared Account / Security / Log out menu, email changes, Active sessions, consent, deletion, masked and unverified phone metadata, explicit temporary reveal, exact sensitive-action confirmation, optional recovery email, passkeys/TOTP, recovery codes and configured providers. Legacy-claim guidance/actions and synthetic scope/ASKER displays were removed. The server still independently prevents removal of the last complete sign-in path. Help may explain and navigate, but cannot receive credentials or operate account controls. Legal entity identity and approved legal text were preserved.

The reviewed source seams are AccountMenu.tsx, SecuritySettings.tsx, PhoneProfileCard.tsx, SessionControls.tsx, SettingsPageClient.tsx and endSession.ts. The action manifest retains active-sessions and adds security; ui-labels.ts is regenerated from all 35 catalogs. Changed entries retire their prior signature/ratification and use this exact-byte editorial record; unchanged entries retain their original evidence.

## Fix round 1 source freeze

The bounded six-finding correction is based on `935690380eb1d2cf9357a85abed70667cf26b18f`. The review role/session/date above remain the actual SOL editorial record; this adds no OWNER or independent-review claim. The phone-completion carrier stores only a whitelisted question/form/original request, stable fresh-read owner and local correlation UUID. It stores no phone-field value, password, code, grant, CSRF or bearer. Its 15-minute validity is nonrenewing across provider refusal/return and update acknowledgement. While the tab is away from our origin, bytes may remain in sessionStorage until a later owned read/cleanup or tab closure; expired data cannot be restored, acknowledged or retried. Provider proofs remain in the existing RAM-only, once-owned handoff with their original action/target/session/deadline. Native Romanian recovery text was corrected without changing any OWNER records or the loader/schema.

## Exact reviewed bytes

- `catalog`: `cb302f5103c91c53990efeee1604083ec0bc099296a356968ba43d421e5e5df5`
- `account-settings.en:article`: `5f04df88af009daf56f03dccaa8d8a271d458bac913f66bd0f63a810919f9cde`
- `recovery:account-settings.en:modelProjection`: `bf677b042f9ecf290defa774541729c00faa3fb276864c07f464a126516171de`
- `recovery:account-settings.en:fallback`: `bf677b042f9ecf290defa774541729c00faa3fb276864c07f464a126516171de`
- `account-settings.ro:article`: `60cef78be7c3eb7dafaf5686d2648beaea9a058d597b49ec2fef9d99ac5fc298`
- `recovery:account-settings.ro:modelProjection`: `87365bf4a4e5448ce92a556b2d8d9dc810e1da8257e1b29770415a9a5c2ad89f`
- `recovery:account-settings.ro:fallback`: `87365bf4a4e5448ce92a556b2d8d9dc810e1da8257e1b29770415a9a5c2ad89f`
- `settings-help-menus.en:article`: `b19d5a8f0da2325584d2ef25e7e7d30f11156833709a011d0a312eeaaf425348`
- `recovery:settings-help-menus.en:modelProjection`: `948f19150d75fd7187d7c5e24a7caf01f7524186da1ce812f63a461406d61ae2`
- `recovery:settings-help-menus.en:fallback`: `948f19150d75fd7187d7c5e24a7caf01f7524186da1ce812f63a461406d61ae2`
- `settings-help-menus.ro:article`: `4b3d62f781328233dbccfedcd9a9a0ebce84e66f342b5ee5e862b7d2fab8c2fc`
- `recovery:settings-help-menus.ro:modelProjection`: `c728d7fd0698dc1f8b2361d467425116fd680559d655696fa997647c9e5a0f07`
- `recovery:settings-help-menus.ro:fallback`: `c728d7fd0698dc1f8b2361d467425116fd680559d655696fa997647c9e5a0f07`
- `recovery component file`: `53ba9f42e9984a5c152f55934f6c47bb517e16d5adffdb23e85f07f5759e20dc`

ModelProjection and fallback labels identify the exact UTF-8 string bytes; article and component-file labels identify the exact file bytes, including frontmatter/formatting.

## Source snapshot

- `apps/ui/components/AccountMenu.tsx`: `e779c7f9e09f79be2224a026bb022101914f6ee9a9d5447de13682bf9497535d`
- `apps/ui/components/SecuritySettings.tsx`: `bf4fd1da99662b78b1ac43a155bae9f8a1ee2050fb217ca4c03da7887411b845`
- `apps/ui/components/PhoneProfileCard.tsx`: `2697c1313ab7542218159caf28bb2aa5e450901ba45d77bd8629c4b977cbd43b`
- `apps/ui/components/SettingsPageClient.tsx`: `a9ecf0448439257b9aa99b4706ba8e30852ee2d401fd7cd4ffe94a875eab3fb7`
- `apps/ui/components/SessionControls.tsx`: `704fb611a5aa743a96092a2115ce3a182b5ca1791a5c8f1dd7cb5dfd255c2a4e`
- `apps/ui/lib/endSession.ts`: `e835e8a42e80d6f325f6f090cf3bb35cfa1c3a4817fd121655a9f469b5bd7a5d`
- `apps/ui/lib/phoneCompletionDraft.ts`: `384ad958d424bfcda7e72fa753d97e5463cd9573132b283fc67db2659906dc7a`
- `apps/ui/app/new/NewDebatePageClient.tsx`: `54d5e1888519597abe47b075b6a77299437a3f78651b1a87b5e6643129926365`
- `apps/ui/components/auth/SecurityConfirmation.tsx`: `8025b0a7b6bc7244d6661f6c917f4c09fd1d31522baf41dc85b38f80abb035e9`
- `apps/ui/components/auth/SocialCompleteFlow.tsx`: `7fc3ba3d9293c95e5dc4cd2efb85a86b6cc332b05c1be1756d7270f82768a091`
