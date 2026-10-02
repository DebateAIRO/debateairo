---
id: settings-help-menus
lang: ro
title: "Folosește Setările și Ajutorul uman"
status: shipped
sources:
  - apps/ui/components/TopBar.tsx:98
  - apps/ui/components/SessionControls.tsx:181
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:38
  - apps/ui/components/LegacyRunClaimControls.tsx:53
  - apps/ui/components/AccountErasureControls.tsx:137
  - apps/ui/components/support/Assistant.tsx:869
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

„Cont” sau „Setări” deschide pagina de setări a contului autentificat. „Sesiuni active” permite vizitatorului să examineze dispozitivele, să revoce o sesiune sau să se deconecteze de peste tot. „Confidențialitate” deschide o listă, doar pentru citire, cu modulele cookie și elementele din spațiul de stocare al browserului pe care le păstrează DebateAI. „Revendicați dezbaterile vechi” acceptă un token vechi de acces la dezbatere pentru a atașa dezbaterile nerevendicate care corespund. „Ștergeți contul” arată programarea și anularea ștergerii; ștergerea începe după șapte zile complete și necesită un canal verificat de email sau email de recuperare.

Asistența poate naviga direct la aceste secțiuni fixe din Setări și poate explica cerințele vizibile. Nu poate citi sesiunile, tokenul, contul, lista de dezbateri, starea ștergerii sau alte date private ale vizitatorului. Nu cere, nu primește, nu repetă, nu validează și nu trimite o parolă, un token de acces, un cod de autentificare sau un cod de recuperare și nu poate revoca sesiuni, revendica dezbateri ori programa sau anula ștergerea în locul vizitatorului.

Conversația din Ajutor răspunde din ghidul public al produsului. Pastilele de subiect sunt scurtături opționale. „Raportați o eroare” completează text obișnuit pentru ghidul public în caseta de compunere și nu creează un caz uman. „Escaladați către o persoană” creează transferul separat către o persoană, iar emailul de asistență este un flux separat de mail; un caz uman poate include conversația, dar modelul ghidului public nu primește înregistrările private sau tokenurile cazului.
