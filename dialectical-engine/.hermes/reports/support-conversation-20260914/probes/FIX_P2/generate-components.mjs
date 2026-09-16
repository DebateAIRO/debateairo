import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const lane = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const text = {
  "account-access.en": {
    modelProjection: "Sign in starts with the account page and then requires the configured second verification step. A saved unused recovery code is an available alternative on that page after the password step. Registration continues through email confirmation and the additional account-protection page only from valid account-flow state. The separate forgotten-password destination is still unverified, so Support must not offer that action. Support cannot receive passwords, verification tokens, authenticator secrets, or recovery codes.",
    fallback: "Choose Sign in and complete the page's required second verification step. A saved unused recovery code is an available alternative after the password step. Choose Create account to register. The separate Forgot password destination is still unverified, so that action remains unavailable. Support cannot receive passwords, tokens, authenticator secrets, or recovery codes."
  },
  "account-access.ro": {
    modelProjection: "Autentificarea începe din pagina contului și apoi cere al doilea pas configurat. Un cod de recuperare salvat și nefolosit este o alternativă disponibilă în acea pagină după pasul parolei. Înregistrarea continuă cu confirmarea emailului și pagina suplimentară de protecție a contului numai din starea validă a fluxului contului. Destinația separată pentru parola uitată nu este încă confirmată, deci Asistența nu trebuie să ofere acea acțiune. Asistența nu poate primi parole, tokeni de confirmare, secrete de autentificator sau coduri de recuperare.",
    fallback: "Alege Autentificare și finalizează al doilea pas de verificare cerut de pagină. Un cod de recuperare salvat și nefolosit este o alternativă după pasul parolei. Alege Creează un cont pentru înregistrare. Destinația separată pentru parola uitată nu este încă verificată, deci acțiunea rămâne indisponibilă. Asistența nu poate primi parole, tokeni, secrete de autentificator sau coduri de recuperare."
  },
  "account-settings.en": {
    modelProjection: "After signing in, Settings contains session review and revocation, browser consent preferences, legacy debate claim, and account-erasure controls. Sensitive controls require fresh authentication in their owning page. The ordinary page does not offer active controls to change email, replace a password, regenerate active MFA, or edit deployment routing. Support can explain these limits but cannot perform the controls or receive credentials and confirmation phrases.",
    fallback: "After signing in, choose Settings to review or revoke sessions, manage browser consent, claim legacy debates, or begin account erasure. Sensitive controls require fresh authentication on the page. The page does not offer controls to change email, replace a password, regenerate active MFA, or edit deployment routing. Support can explain the controls but cannot perform them or receive credentials."
  },
  "account-settings.ro": {
    modelProjection: "După autentificare, Setări conține revizuirea și revocarea sesiunilor, preferințele de consimțământ din browser, revendicarea dezbaterilor vechi și controalele pentru ștergerea contului. Controalele sensibile cer autentificare recentă în pagina care le gestionează. Pagina obișnuită nu are acum controale active pentru înlocuirea emailului, înlocuirea parolei, regenerarea MFA activă sau rutarea implementării. Asistența poate explica limitele, dar nu poate executa controalele și nu poate primi date de autentificare ori fraze de confirmare.",
    fallback: "După autentificare, alege Setări pentru revizuirea sau revocarea sesiunilor, consimțământul din browser, revendicarea dezbaterilor vechi ori ștergerea contului. Controalele sensibile cer autentificare recentă în pagină. Pagina nu oferă schimbarea emailului, înlocuirea parolei, regenerarea MFA activă sau modificarea rutării implementării. Asistența poate explica aceste controale, dar nu le poate executa și nu poate primi date de autentificare."
  },
  "browse-public-debates.en": {
    modelProjection: "Signed-in members can browse published debates from the home page. A published debate can also be opened without signing in when its public link is shared.",
    fallback: "Sign in and choose Public debates from Home to browse published debates. A shared public debate link can also be opened without signing in."
  },
  "browse-public-debates.ro": {
    modelProjection: "Membrii autentificați pot răsfoi dezbaterile publicate din pagina Acasă. O dezbatere publicată poate fi deschisă și fără autentificare atunci când este distribuit linkul ei public.",
    fallback: "Autentifică-te și alege Dezbateri publice din Acasă pentru a răsfoi dezbaterile publicate. Un link public distribuit poate fi deschis și fără autentificare."
  },
  "budget-tier-choice.en": {
    modelProjection: "The composition budget tier records how much work a composition may spend. Free keeps the current default fixed. Premium allows Low, Medium, or High before the run starts. This choice does not prove a paid subscription, checkout, or guaranteed model availability.",
    fallback: "In the debate form, Free keeps the composition budget at its fixed default. With Premium selected, choose Low, Medium, or High before starting the run. The selection does not prove payment or guarantee that a model is available."
  },
  "budget-tier-choice.ro": {
    modelProjection: "Nivelul bugetului de compoziție înregistrează câtă muncă poate aloca procesul. Planul Free păstrează valoarea implicită fixă. Premium permite alegerea Low, Medium sau High înainte de pornirea rulării. Alegerea nu dovedește un abonament plătit, o plată sau disponibilitatea garantată a unui model.",
    fallback: "În formularul dezbaterii, Free păstrează bugetul compoziției la valoarea implicită fixă. Cu Premium selectat, alege Low, Medium sau High înainte de pornirea rulării. Selecția nu dovedește plata și nu garantează disponibilitatea unui model."
  },
  "debate-topic-and-description.en": {
    modelProjection: "Topic holds the question or claim to examine and requires more than six characters. Premium also permits one steering-menu selection per line and free-text steering annotations. Free clears and disables those steering fields. The current form has no separate description field.",
    fallback: "Enter the question or claim in Topic using more than six characters. Premium can add one steering selection per line and free-text annotations; Free clears and disables those inputs. There is no separate description field in the current form."
  },
  "debate-topic-and-description.ro": {
    modelProjection: "Câmpul Topic conține întrebarea sau afirmația examinată și cere mai mult de șase caractere. Premium permite și câte o selecție de îndrumare pe linie plus adnotări libere. Free golește și dezactivează aceste câmpuri. Formularul curent nu are un câmp separat pentru descriere.",
    fallback: "Scrie întrebarea sau afirmația în Topic folosind mai mult de șase caractere. Premium poate adăuga câte o selecție de îndrumare pe linie și adnotări libere; Free golește și dezactivează aceste câmpuri. Formularul curent nu are un câmp separat pentru descriere."
  },
  "delete-a-private-debate.en": {
    modelProjection: "Deleting a private debate requires signing in, ownership, the debate page's delete control, and fresh authentication when requested. A published debate must be unpublished before deletion.",
    fallback: "Sign in and open a debate you own. Choose its delete control and complete fresh authentication when the page asks. If the debate is published, unpublish it before deletion."
  },
  "delete-a-private-debate.ro": {
    modelProjection: "Ștergerea unei dezbateri private cere autentificare, proprietatea dezbaterii, controlul de ștergere din pagina ei și autentificare recentă când este solicitată. O dezbatere publicată trebuie retrasă de la publicare înainte de ștergere.",
    fallback: "Autentifică-te și deschide o dezbatere care îți aparține. Alege controlul de ștergere și finalizează autentificarea recentă când pagina o cere. Dacă dezbaterea este publicată, retrage mai întâi publicarea."
  },
  "export-json.en": {
    modelProjection: "For an owner debate, Export appears only after a served answer and a readable execution-ledger digest exist. The JSON download contains the answer, ledger digest, and current honesty records. A public debate can export its published JSON snapshot. Markdown export and unfinished owner answers are unavailable, and public downloads exclude private owner data.",
    fallback: "Open a debate you own after its answer is served and its execution-ledger digest is readable, then choose Export for JSON containing the answer, digest, and current honesty records. A public debate can export its published JSON snapshot. Markdown, unfinished owner answers, and private owner data in public downloads are not available."
  },
  "export-json.ro": {
    modelProjection: "Pentru dezbaterea proprietarului, Export apare numai după existența unui răspuns servit și a unui rezumat lizibil al registrului de execuție. Descărcarea JSON conține răspunsul, rezumatul registrului și înregistrările curente de onestitate. O dezbatere publică poate exporta copia JSON publicată. Exportul Markdown și răspunsurile neterminate ale proprietarului nu sunt disponibile, iar descărcările publice exclud datele private ale proprietarului.",
    fallback: "Deschide o dezbatere care îți aparține după servirea răspunsului și disponibilitatea rezumatului lizibil al registrului de execuție, apoi alege Export pentru JSON cu răspunsul, rezumatul și înregistrările curente de onestitate. O dezbatere publică poate exporta copia JSON publicată. Markdown, răspunsurile neterminate și datele private ale proprietarului în descărcări publice nu sunt disponibile."
  },
  "getting-started-debate.en": {
    modelProjection: "The complete debate form requires signing in and a topic longer than six characters. Free keeps visible risk, budget, depth, and steering controls fixed. Premium allows the current risk, budget, depth, and steering controls to be edited before Start run. The Home composer can carry the topic to the complete form when direct start is unavailable. Support does not start the debate for the visitor.",
    fallback: "Sign in, choose Start a debate, and enter a question or claim longer than six characters. Free keeps the visible risk, budget, depth, and steering controls fixed. Premium lets you edit those controls before choosing Start run. Home can carry your topic into the complete form when direct start is unavailable. Support does not start the debate for you."
  },
  "getting-started-debate.ro": {
    modelProjection: "Formularul complet al dezbaterii cere autentificare și un subiect mai lung de șase caractere. Free păstrează fixe controalele vizibile pentru risc, buget, adâncime și îndrumare. Premium permite modificarea controalelor curente înainte de Start run. Compozitorul din Acasă poate transfera subiectul în formularul complet când pornirea directă nu este disponibilă. Asistența nu pornește dezbaterea pentru vizitator.",
    fallback: "Autentifică-te, alege Pornește o dezbatere și introdu o întrebare sau afirmație cu mai mult de șase caractere. Free păstrează fixe controalele vizibile pentru risc, buget, adâncime și îndrumare. Premium permite modificarea lor înainte de Start run. Acasă poate transfera subiectul în formularul complet când pornirea directă nu este disponibilă. Asistența nu pornește dezbaterea în locul tău."
  },
  "guide-how-it-works.en": {
    modelProjection: "When artifacts exist, the debate workspace can show an argument tree, threads, split inspection, a map, answer status, evidence, and honesty details. Claim cards identify model and side. Challenge changes local scrutiny and investigation state but does not prove a durable rebuttal run. Generation history can be unavailable, and an empty panel does not prove that older versions never existed. Export is conditional JSON, not Markdown.",
    fallback: "The debate workspace can show the argument tree, threads, split inspection, map, answer status, evidence, and honesty details when available. Claim cards show model and side. Challenge changes local scrutiny state; it does not prove a durable rebuttal run. Empty history does not prove there were no older versions. Export is conditional JSON rather than Markdown."
  },
  "guide-how-it-works.ro": {
    modelProjection: "Când artefactele există, spațiul dezbaterii poate afișa arborele argumentelor, fire, vizualizarea împărțită, o hartă, starea răspunsului, dovezi și detalii de onestitate. Cardurile afirmațiilor indică modelul și partea. Challenge schimbă starea locală de examinare și investigație, dar nu dovedește o rulare durabilă de răspuns. Istoricul poate fi indisponibil, iar un panou gol nu dovedește că nu au existat versiuni mai vechi. Exportul este JSON condiționat, nu Markdown.",
    fallback: "Spațiul dezbaterii poate afișa arborele argumentelor, fire, vizualizarea împărțită, harta, starea răspunsului, dovezile și detaliile de onestitate când sunt disponibile. Cardurile arată modelul și partea. Challenge schimbă examinarea locală; nu dovedește o rulare durabilă de răspuns. Istoricul gol nu dovedește absența versiunilor mai vechi. Exportul este JSON condiționat, nu Markdown."
  },
  "privacy-consent.en": {
    modelProjection: "Signed-in members can open browser privacy preferences from Settings. The preference is browser-local and does not by itself prove that every analytics or cookie system is active or disabled. Privacy policy text uses the product's existing modal where its opener is available. No verified standalone Privacy or Terms page exists in the current route set.",
    fallback: "Sign in, choose Settings, then choose Privacy preferences. The preference is local to that browser and does not by itself prove the state of every analytics or cookie system. Privacy policy text opens in the existing product modal where available; there is no verified standalone Privacy or Terms page."
  },
  "privacy-consent.ro": {
    modelProjection: "Membrii autentificați pot deschide preferințele de confidențialitate din browser din Setări. Preferința este locală browserului și nu dovedește singură starea fiecărui sistem de analiză sau cookie. Textul politicii de confidențialitate folosește fereastra existentă a produsului acolo unde deschiderea este disponibilă. Setul curent de rute nu are o pagină independentă verificată pentru Confidențialitate sau Termeni.",
    fallback: "Autentifică-te, alege Setări, apoi Preferințe de confidențialitate. Preferința este locală browserului și nu dovedește singură starea fiecărui sistem de analiză sau cookie. Textul politicii se deschide în fereastra existentă a produsului acolo unde este disponibilă; nu există o pagină independentă verificată pentru Confidențialitate sau Termeni."
  },
  "public-answer-disclosure.en": {
    modelProjection: "Published debates may be indexed by search engines, and copies can remain after unpublishing. The public page shows answer status and the time reflected by its evidence, and states when a verdict is unavailable. Publications created before argument-tree publishing contain only the answer summary.",
    fallback: "Before reading a published debate, remember that search engines may index it and copies can remain after unpublishing. The public page shows answer status, the evidence time, and whether a verdict is unavailable. Older publications from before argument-tree publishing contain only the answer summary."
  },
  "public-answer-disclosure.ro": {
    modelProjection: "Dezbaterile publicate pot fi indexate de motoarele de căutare, iar copiile pot rămâne după retragerea publicării. Pagina publică arată starea răspunsului și momentul reflectat de dovezi și precizează când verdictul nu este disponibil. Publicările create înainte de publicarea arborilor de argumente conțin numai rezumatul răspunsului.",
    fallback: "Înainte să citești o dezbatere publicată, reține că motoarele de căutare o pot indexa și că unele copii pot rămâne după retragerea publicării. Pagina publică arată starea răspunsului, momentul dovezilor și indisponibilitatea verdictului. Publicările mai vechi decât arborii publicați conțin numai rezumatul răspunsului."
  },
  "publish-a-debate.en": {
    modelProjection: "Publishing requires signing in, ownership of the debate, the publish control on its page, and fresh authentication when requested.",
    fallback: "Sign in and open a debate you own. Choose its publish control, then complete fresh authentication when the page asks."
  },
  "publish-a-debate.ro": {
    modelProjection: "Publicarea cere autentificare, proprietatea dezbaterii, controlul de publicare din pagina ei și autentificare recentă atunci când este solicitată.",
    fallback: "Autentifică-te și deschide o dezbatere care îți aparține. Alege controlul de publicare, apoi finalizează autentificarea recentă când pagina o cere."
  },
  "risk-tier-choice.en": {
    modelProjection: "Risk tier records how much is riding on the answer. Free fixes it at Standard. Premium allows Casual, Standard, or High stakes before the run starts. The submitted run records the effective selection, and Support cannot change it after submission.",
    fallback: "In the debate form, Free fixes risk at Standard. With Premium selected, choose Casual, Standard, or High stakes before starting the run. The submitted run records the effective choice, and Support cannot change it afterward."
  },
  "risk-tier-choice.ro": {
    modelProjection: "Nivelul de risc înregistrează cât de mult depinde de răspuns. Free îl fixează la Standard. Premium permite alegerea Casual, Standard sau High stakes înainte de pornirea rulării. Rularea trimisă înregistrează selecția efectivă, iar Asistența nu o poate schimba după trimitere.",
    fallback: "În formularul dezbaterii, Free fixează riscul la Standard. Cu Premium selectat, alege Casual, Standard sau High stakes înainte de pornirea rulării. Rularea trimisă înregistrează selecția efectivă, iar Asistența nu o poate schimba ulterior."
  },
  "support-cases.en": {
    modelProjection: "Talk to a human creates an asynchronous Support case, not a telephone call. The server case receipt gives a response target of forty-eight hours, while another panel currently says one working day on weekdays. The receipt is authoritative until the wording is aligned. Keep the case receipt private because it controls case access. Support does not verify inbox delivery.",
    fallback: "Choose Talk to a human to create an asynchronous case; it is not a telephone call. Rely on the server receipt's forty-eight-hour response target while another panel still says one working day on weekdays. Keep the receipt private because it controls access to the case. Support does not verify inbox delivery."
  },
  "support-cases.ro": {
    modelProjection: "Cere ajutorul unei persoane creează un caz asincron de Asistență, nu un apel telefonic. Confirmarea serverului oferă un termen țintă de patruzeci și opt de ore, iar alt panou spune în prezent o zi lucrătoare în zilele lucrătoare. Confirmarea este autoritară până la alinierea textelor. Păstrează confirmarea privată deoarece controlează accesul la caz. Asistența nu verifică livrarea în inbox.",
    fallback: "Alege Cere ajutorul unei persoane pentru un caz asincron; nu este un apel telefonic. Bazează-te pe termenul de patruzeci și opt de ore din confirmarea serverului cât timp alt panou spune încă o zi lucrătoare în zilele lucrătoare. Păstrează confirmarea privată deoarece controlează accesul la caz. Asistența nu verifică livrarea în inbox."
  },
  "support-status-limits.en": {
    modelProjection: "The Help status block describes information published for Support and can be limited or stale. It does not prove the health of every debate engine, model, provider, or deployment. With consent and ownership checks, signed-in Support can read only the approved status projection for the visitor's debate, not the question, claims, answer, another user's debate, or account-security state.",
    fallback: "Choose Support status on Help for the published Support information, which can be limited or stale and does not prove every engine, model, provider, or deployment is healthy. With consent and ownership checks, signed-in Support can read only the approved status projection for your debate, not its content, another person's debate, or account-security state."
  },
  "support-status-limits.ro": {
    modelProjection: "Blocul de stare din Ajutor descrie informațiile publicate pentru Asistență și poate fi limitat sau învechit. El nu dovedește starea fiecărui motor de dezbatere, model, furnizor sau implementare. Cu verificarea consimțământului și a proprietății, Asistența autentificată poate citi numai proiecția aprobată de stare pentru dezbaterea vizitatorului, nu întrebarea, afirmațiile, răspunsul, dezbaterea altei persoane sau starea de securitate a contului.",
    fallback: "Alege Starea serviciului de asistență din Ajutor pentru informațiile publicate, care pot fi limitate sau învechite și nu dovedesc starea fiecărui motor, model, furnizor ori implementare. Cu verificarea consimțământului și proprietății, Asistența autentificată poate citi numai proiecția aprobată de stare pentru dezbaterea ta, nu conținutul ei, dezbaterea altei persoane sau securitatea contului."
  },
  "unpublish-a-debate.en": {
    modelProjection: "Unpublishing requires signing in, ownership of the debate, the unpublish control on its page, and fresh authentication when requested. Copies indexed elsewhere can remain afterward.",
    fallback: "Sign in and open a debate you own. Choose its unpublish control and complete fresh authentication when the page asks. Copies indexed elsewhere may remain after unpublishing."
  },
  "unpublish-a-debate.ro": {
    modelProjection: "Retragerea publicării cere autentificare, proprietatea dezbaterii, controlul corespunzător din pagina ei și autentificare recentă atunci când este solicitată. Copiile indexate în alte locuri pot rămâne ulterior.",
    fallback: "Autentifică-te și deschide o dezbatere care îți aparține. Alege controlul de retragere a publicării și finalizează autentificarea recentă când pagina o cere. Copiile indexate în alte locuri pot rămâne după retragerea publicării."
  },
  "unsupported-capabilities.en": {
    modelProjection: "The current product has no resources for node regeneration, scoring feedback, settings writes, or adaptive-depth approval. Depth mode, scrutiny depth, branching width, concurrency, and maximum-token controls are displayed as legacy options but are not sent in the current run contract. Challenge changes local page state instead of starting a durable rebuttal. Generation history can fail to load and appear empty. Support cannot turn these limitations into working actions.",
    fallback: "The current product cannot regenerate a node, submit scoring feedback, write settings, or approve adaptive depth. Several depth, width, concurrency, and token controls are legacy displays and are not sent with the current run. Challenge changes only local page state, and generation history can fail to load and appear empty. Support cannot turn these limits into working actions."
  },
  "unsupported-capabilities.ro": {
    modelProjection: "Produsul curent nu are resurse pentru regenerarea unui nod, feedback de evaluare, scrierea setărilor sau aprobarea adâncimii adaptive. Modul adâncimii, profunzimea examinării, lățimea ramificării, concurența și limita de tokeni sunt afișate ca opțiuni vechi, dar nu sunt trimise în contractul curent al rulării. Challenge schimbă starea locală a paginii în loc să pornească un răspuns durabil. Istoricul generărilor poate eșua la încărcare și poate apărea gol. Asistența nu poate transforma limitele în acțiuni funcționale.",
    fallback: "Produsul curent nu poate regenera un nod, trimite feedback de evaluare, scrie setări sau aproba adâncimea adaptivă. Mai multe controale de adâncime, lățime, concurență și tokeni sunt afișaje vechi și nu sunt trimise cu rularea curentă. Challenge schimbă numai starea locală, iar istoricul poate eșua la încărcare și poate apărea gol. Asistența nu poate transforma aceste limite în acțiuni funcționale."
  },
  "view-public-debate.en": {
    modelProjection: "A published debate can be opened without signing in from its public link. That link contains the debate's public reference.",
    fallback: "Open the shared public debate link without signing in. The link already contains the debate's public reference."
  },
  "view-public-debate.ro": {
    modelProjection: "O dezbatere publicată poate fi deschisă fără autentificare din linkul ei public. Linkul conține referința publică a dezbaterii.",
    fallback: "Deschide linkul public distribuit fără autentificare. Linkul conține deja referința publică a dezbaterii."
  }
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const components = Object.entries(text).sort(([left],[right]) => left.localeCompare(right,"en"))
  .map(([key,value]) => {
    const separator = key.lastIndexOf(".");
    const id = key.slice(0,separator);
    const lang = key.slice(separator + 1);
    const article = readFileSync(`${lane}/packages/support-kb/content/${key}.md`);
    return { id,lang,articleSha256:sha256(article),...value };
  });
if (components.length !== 36) throw new Error(`expected 36 components, got ${components.length}`);
process.stdout.write(`${JSON.stringify({ schemaVersion: 1,components },null,2)}\n`);
