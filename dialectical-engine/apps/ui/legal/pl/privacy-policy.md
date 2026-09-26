# DebateAI — Polityka prywatności

<!-- legal-chrome
summaryTitle: W skrócie
eyebrow: POLITYKA PRYWATNOŚCI · v3.0 · OBOWIĄZUJE OD [DATE]
title: Co przechowujemy i dlaczego
lede: Twoje prawa i nasze obowiązki wynikające z RODO (UE) 2016/679 (ang. GDPR (EU) 2016/679), wyjaśnione prostym językiem. Czternaście sekcji i załącznik B — przewiń do końca.
endMarker: KONIEC POLITYKI · RODO (UE) 2016/679 (ang. GDPR (EU) 2016/679) · v3.0
bodyLabel: Tekst Polityki prywatności
annexTitle: Załącznik B — Regionalne warunki prywatności
jumps:
01 ADMINISTRATOR
02 CO GROMADZIMY
04 PODSTAWA PRAWNA
05 MODELE I TRANSFERY
06 PUBLIKOWANIE
07 OKRES PRZECHOWYWANIA
10 TWOJE PRAWA Z RODO
13 PLIKI COOKIE
-->

2026-09-21 · @Someone

**Projekt v3.0 do weryfikacji przez prawnika — zastępuje wdrożoną wersję v2.1 (`apps/ui/lib/privacyPolicy.ts`). Nie stanowi porady prawnej.** Niniejsza wersja opisuje faktyczne działanie kodu i koryguje pięć stwierdzeń z wersji v2.1, którym kod przeczył: dane sesji, okresy przechowywania, analitykę, eksport oraz skutki usunięcia konta dla opublikowanych debat. Nawiasy kwadratowe oznaczają treści, które możesz uzupełnić wyłącznie Ty; \[pending\] oznacza funkcję opisaną w polityce, która nie została jeszcze zbudowana i musi istnieć przed opublikowaniem polityki.

**Version 3.0 · Effective \[date\] · Poprzednie wersje na dezbatere.ro/privacy/versions · Administrator: DebateAIRO S.R.L., Bukareszt**

**In short.** Gromadzimy dane potrzebne do działania konta oraz treści, które zdecydujesz się wpisać. Twoje pytania trafiają do dostawców AI wymienionych w naszym Rejestrze; nie są wykorzystywane do trenowania modeli. Debaty są prywatne, chyba że je opublikujesz. Usunięcie konta niszczy klucze do Twoich danych i powoduje wycofanie opublikowanych debat. Możesz skontaktować się z nami pod adresem privacy@dezbatere.ro, a osoby wymienione w debacie mogą zażądać jej usunięcia bez posiadania konta.

## 1. Kto odpowiada za Twoje dane

Administratorem Twoich danych osobowych jest **DebateAIRO S.R.L.**, \[address\], Bukareszt, Rumunia, rejestr handlowy \[J40/…\], CUI \[…\]. W każdej sprawie dotyczącej niniejszej polityki napisz na adres **privacy@dezbatere.ro**; odpowiadamy w ciągu miesiąca. Nie wyznaczyliśmy inspektora ochrony danych, ponieważ prawo tego od nas nie wymaga; ten adres jest monitorowany przez \[role\]. Jeżeli wyznaczyliśmy przedstawiciela lub inspektora ds. prywatności dla konkretnego kraju, wskazano go w załączniku B.

## 2. Jakie dane gromadzimy i skąd je pozyskujemy

Gromadzimy wyłącznie dane potrzebne do działania konta, dane, które zdecydujesz się nam przekazać, oraz dane, których przechowywania wymaga od nas prawo.

| Kategoria | Jakie dokładnie dane | Źródło |
| --- | --- | --- |
| **Konto** | Adres e-mail i adres e-mail do odzyskiwania dostępu (przechowywane w postaci zaszyfrowanej, z indeksem opartym na kluczu, abyśmy mogli znaleźć konto bez odczytywania adresu); hasło (przechowywane jako skrót, nigdy w postaci jawnej); klucz uwierzytelniania dwuskładnikowego (zaszyfrowany); dziesięć kodów odzyskiwania (przechowywanych jako skróty); Twój pseudonim; chwila potwierdzenia, że masz co najmniej 18 lat | Ty, podczas rejestracji |
| **Sesje i bezpieczeństwo** | Skrót tokenu sesji; skrót ciągu user-agent Twojej przeglądarki oparty na kluczu, służący do wykrywania przeniesienia sesji do innej przeglądarki; znaczniki czasu utworzenia, ostatniego użycia i wygaśnięcia. **Nie** przechowujemy wraz z sesją Twojego adresu IP, nazwy urządzenia ani szczegółów przeglądarki, a lista sesji widoczna w Ustawieniach pokazuje wyłącznie znaczniki czasu | Twoja przeglądarka |
| **Dziennik audytu bezpieczeństwa** | Dziennik zdarzeń istotnych dla bezpieczeństwa, do którego można tylko dopisywać — rejestracji, weryfikacji, prób logowania, odzyskiwania dostępu, publikacji i usunięcia. Adres IP i user-agent każdego zdarzenia są przechowywane wyłącznie jako jednokierunkowe skróty oparte na kluczu (Argon2id), więc nie można ich odczytać, ale można je dopasowywać w obrębie danego okresu. Sygnały ryzyka dotyczące logowania i odzyskiwania dostępu są przechowywane w postaci zaszyfrowanej przez 90 dni | Twoja przeglądarka, w chwili każdego zdarzenia |
| **Treść debaty** | Wpisane przez Ciebie pytanie; ustawione przez Ciebie adnotacje sterujące; twierdzenia, krytyki, odwołania do dowodów, wyniki i werdykty generowane przez silnik; dosłowny zapis odpowiedzi każdego dostawcy AI; zapytania wyszukiwania i odwołania do źródeł. Wszystko to jest przechowywane w postaci zaszyfrowanej przy użyciu klucza właściwego dla Twojego konta | Ty oraz modele AI pracujące nad Twoim pytaniem |
| **Wsparcie** | Wiadomości wymieniane z asystentem wsparcia lub człowiekiem, przechowywane w postaci zaszyfrowanej; używany język; informacja, czy zezwolono asystentowi na wgląd w status (nigdy w treść) Twoich debat; wystawione przez Ciebie oceny. Jeśli wiadomość uruchomi mechanizmy kontroli nadużyć, zachowujemy skrót wiadomości oraz skrót adresu IP, z którego ją wysłano | Ty |
| **Rejestry akceptacji i zgód** | Wersja i skrót treści zaakceptowanych Warunków świadczenia usług oraz polityki, którą Ci przedstawiono; czas; użyty ekran i mechanizm; Twój język; Twój adres IP i user-agent w tej chwili; każda udzielona lub wycofana zgoda oraz chwila jej udzielenia lub wycofania | Twoja przeglądarka, podczas rejestracji i przy każdej zmianie wyboru |
| **Płatności** \[pending — once a paid plan exists\] | Plan, cena, okres rozliczeniowy, odwołania do transakcji, dowody lokalizacji podatkowej. Dane karty przechowuje nasz dostawca płatności, nigdy my | Ty i dostawca płatności |
| **Osoby, które nie są naszymi użytkownikami** | Dane osobowe innych osób zamieszczone przez Ciebie w pytaniu lub wygenerowane przez silnik w odpowiedzi. Prosimy, aby tego nie robić; sekcja 11 wyjaśnia, co robimy, gdy mimo to do tego dojdzie | Ty, pośrednio |

**Nie** gromadzimy danych analitycznych ani telemetrycznych dotyczących sposobu korzystania przez Ciebie z produktu i nie ustawiamy w tym celu plików cookie. Jeżeli to się zmieni, najpierw zmienimy niniejszą politykę i Politykę plików cookie oraz poprosimy Cię o dokonanie wyboru.

## 3. Informacje wrażliwe

Silnik debat zachęca do zadawania pytań o politykę, religię, zdrowie, seksualność i przekonania. Są to szczególne kategorie danych w rozumieniu art. 9 RODO i mogą pojawić się w Twoich pytaniach niezależnie od tego, czy zamierzamy je gromadzić.

**Informacje o Tobie.** Podczas rejestracji udzielasz, w osobnym zdaniu, wyraźnej zgody na przetwarzanie przez nas informacji wrażliwych, które zdecydujesz się zawrzeć we własnych pytaniach, w celu prowadzenia Twoich debat. Możesz w każdej chwili wycofać tę zgodę, nie zamieszczając takich informacji lub usuwając debatę. Informacje o sobie, które publikujesz, są danymi, które zdecydowałeś się upublicznić.

**Informacje o innych osobach.** Żadna przesłanka prawna nie pozwala nam przetwarzać danych wrażliwych dotyczących osoby trzeciej wymienionej przez Ciebie w pytaniu; takiej przesłanki nie ma też żaden z naszych dostawców AI. Dlatego Warunki świadczenia usług tego zabraniają, minimalizujemy zakres wysyłanych danych i szybko usuwamy takie treści na żądanie — sekcja 11.

**Informacje o zdrowiu.** Niektóre kraje regulują dane dotyczące zdrowia, w tym wnioski na ich podstawie, w przepisach szczególnych. Jeśli mieszkasz w \[the State of Washington\], zastosowanie ma odrębna \[Consumer Health Data Privacy Notice\].

## 4. Dlaczego wykorzystujemy Twoje dane i na jakiej podstawie

Każdy cel ma jedną podstawę prawną na mocy art. 6 ust. 1 RODO, a danych zebranych w jednym celu nie wykorzystujemy ponownie w innym celu.

| Cel | Dane | Podstawa |
| --- | --- | --- |
| Utworzenie i prowadzenie konta, uwierzytelnianie Ciebie oraz prowadzenie i przechowywanie Twoich debat, aby można było je ponownie otwierać i odtwarzać | Konto, sesje, treść debat | **Umowa** — Art. 6(1)(b) |
| Wysyłanie Twojego pytania i wypowiedzi silnika dostawcom AI w celu wygenerowania debaty | Treść debaty | **Umowa** — Art. 6(1)(b) |
| Zapewnienie bezpieczeństwa usługi, wykrywanie nadużyć, umożliwienie Ci wykrycia logowania, którego nie rozpoznajesz, oraz prowadzenie dziennika audytu | Sesje, dziennik audytu bezpieczeństwa, skróty nadużyć w ramach wsparcia | **Prawnie uzasadnione interesy** — Art. 6(1)(f): nasz i Twój interes w bezpiecznej usłudze. Możesz wnieść sprzeciw; sekcja 10 |
| Udowodnienie, że zaakceptowano Warunki świadczenia usług oraz udzielono lub wycofano zgodę | Rejestry akceptacji i zgód | **Obowiązek prawny** — Art. 6(1)(c), nasz obowiązek wykazania zgody zgodnie z Art. 7(1) — oraz prawnie uzasadnione interesy polegające na udokumentowaniu umowy |
| Odpowiadanie na zgłoszenia do wsparcia | Wsparcie | **Umowa** — Art. 6(1)(b) |
| Przetwarzanie informacji wrażliwych dotyczących Ciebie, które zamieszczasz | Treść debaty | **Wyraźna zgoda** — Art. 9(2)(a), udzielona osobno podczas rejestracji |
| Publikowanie debaty, którą zdecydujesz się opublikować | Treść debaty, pseudonim | **Umowa** — Art. 6(1)(b), na Twoje polecenie; w przypadku danych wrażliwych dotyczących Ciebie: Art. 9(2)(e) — dane w sposób oczywisty upublicznione przez Ciebie |
| Wysyłanie Ci aktualności o produkcie | Adres e-mail | **Zgoda** — Art. 6(1)(a), domyślnie niezaznaczone pole; możesz ją wycofać w dowolnym e-mailu lub w Ustawieniach |
| Wypełnianie obowiązków podatkowych, księgowych i prawnych \[pending paid plans\] | Płatności, rejestry akceptacji | **Obowiązek prawny** — Art. 6(1)(c) |
| Obsługa żądań prawnych, zgłoszeń nielegalnych treści oraz naszych obowiązków jako usługi hostingowej | Wszystko, co ma znaczenie dla żądania | **Obowiązek prawny** — Art. 6(1)(c) — oraz prawnie uzasadnione interesy |

Nie profilujemy Cię, nie wykorzystujemy Twoich danych do reklamy i ich nie sprzedajemy. Nie wykorzystujemy Twoich treści do trenowania modeli i nie zezwalamy na to naszym dostawcom — sekcja 5.

## 5. Dostawcy AI i transfery międzynarodowe

**Co jest wysyłane.** Aby przeprowadzić debatę, wysyłamy tekst do jednego lub większej liczby zewnętrznych dostawców AI: Twoje pytanie, ustawione przez Ciebie adnotacje sterujące oraz wypowiedzi tworzone przez silnik w miarę rozwoju debaty. Dostawca widzi zatem tekst wywodzący się z wpisanej przez Ciebie treści i na niej oparty. Nigdy nie otrzymuje Twojego adresu e-mail, identyfikatorów konta ani sesji, adresu IP ani danych płatniczych.

**Którzy dostawcy.** Są wymienieni w naszym **Rejestrze dostawców AI** pod adresem \[dezbatere.ro/providers\], który stanowi część niniejszej polityki. Dla każdego dostawcy Rejestr wskazuje jego podmiot prawny i kraj siedziby; otrzymywane dane i cel ich otrzymywania; kraje lub regiony, w których je przetwarza; warunki przechowywania oraz informację, czy dla używanego przez nas punktu końcowego i funkcji obowiązuje zerowy okres przechowywania danych; czy na mocy zawartej z nami umowy może wykorzystywać dane wejściowe do trenowania; stosowany przez nas mechanizm transferu; oraz datę ostatniej weryfikacji każdego wpisu. Dostawcy mogą się zmieniać; Rejestr jest wersjonowany, a zmiana zostaje w nim odnotowana.

**Trenowanie i przechowywanie to różne kwestie.** Nasze umowy z dostawcami wykluczają wykorzystywanie Twoich treści do trenowania lub ulepszania ich modeli. \[Publish only once verified per route.\] Niektórzy dostawcy przechowują monity i odpowiedzi przez ograniczony czas ze względów bezpieczeństwa, zapobiegania nadużyciom lub własnych obowiązków prawnych; Rejestr podaje, jak długo i dlaczego. Jeżeli obowiązuje zerowy okres przechowywania danych, Rejestr wskazuje to oraz funkcje, których to dotyczy. Nie będziemy określać treści jako nieprzechowywanych, jeżeli są przechowywane.

**Transfery poza EOG.** Dostawcy mający siedzibę w Stanach Zjednoczonych otrzymują dane na podstawie jednego z mechanizmów określonych w rozdziale V RODO: Ram ochrony danych UE–USA, jeżeli konkretny podmiot zawierający umowę jest certyfikowany w odniesieniu do tych danych, albo standardowych klauzul umownych Komisji Europejskiej (moduł drugi, administrator przekazujący dane podmiotowi przetwarzającemu), wspartych oceną ryzyka transferu i środkami uzupełniającymi. Rejestr wskazuje mechanizm dla każdego dostawcy. Kopię klauzul, na których się opieramy, możesz uzyskać, pisząc na adres privacy@dezbatere.ro. Jeżeli mechanizm, na którym się opieramy, zostanie unieważniony, przed kontynuowaniem transferów przechodzimy na inny mechanizm i informujemy Cię o tym.

**Inni odbiorcy.** Nasz dostawca hostingu \[Hetzner, Germany — region …\]; nasz dostawca dostarczania treści i transmisji \[Cloudflare\]; nasz przekaźnik poczty elektronicznej \[…\]; \[our payment provider, once a paid plan exists\]. Każdy z nich działa zgodnie z naszymi udokumentowanymi instrukcjami na podstawie umowy powierzenia przetwarzania danych, z zabezpieczeniami wymaganymi przez art. 28, i każdy jest wymieniony w Rejestrze wraz z lokalizacją i mechanizmem transferu. Nie zezwalamy żadnemu podmiotowi przetwarzającemu na wykorzystywanie Twoich danych do własnych celów. Jeżeli dostawca miałby to robić, jest samodzielnym administratorem i nie wysyłamy mu Twoich danych.

**Organy publiczne.** Ujawniamy dane osobowe sądom, organom regulacyjnym lub organom ścigania, jeżeli wymaga tego prawo, i informujemy Cię o tym, chyba że prawo nam tego zabrania.

## 6. Publikowanie i widoczność

Debaty są prywatne do chwili ich opublikowania. Publikacja jest działaniem celowym i osobno potwierdzanym. Opublikowana debata pokazuje Twój **pseudonim**, pytanie w brzmieniu wpisanym przez Ciebie, drzewo argumentów, wyniki, werdykt i przedział ufności oraz zawiera widoczne oznaczenie, że treść została wygenerowana przez AI. Nigdy nie pokazuje Twojego adresu e-mail, rejestrów sesji ani historii konta. \[Published debates are / are not\] indeksowane przez wyszukiwarki \[unless you choose\].

Wycofanie publikacji usuwa debatę z DebateAI i niszczy klucz do naszej publicznej kopii. Kopie wykonane wcześniej przez czytelników, wyszukiwarki lub archiwa pozostają poza naszą kontrolą i nie możemy ich wycofać.

Gdy usuwasz konto, bez zbędnej zwłoki i nie później niż w ciągu 30 dni usuwamy z publicznego dostępu każdą opublikowaną przez Ciebie debatę, chyba że prawo wymaga od nas zachowania konkretnego elementu. \[Option B — a product change; see the Terms, section 9.\]

## 7. Jak długo przechowujemy dane

| Dane | Jak długo | Co dzieje się potem |
| --- | --- | --- |
| Konto | Przez okres istnienia konta oraz 7-dniowy okres karencji po złożeniu wniosku o jego zamknięcie | Klucze zostają zniszczone; rekord zostaje usunięty |
| Rejestry sesji | 14 dni od ostatniego użycia lub 90 dni od utworzenia, w zależności od tego, który termin przypada wcześniej | Zostają usunięte |
| Łącza weryfikacyjne e-mail | 24 godziny | Zostają usunięte |
| Sygnały ryzyka dotyczące logowania i odzyskiwania dostępu | 90 dni, co jest egzekwowane przez bazę danych | Zostają trwale usunięte |
| Dziennik audytu bezpieczeństwa | Przez okres działania usługi | Można tylko dopisywać; adresy IP i user-agent są jednokierunkowymi skrótami i nie można ich odczytać |
| Treść debat (prywatna) | Przez okres istnienia konta | Przy zamknięciu klucze zostają zniszczone, przez co treść staje się nieczytelna |
| Treść debat (opublikowana) | Przez okres publikacji i istnienia konta | Przy wycofaniu publikacji lub zamknięciu konta zostaje usunięta z publicznego dostępu; klucze zostają zniszczone |
| Rejestry odpowiedzi dostawców i odwołania do wyników wyszukiwania | Tak długo jak debata, do której należą | Tak samo |
| Rozmowy i sprawy dotyczące wsparcia | \[Until closed plus 12 months\] | Klucze zostają zniszczone |
| Rejestry akceptacji i zgód | Przez okres istnienia konta oraz 6 lat — najdłuższy mający do nas zastosowanie termin przedawnienia | Zostają usunięte |
| Rejestry płatności \[pending\] | 10 lat, zgodnie z wymogami rumuńskiego prawa rachunkowego | Zostają usunięte |
| Kopie zapasowe \[pending\] | \[… days\] od usunięcia kopii aktywnej | Zostają nadpisane |

**Co faktycznie powoduje usunięcie.** Twoje debaty i dane konta są szyfrowane przy użyciu kluczy właściwych dla Twojego konta i każdej debaty. Usunięcie konta niszczy te klucze, po czym zaszyfrowane rekordy nie mogą zostać odczytane przez nas ani nikogo innego, a my usuwamy rekord Twojego konta. Opisujemy to jako usunięcie, ponieważ taki jest jego skutek, i dysponujemy udokumentowaną oceną uzasadniającą to określenie; jeśli chcesz dowiedzieć się więcej, zapytaj. Należy wiedzieć o trzech rzeczach: dziennik audytu bezpieczeństwa pozwala wyłącznie na dopisywanie i nie jest usuwany, lecz nie zawiera czytelnych identyfikatorów dotyczących Ciebie; niewielka liczba starszych debat powstała przed wprowadzeniem obecnego schematu szyfrowania, a jeśli dotyczy to Twojego konta, informujemy Cię, jaki skutek ma dla nich jego zamknięcie; kopie danych już wysłanych dostawcy AI podlegają natomiast warunkom przechowywania tego dostawcy podanym w Rejestrze, a nie naszemu procesowi usuwania.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Zautomatyzowane decyzje i profilowanie

Wyniki, oznaczenia warunków i werdykty w debacie są zautomatyzowanymi ocenami **argumentów, a nie osób**. Nie wywołują wobec Ciebie skutków prawnych ani w podobny sposób nie wpływają na Ciebie w istotnym stopniu. Nie podejmujemy wobec Ciebie decyzji opartej wyłącznie na zautomatyzowanym przetwarzaniu, która wywołuje skutki prawne lub podobnie istotne skutki, i nie profilujemy Cię.

Jeżeli kiedykolwiek zautomatyzujemy decyzję dotyczącą Twojego konta — zawieszenie go lub odmowę opublikowania debaty — człowiek sprawdzi każdą taką decyzję przed jej wejściem w życie albo na Twoje żądanie; będzie można przedstawić swoje stanowisko i zakwestionować decyzję. Warunki świadczenia usług opisują, jak to zrobić.

## 9. Bezpieczeństwo i postępowanie w razie problemu

Hasła są haszowane przy użyciu Argon2id. Uwierzytelnianie dwuskładnikowe jest obowiązkowe. Twój adres e-mail, debaty, rozmowy ze wsparciem i klucze uwierzytelniające są szyfrowane w spoczynku przy użyciu kluczy właściwych dla Twojego konta, a klucze opublikowanych debat są przechowywane oddzielnie od kluczy debat prywatnych. Dostęp do danych produkcyjnych jest rejestrowany. Adresy IP i szczegóły przeglądarki w naszym dzienniku bezpieczeństwa są przechowywane wyłącznie jako jednokierunkowe skróty.

Jeżeli dojdzie do naruszenia ochrony danych osobowych, w przypadkach wymaganych prawem zawiadamiamy rumuński organ nadzorczy w ciągu 72 godzin, a gdy naruszenie prawdopodobnie spowoduje wysokie ryzyko naruszenia Twoich praw i wolności, informujemy Cię bezpośrednio i bez zbędnej zwłoki. Załącznik B zawiera zasady powiadamiania mające zastosowanie w innych obsługiwanych przez nas regionach.

## 10. Twoje prawa i sposób korzystania z nich

Z każdego z tych praw można skorzystać bezpłatnie, pisząc na adres **privacy@dezbatere.ro** lub korzystając z sekcji **Ustawienia → Prywatność**, jeżeli istnieje tam odpowiednia funkcja. Odpowiadamy w ciągu miesiąca; jeżeli żądanie jest złożone, możemy przedłużyć ten okres o maksymalnie dwa miesiące i poinformujemy Cię o przyczynie. Możemy poprosić Cię o potwierdzenie tożsamości za pośrednictwem konta.

| Prawo | Co oznacza w tym przypadku |
| --- | --- |
| **Dostęp** (Art. 15) | Kopię danych osobowych, które przechowujemy na Twój temat, oraz niniejsze informacje. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Sprostowanie** (Art. 16) | Popraw swój adres e-mail lub adres e-mail do odzyskiwania dostępu w Ustawieniach. Twojego pseudonimu nie można zmienić z przyczyn opisanych w Warunkach świadczenia usług; można zamknąć konto i otworzyć nowe |
| **Usunięcie** (Art. 17) | W każdej chwili usuń prywatną debatę na jej stronie. Zamknij konto w Ustawieniach; sekcja 7 dokładnie wyjaśnia skutki tej czynności. Poproś nas o usunięcie opublikowanej debaty zawierającej Twoje dane niezależnie od tego, czy jesteś jej autorem |
| **Ograniczenie** (Art. 18) | Poproś nas o zaprzestanie przetwarzania określonych danych do czasu rozstrzygnięcia sporu, który ich dotyczy |
| **Sprzeciw** (Art. 21) | Wnieś sprzeciw wobec przetwarzania opartego na prawnie uzasadnionych interesach — przetwarzania na potrzeby bezpieczeństwa i audytu opisanego w sekcji 4 — a zaprzestaniemy go, chyba że wykażemy istnienie ważnych prawnie uzasadnionych podstaw. W każdej chwili wnieś sprzeciw wobec marketingu, a go zaprzestaniemy |
| **Przenoszenie danych** (Art. 20) | Twoje debaty i dane konta w powszechnie używanym formacie nadającym się do odczytu maszynowego. \[Pending: same export as Access.\] Utworzone przez Ciebie treści niebędące danymi osobowymi, takie jak pytania, zostaną Ci zwrócone na żądanie po zakończeniu umowy |
| **Wycofanie zgody** (Art. 7(3)) | Wycofaj zgodę marketingową z poziomu dowolnego e-maila lub Ustawień; wycofaj zgodę na przetwarzanie danych wrażliwych, nie zamieszczając takich danych albo usuwając debatę. Wycofanie nie wpływa na przetwarzanie, które już miało miejsce |
| **Skarga** | Do rumuńskiego organu nadzorczego, **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bukareszt, <anspdcp@dataprotection.ro>, albo do organu w kraju zamieszkania. Wolelibyśmy jednak, aby najpierw skontaktowano się z nami |

Nigdy nie pobieramy opłat za żądanie ani nie traktujemy Cię mniej korzystnie z powodu jego złożenia.

## 11. Osoby wymienione w debatach, które nie są naszymi użytkownikami

Jeżeli ktoś zada DebateAI pytanie, w którym Cię wymieni, możemy przechowywać Twoje dane osobowe, mimo że nigdy nie korzystano z usługi. Warunki świadczenia usług zabraniają użytkownikom takich działań i minimalizujemy zakres danych wysyłanych dostawcom AI, ale takie sytuacje się zdarzają.

Niniejsza sekcja stanowi informację, którą jesteśmy Ci winni na mocy art. 14 RODO. Dane obejmują wszystko, co użytkownik wpisał, i wszystko, co silnik wygenerował w odpowiedzi; źródłem jest ten użytkownik; cele i podstawy prawne określono w sekcji 4; odbiorcami są dostawcy AI wskazani w Rejestrze; okres przechowywania wynika z sekcji 7. Przysługują Ci wszystkie prawa wymienione w sekcji 10, a w szczególności można poprosić nas o usunięcie opublikowanej lub prywatnej debaty zawierającej Twoje dane oraz o przekazanie informacji o przechowywanych przez nas danych. Nie jest do tego potrzebne konto. Napisz na adres **privacy@dezbatere.ro** lub użyj funkcji **Zgłoś** przy dowolnej opublikowanej debacie, a podejmiemy działania w odpowiedzi na uzasadnione żądania bez zbędnej zwłoki. Nie możemy powiadomić Cię indywidualnie, gdy dochodzi do takiej sytuacji, ponieważ nie wiemy, kim jesteś ani jak się z Tobą skontaktować; zamiast tego stosujemy niniejszą publiczną informację i procedurę usunięcia.

To samo dotyczy informacji wrażliwych na Twój temat — polityki, zdrowia, religii — które pojawiają się w pytaniu innej osoby. Żadna przesłanka prawna nie pozwala nam dalej ich przetwarzać po wniesieniu przez Ciebie sprzeciwu i nie będziemy tego robić.

## 12. Dzieci

DebateAI jest przeznaczone dla osób dorosłych. Podczas rejestracji potwierdzasz, że masz co najmniej 18 lat, i świadomie nie przetwarzamy danych osób poniżej 18. roku życia. Jeżeli dowiemy się, że konto należy do osoby poniżej 18. roku życia, zamkniemy je i usuniemy dane w sposób opisany w sekcji 7. Niektóre kraje uznają potwierdzenie za niewystarczające lub wymagają dodatkowych działań; załącznik B określa zasady obowiązujące w poszczególnych miejscach, a Warunki świadczenia usług wyjaśniają nasze postępowanie.

## 13. Pliki cookie

Ustawiamy dwa pliki cookie, oba bezwzględnie konieczne: jeden utrzymuje zalogowanie, a drugi chroni formularze przed fałszowaniem. Nie ustawiamy plików cookie do celów analitycznych, reklamowych ani śledzenia. **Polityka plików cookie** pod adresem \[dezbatere.ro/cookies\] wymienia je wraz z okresami obowiązywania, wyjaśnia sposób przechowywania Twojego wyboru i zostanie zmieniona przed dodaniem jakiegokolwiek innego pliku cookie. Jeżeli prawo danego regionu traktuje niektóre pliki cookie odmiennie — na przykład obowiązująca w Zjednoczonym Królestwie zasada rezygnacji w przypadku analityki — wyjaśnia to Polityka plików cookie.

## 14. Zmiany niniejszej polityki

Gdy zmieniamy niniejszą politykę, publikujemy nową wersję wraz z podsumowaniem zmian i nową datą wejścia w życie, a poprzednie wersje zachowujemy pod adresem \[dezbatere.ro/privacy/versions\]. O zmianie wprowadzającej nowy cel lub nowego odbiorcę informujemy Cię przed rozpoczęciem nowego przetwarzania, pocztą elektroniczną i w produkcie, oraz zapewniamy czas na wniesienie sprzeciwu. Jeżeli nowy cel zależy od Twojej zgody — na przykład gdybyśmy kiedykolwiek chcieli wykorzystać treści do ulepszania modeli — prosimy o tę zgodę osobno i w sposób konkretny; nigdy nie traktujemy akceptacji zaktualizowanych Warunków świadczenia usług jako zgody na nowe przetwarzanie. W przypadku wyjaśnień, które nie zmieniają naszych działań, po prostu publikujemy nową wersję.

Niniejsza polityka została ostatnio zaktualizowana \[date\]. Wersja 3.0 zastąpiła wersję 2.1, która opisywała dane sesji, okresy przechowywania, analitykę, eksport oraz wpływ usunięcia konta na opublikowane debaty w sposób nieodzwierciedlający już działania usługi.

## Annex B — Regionalne warunki prywatności

Każdy wpis ma zastosowanie wyłącznie wtedy, gdy jego region został wymieniony w sekcji 2 Warunków świadczenia usług, i wskazuje tylko różnice względem głównej części niniejszej polityki.

### B.1 Unia Europejska i Europejski Obszar Gospodarczy

Główna część niniejszej polityki została napisana z myślą o Tobie. Właściwym dla nas organem nadzorczym jest rumuński **ANSPDCP**; można również złożyć skargę do organu w kraju zamieszkania. Użytkownicy z Rumunii: niniejsza polityka jest dostępna w języku rumuńskim pod adresem \[URL\].

### B.2 Zjednoczone Królestwo *(tylko jeśli wymienione)*

Naszym przedstawicielem w Zjednoczonym Królestwie zgodnie z art. 27 brytyjskiego RODO jest **\[name, address, email\]**; można się z nim skontaktować w każdej sprawie dotyczącej niniejszej polityki. Organem nadzorczym jest **Information Commissioner's Office**, [ico.org.uk](https://ico.org.uk). Skargę można złożyć za pomocą formularza pod adresem \[URL\], a my potwierdzimy jej otrzymanie w ciągu 30 dni. Transfery Twoich danych ze Zjednoczonego Królestwa do dostawców AI w Stanach Zjednoczonych opierają się na \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], wspartych oceną ryzyka transferu. Gdybyśmy kiedykolwiek ustawiali analityczne pliki cookie, w Zjednoczonym Królestwie podlegałyby one rezygnacji, a nie zgodzie; obecnie nie ustawiamy żadnych. Jeżeli masz mniej niż 18 lat i mimo naszego wymogu wieku uzyskasz dostęp do usługi, do sposobu traktowania Twoich danych mają zastosowanie standardy Kodeksu dziecięcego ICO.

### B.3 Stany Zjednoczone *(tylko jeśli wymienione)*

**Informacja przy gromadzeniu danych.** Tabela w sekcji 2 wymienia każdą kategorię gromadzonych przez nas danych osobowych, cel ich gromadzenia i okres przechowywania (sekcja 7). Następujące kategorie *wrażliwych* danych osobowych gromadzimy wyłącznie wtedy, gdy zamieszczasz je we własnych pytaniach: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], i wykorzystujemy je wyłącznie do prowadzenia Twoich debat. **Nie sprzedajemy ani nie udostępniamy danych osobowych i nie robiliśmy tego w ciągu poprzednich dwunastu miesięcy.** Nie wykorzystujemy wrażliwych danych osobowych do żadnego celu wykraczającego poza świadczenie żądanej przez Ciebie usługi. **Sygnały preferencji rezygnacji:** honorujemy sygnały Global Privacy Control jako żądanie rezygnacji ze sprzedaży lub udostępniania, czego i tak nie robimy. **Twoje prawa:** prawo do informacji, usunięcia i sprostowania, prawo do rezygnacji, ograniczenia wykorzystywania wrażliwych danych osobowych oraz do niedyskryminacji z powodu korzystania z tych praw; złóż żądanie pod adresem privacy@dezbatere.ro lub \[toll-free number / form\]. **Zachęty finansowe:** nie oferujemy żadnych; bezpłatne i płatne plany nie różnią się sposobem traktowania Twoich danych. **Okres przechowywania** określono w sekcji 7. Niniejsza informacja jest aktualizowana co najmniej raz na dwanaście miesięcy; ostatnia aktualizacja: \[date\].

*Waszyngton:* nasza **Informacja o prywatności danych dotyczących zdrowia konsumentów** pod adresem \[URL\] jest odrębnym dokumentem mającym zastosowanie do wszelkich informacji związanych ze zdrowiem, w tym wniosków. *Teksas i Nebraska:* nie sprzedajemy wrażliwych danych osobowych; gdyby to się kiedykolwiek zmieniło, najpierw uzyskalibyśmy Twoją zgodę \[statutory language\]. *Kolorado, Connecticut, Wirginia i inne stany posiadające kompleksowe przepisy o prywatności:* powyższe prawa przysługują Ci, jeżeli dane prawo ma do nas zastosowanie; od odmowy realizacji żądania można się odwołać, pisząc na adres \[appeals@dezbatere.ro\].

### B.4 Kanada i Quebec *(tylko jeśli wymienione)*

Naszym inspektorem ds. prywatności jest **\[name, email\]**. Pozostajemy odpowiedzialni za dane osobowe przekazywane dostawcom AI poza Kanadą i na podstawie umów wymagamy porównywalnej ochrony; dostawcy ci mogą podlegać prawu krajów, w których działają, w tym zgodnemu z prawem dostępowi organów publicznych. Marketingowe wiadomości e-mail są wysyłane wyłącznie za Twoją wyraźną zgodą zgodnie z CASL. **Quebec:** przed przekazaniem danych osobowych poza Quebec przeprowadzamy ocenę skutków dla prywatności; ustawienia zapewniające prywatność debat są domyślnie włączone; możesz poprosić nas o usunięcie z indeksu lub zaprzestanie rozpowszechniania danych osobowych na Twój temat; możesz zażądać swoich danych w ustrukturyzowanym, powszechnie używanym formacie; sekcja 8 opisuje nasze zautomatyzowane przetwarzanie.

### B.5 Australia i Nowa Zelandia *(tylko jeśli wymienione)*

**Australia.** Zagranicznymi odbiorcami Twoich danych osobowych są dostawcy AI i podmioty przetwarzające wymienione w Rejestrze, mające siedziby w \[the United States and the European Union\]; podejmujemy uzasadnione działania, aby zapewnić ich postępowanie zgodne z Australijskimi Zasadami Prywatności. **Zautomatyzowane decyzje:** od 10 grudnia 2026 r. niniejsza polityka określa rodzaje decyzji podejmowanych przez programy komputerowe, które znacząco wpływają na Twoje prawa lub interesy — nie ma takich decyzji; wyniki i werdykty dotyczą argumentów, a nie Ciebie — oraz wykorzystywane w nich dane osobowe. Skargi można składać do **Office of the Australian Information Commissioner**. **Nowa Zelandia.** Naszym inspektorem ds. prywatności jest \[name\]. Jeżeli gromadzimy dane osobowe na Twój temat pośrednio — ponieważ inny użytkownik zamieścił je w pytaniu — niniejsza polityka i sekcja 11 stanowią przekazywaną przez nas informację. Ujawniamy dane dostawcom AI wymienionym w Rejestrze jako naszym pełnomocnikom, na podstawie umów wymagających porównywalnych zabezpieczeń. Skargi można składać do **Office of the Privacy Commissioner**.

### B.6 Ameryka Łacińska *(załącznik w języku hiszpańskim; tylko jeśli wymienione)*

&#91;Published in Spanish.\] Zgoda stanowi podstawę przetwarzania, jeżeli nie zachodzi konieczność wykonania umowy. Z praw ARCO — dostępu, sprostowania, anulowania, sprzeciwu — można korzystać pod adresem privacy@dezbatere.ro, a odpowiedzi są udzielane w terminie \[per country\]. *Meksyk:* pełne *aviso de privacidad* zawierające obowiązkowe elementy znajduje się pod adresem \[URL\]. *Argentyna:* \[AAIP mandatory legend\]; dane są zarejestrowane w \[…\]. *Kolumbia:* nasza *política de tratamiento de datos* znajduje się pod adresem \[URL\]; organem jest SIC. *Chile* (od 1 grudnia 2026 r.): dane kontaktowe Agencji to \[…\]; sekcja 8 wyjaśnia nasze zautomatyzowane przetwarzanie.

### B.7 Zatoka Perska — ZEA i Arabia Saudyjska *(tylko jeśli wymienione)*

Jeżeli przetwarzamy Twoje dane w celach innych niż świadczenie usługi, opieramy się na Twojej zgodzie, którą można wycofać. Twoje dane opuszczają \[UAE / Kingdom of Saudi Arabia\] i są przetwarzane w Unii Europejskiej i Stanach Zjednoczonych na podstawie \[SDAIA standard contractual clauses / the mechanism in the Register\]. Marketing jest wysyłany wyłącznie za Twoją zgodą. Nie zamieszczaj wrażliwych danych osobowych w swoich pytaniach.

### B.8 Azja i Pacyfik *(tylko wiersze dotyczące wymienionych regionów)*

*Singapur:* naszym Inspektorem Ochrony Danych jest **\[name, email\]**; transfery opierają się na zobowiązaniach umownych zapewniających ochronę porównywalną z PDPA; w ciągu 3 dni powiadamiamy PDPC o naruszeniach podlegających zgłoszeniu. *Japonia:* wykorzystujemy Twoje dane osobowe do celów określonych w sekcji 4 i żadnych innych; Twoje treści są przekazywane dostawcom w \[named countries — e.g. the United States\], których systemy ochrony prywatności i zabezpieczenia opisano w Rejestrze, a Ty wyrażasz na to zgodę podczas rejestracji. *Korea Południowa:* naszym Inspektorem ds. Prywatności jest **\[name\]**; elementy, miejsce docelowe, termin, odbiorca, cel i okres przechowywania transferów zagranicznych są podane w Rejestrze; poglądy polityczne w Twoich pytaniach stanowią informacje wrażliwe i przetwarzamy je wyłącznie w celu prowadzenia debat; zgody na opcjonalne przetwarzanie są zbierane osobno. *Indie* (po rozpoczęciu stosowania przepisów DPDP): zastosowanie ma odrębna informacja o zgodzie pod adresem \[URL\]; na żądania odpowiadamy w ciągu 90 dni; użytkownicy poniżej 18. roku życia wymagają możliwej do zweryfikowania zgody rodziców. *Filipiny:* naszym DPO jest \[name\]; skargi można składać do National Privacy Commission; sekcja 8 opisuje zautomatyzowane przetwarzanie. *Tajlandia:* naszym przedstawicielem jest \[name\] \[if appointed\].

### B.9 Zastrzeżone

Turcja, Brazylia i Indonezja wymagają odpowiednio zawiadomienia w języku lokalnym, przedstawiciela lub rejestracji oraz zgłoszeń, których projekty nie zostały tutaj przygotowane. Usługa nie jest świadczona w Chinach, Wietnamie ani Rosji.
