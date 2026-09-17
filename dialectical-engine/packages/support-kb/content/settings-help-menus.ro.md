---
id: settings-help-menus
lang: ro
title: "Folosește Setările și Ajutorul uman"
status: shipped
sources:
  - apps/ui/components/TopBar.tsx:82
  - apps/ui/components/SessionControls.tsx:165
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:35
  - apps/ui/components/LegacyRunClaimControls.tsx:43
  - apps/ui/components/AccountErasureControls.tsx:93
  - apps/ui/components/support/Assistant.tsx:796
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

Account sau Settings deschide pagina de setări a contului autentificat. Active sessions permite vizitatorului să examineze dispozitivele, să revoce o sesiune sau să se deconecteze de peste tot. Privacy deschide preferințele cookie ale browserului. Claim legacy debates acceptă un token vechi de acces la dezbatere pentru a atașa dezbaterile nerevendicate care corespund. Delete account arată programarea și anularea ștergerii; ștergerea începe după șapte zile complete și necesită un canal verificat de email sau email de recuperare.

Asistența poate naviga direct la aceste secțiuni fixe din Setări și poate explica cerințele vizibile. Nu poate citi sesiunile, tokenul, contul, lista de dezbateri, starea ștergerii sau alte date private ale vizitatorului. Nu cere, nu primește, nu repetă, nu validează și nu trimite o parolă, un token de acces, un cod de autentificare sau un cod de recuperare și nu poate revoca sesiuni, revendica dezbateri ori programa sau anula ștergerea în locul vizitatorului.

Conversația din Ajutor răspunde din ghidul public al produsului. Pastilele de subiect sunt scurtături opționale. Report a bug completează text obișnuit pentru ghidul public în caseta de compunere și nu creează un caz uman. Escalate to a human creează transferul separat către o persoană, iar emailul de asistență este un flux separat de mail; un caz uman poate include conversația, dar modelul ghidului public nu primește înregistrările private sau tokenurile cazului.
