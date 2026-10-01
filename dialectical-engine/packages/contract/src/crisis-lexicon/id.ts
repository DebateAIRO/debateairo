import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Indonesian, formal and chat spelling (gue/gw, pengen/pgn, ga/gak/nggak, "bundir" = bunuh diri).
// "mati lampu", "mati gaya", "mati-matian" and "lebih baik mati daripada dijajah" must not trip.
const FP = String.raw`(?:aku|saya|gue|gw|gua|guwe|aq|ak|sy|ane|ku)`;
const ADV = String.raw`(?:benar-benar|bener-bener|bener2|beneran|sungguh|udah|udh|sudah|sdh|lagi|lg|sedang|jadi|makin|sering|terus|selalu|tiba-tiba|kadang|kadang-kadang|masih|juga|jg|cuma|cuman|hanya|rasanya|rasanya tuh|merasa|sangat|sgt|bener|kayaknya|sepertinya|mungkin|sekarang|skrg|malam ini|hari ini|belakangan ini|akhir-akhir ini|pun|tuh|tu|nih|jujur|sebenarnya|sebenernya|emang|memang)`;
const WANT = String.raw`(?:ingin|mau|pengen|pengin|pingin|kepengen|kepingin|pgn|pngn|pen|niat|berniat|kepikiran|kepikiran untuk|kepikiran buat|berpikir untuk|mikir buat|mikir untuk|memikirkan|rencana|berencana|mencoba|coba|nyoba|pernah mencoba|pernah nyoba|mau coba|harus|sebaiknya|mending|lebih baik|siap|sudah siap|udah siap)`;
const MATI = String.raw`mati(?!-|matian| matian| lampu| gaya| kutu| listrik| suri| penasaran| kelaparan| syahid| berdiri| terhormat| daripada| dari pada| sebagai| untuk (?:negara|bangsa|tanah air))\b`;
const SUICIDE = String.raw`(?:bunuh diri|bundir|mengakhiri hidup(?:ku| saya| aku| gue)?|ngakhirin hidup|akhiri hidup(?:ku)?)`;
const CLOSE = String.raw`(?:teman|temen|sahabat|pacar|cowok|cewek|cowo|cewe|suami|istri|bini|anak|adik|adek|kakak|abang|ibu|ayah|bapak|mama|papa|nyokap|bokap|sepupu|keponakan|murid|rekan kerja|teman kerja|teman sekamar|teman kos)`;
const MY = String.raw`(?:ku|\s(?:saya|aku|gue|gw|gua))`;

export const ID: CrisisLexicon = Object.freeze({
  language: "id",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${FP}\b (?:${ADV} ){0,3}(?:${WANT}|akan|bakal|mau aja|pengen aja) (?:untuk |buat |mau )?${SUICIDE}\b` },
    { signal: "intent", pattern: String.raw`\b${FP}\b (?:${ADV} ){0,3}${WANT} (?:untuk |buat )?${MATI}` },
    { signal: "intent", pattern: String.raw`\b(?:bunuh diri|bundir) (?:aja|saja|sj|aj|ajalah|sajalah|aja deh|ajalah deh)\b` },
    { signal: "intent", pattern: String.raw`\b(?:pengen|ingin|mau|pingin|pgn|kepengen) mati (?:aja|saja|sj|aj|ajalah|sajalah)\b` },
    { signal: "intent", pattern: String.raw`\b(?:mending|lebih baik|mendingan|lebih baik aku|lebih baik saya) (?:aku |saya |gue |gw )?(?:${MATI}|ga usah hidup|gak usah hidup|nggak usah hidup|tidak usah hidup|ga hidup|tidak hidup|ga pernah lahir|tidak pernah lahir)` },
    { signal: "intent", pattern: String.raw`\b(?:ga|gak|nggak|ngga|enggak|engga|tidak|tak|ndak|gk|ogah|udah ga|udah gak|sudah tidak) (?:mau|pengen|ingin|pingin|kuat|sanggup|bisa|sanggup lagi|tahan) (?:hidup|melanjutkan hidup|lanjut hidup|lanjutin hidup|bertahan hidup|bertahan) (?:lagi|lg)\b` },
    { signal: "intent", pattern: String.raw`\b(?:capek|capai|cape|lelah|muak|bosan|bosen) (?:banget |sekali |bgt )?(?:hidup|dengan hidup ini|sama hidup ini|menjalani hidup)\b(?! di| dengan| sama| bersama| dalam)` },
    { signal: "intent", pattern: String.raw`\bhidup(?:ku| saya| aku| gue| gw)\b (?:ini )?(?:udah |sudah )?(?:ga|gak|nggak|tidak|tak) (?:ada )?(?:artinya|berarti|ada artinya|ada gunanya|berguna|bermakna)\b` },
    { signal: "intent", pattern: String.raw`\b(?:mengakhiri|akhiri|ngakhirin|menghabisi|habisi) (?:hidup|nyawa) ?(?:ku|saya|aku|gue|gw)\b` },
    { signal: "intent", pattern: String.raw`\b(?:pengen|ingin|mau|pingin) (?:menghilang|hilang|lenyap) (?:aja |saja )?(?:dari dunia|selamanya|untuk selamanya)` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b${FP}\b (?:${ADV} ){0,3}(?:suka |sering |masih |terus |ingin |mau |pengen |pernah |udah |abis |habis )?(?:menyakiti|nyakitin|melukai|ngelukain|ngelukai|nyiksa|menyiksa) (?:diri(?: sendiri| ku)?|diriku|badan(?:ku)?|tubuh(?:ku)?)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:sayat|menyayat|nyayat|silet|menyilet|nyilet|gores|menggores|ngegores|ngiris) (?:tangan|lengan|pergelangan(?: tangan)?|nadi|urat nadi|paha|kulit)(?:ku| saya| aku| gue| sendiri)?\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:potong|motong|mutus|putus) (?:urat )?nadi(?:ku| saya| aku| gue| sendiri)?\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${FP}) (?:[a-z]+ ){0,2}self ?harm\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:berhenti|stop|gimana cara berhenti) (?:menyakiti|nyakitin|melukai|self ?harm|nyilet|menyayat)` },
    { signal: "self-harm", pattern: String.raw`\b(?:tangan|lengan|paha)(?:ku| saya| aku| gue)? (?:udah |sudah |penuh )?barcode\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:apakah|apa|haruskah|perlukah|bolehkah|sebaiknya|apa sebaiknya) ${FP} (?:harus |sebaiknya |perlu |mending |boleh |lebih baik |${ADV} )?(?:${SUICIDE}|${MATI}|tetap hidup|terus hidup|lanjut hidup|melanjutkan hidup)` },
    { signal: "decision", pattern: String.raw`\b(?:apakah|apa) hidup(?:ku| saya| aku| gue| gw)\b (?:ini )?(?:masih )?(?:layak|berharga|ada artinya|berarti|pantas|worth it)` },
    { signal: "decision", pattern: String.raw`\bkalau (?:aku|saya|gue|gw) (?:${MATI}|ga ada|gak ada|nggak ada|tidak ada|pergi selamanya|bunuh diri)\b.{0,30}\b(?:peduli|sedih|kehilangan|sadar|nyadar|nangis|menangis)` },
    { signal: "decision", pattern: String.raw`\b(?:satu-satunya|satu satunya) (?:jalan|pilihan|solusi|cara)(?:ku| saya| aku| gue)? (?:adalah |cuma |hanya |ya )?(?:bunuh diri|bundir|${MATI})` },
    { signal: "decision", pattern: String.raw`\b(?:bunuh diri|bundir|${MATI}) (?:adalah |itu )?(?:jalan|pilihan|solusi) (?:terbaik|satu-satunya|terakhir) (?:buat|bagi|untuk) (?:aku|saya|gue|gw|ku)\b` },
    { signal: "decision", pattern: String.raw`\b(?:alasan|alesan) (?:untuk |buat )?(?:tetap hidup|tidak bunuh diri|ga bunuh diri|nggak bunuh diri)\b` },
    // method
    { signal: "method", pattern: String.raw`\b(?:cara|gimana cara|gmn cara|bagaimana cara|tips|metode) (?:paling )?(?:cepat |mudah |gampang |ampuh |efektif |ga sakit |gak sakit |tidak sakit |tanpa rasa sakit |tanpa sakit )?(?:untuk |buat |biar )?(?:bunuh diri|bundir|${MATI}|mengakhiri hidup|gantung diri|overdosis)` },
    { signal: "method", pattern: String.raw`\b(?:mati|bunuh diri|bundir) (?:tanpa rasa sakit|tanpa sakit|ga sakit|gak sakit|nggak sakit|tidak sakit|paling cepat|paling gampang|paling mudah|dengan cepat)\b` },
    { signal: "method", pattern: String.raw`\bberapa\b.{0,40}\b(?:biar|supaya|agar|bisa bikin) (?:mati|overdosis|od|meninggal)\b` },
    { signal: "method", pattern: String.raw`\b(?:overdosis|od)\b.{0,30}\b(?:biar mati|supaya mati|agar mati|sampai mati|sampe mati)\b` },
    { signal: "method", pattern: String.raw`\bdosis (?:yang )?(?:mematikan|letal|fatal)\b` },
    { signal: "method", pattern: String.raw`\b${FP}\b (?:${ADV} ){0,3}(?:${WANT}|akan|bakal|mau) (?:gantung diri|lompat dari|loncat dari|terjun dari|nyebur ke|menabrakkan diri|nabrakin diri|minum racun|minum baygon|minum obat nyamuk|minum pemutih|overdosis|od)\b` },
    { signal: "method", pattern: String.raw`\bminum (?:baygon|racun serangga|obat nyamuk|pemutih|racun tikus)\b.{0,20}\b(?:mati|meninggal|berapa|biar|supaya)\b` },
    { signal: "method", pattern: String.raw`\b(?:tulis|nulis|menulis|bikin|buat|membuat) surat (?:bunuh diri|perpisahan terakhir|wasiat terakhir)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}${MY}\b.{0,30}\b(?:(?:ingin|mau|pengen|pingin|mencoba|nyoba|berencana|mengancam|ngancam|udah|sudah|pernah|mau coba|berniat|kepikiran|bilang mau|bilang pengen) (?:untuk |buat )?(?:bunuh diri|bundir|mengakhiri hidup(?:nya)?|${MATI})|(?:menyakiti|melukai|nyakitin|menyayat|nyayat|menyilet|nyilet) (?:diri(?:nya)?(?: sendiri)?|tangannya|lengannya)|self ?harm|suicidal)` }
  ])
});
