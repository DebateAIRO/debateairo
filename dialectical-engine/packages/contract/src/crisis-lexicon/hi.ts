import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Hindi in Devanagari, plus the romanised Hinglish people type on phones. Devanagari vowel
// signs are kept by normalisation; chandrabindu and anusvara are used interchangeably (हूँ/हूं),
// and the nukta is often left out (ख़ुदकुशी/खुदकुशी, ज़िंदगी/जिंदगी), so both are optional.
const SUI = String.raw`(?:आत्महत्या|आत्म-हत्या|आत्म हत्या|आत्महत्त्या|ख़?ुदकुशी|ख़?ुद कुशी|सुसाइड|सूसाइड|सुसाईड)`;
const HOON = String.raw`ह[ूु][ँं]?`;
// -ūṅgā / -ūṅgī future endings: लूँगा, करूंगी, दूँगा.
const GA = String.raw`[ूु][ँं]?ग[ाी]`;
const JAUNGA = String.raw`जा[ऊउ][ँं]?ग[ाी]`;
const LIFE = String.raw`(?:ज़?ि(?:ं|न्)दगी|जीवन|लाइफ़?)`;
const END = String.raw`\s*(?:$|[.!?,;।])`;
// Romanised.
const SUI_R = String.raw`(?:suicide|sucide|suiside|suicied|khud ?kushi|khud ?khushi|aatm ?hatya|atm ?hatya|aatmahatya|atmahatya)`;
const CLOSE = String.raw`(?:मेरा|मेरी|मेरे) (?:सबसे अच्छा |सबसे अच्छी |बेस्ट |छोटा |छोटी |बड़ा |बड़ी |बडा |बडी )?(?:दोस्त|सहेली|मित्र|भाई|बहन|बेटा|बेटी|पति|पत्नी|बीवी|माँ|मां|मम्मी|पापा|पिता|पिताजी|बच्चा|बच्ची|बच्चे|बॉयफ्रेंड|गर्लफ्रेंड|भतीजा|भतीजी|भांजा|भांजी|चचेरा भाई|चचेरी बहन|रूममेट|सहकर्मी|कलीग|छात्र|छात्रा|स्टूडेंट|पार्टनर|प्रेमी|प्रेमिका|जीजा|जीजू|दीदी|भैया|भाभी|दादा|दादी|नाना|नानी|पोता|पोती)`;
const CLOSE_R = String.raw`\b(?:mera|meri|mere) (?:best |chota |choti |bada |badi )?(?:dost|friend|bhai|behen|bahen|behan|beta|beti|pati|patni|biwi|wife|husband|maa|mummy|mom|papa|dad|bachha|bachcha|bacha|boyfriend|girlfriend|bf|gf|cousin|roommate|sister|brother|didi|bhaiya)\b`;

export const HI: CrisisLexicon = Object.freeze({
  language: "hi",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent — Devanagari
    { signal: "intent", pattern: String.raw`${SUI}\s?(?:करना|करने|कर लेना|कर लेने)\s(?:चाह(?:ता|ती)|का (?:मन|सोच|विचार|फ़?ैसला)|के (?:बारे में )?(?:सोच|विचार)|की (?:सोच|इच्छा))` },
    { signal: "intent", pattern: String.raw`मुझे\s.{0,10}${SUI}\s?(?:करनी|करना) है` },
    { signal: "intent", pattern: String.raw`${SUI}\s?(?:कर\s?)?(?:ल${GA}|कर${GA})` },
    { signal: "intent", pattern: String.raw`(?:मुझे|मेरे मन में|मेरे दिमाग़? में|मन में|दिमाग़? में)\s.{0,20}(?:${SUI}|मरने|मर जाने) (?:के|का) (?:ख़?याल|विचार)` },
    { signal: "intent", pattern: String.raw`${SUI} (?:के|का) (?:ख़?याल|विचार) (?:आ(?:ते|ता|ने लगे|ने लगा)|आ रहे)` },
    { signal: "intent", pattern: String.raw`(?<!(?:में|पर|लिए|तरह|साथ|से)\s)(?:मरना|मर जाना) चाह(?:ता|ती) ${HOON}` },
    { signal: "intent", pattern: String.raw`(?:^|\s)(?:मैं|मै) (?:अब |बस |सच में )?(?:मरना|मर जाना) चाह(?:ता|ती)` },
    { signal: "intent", pattern: String.raw`मुझे (?:अब |बस )?(?:मरना|मर जाना) है` },
    { signal: "intent", pattern: String.raw`(?<!(?:में|पर|लिए|तरह|साथ)\s)(?:मरने|मर जाने) (?:का|को) (?:मन|जी|दिल) (?:कर(?:ता|ती|ने)|हो(?:ता|ती)|चाह(?:ता|ती)|है)` },
    { signal: "intent", pattern: String.raw`मुझे (?:बस )?मौत चाहिए|(?:काश|भगवान)\s.{0,15}मौत (?:आ जा|दे दे)` },
    { signal: "intent", pattern: String.raw`(?:ख़?ुद|अपने आप) को (?:मार (?:डाल|द${GA}|दूँ|दूं|ल${GA})|मार डालना चाह|मारना चाह(?:ता|ती)|ख़?त्म कर (?:द${GA}|ल${GA}|दूँ|दूं|लूँ|लूं|देना चाह|लेना चाह))` },
    { signal: "intent", pattern: String.raw`अपनी जान (?:ले (?:ल${GA}|लूँ|लूं|लू|लेना चाह)|लेना चाह(?:ता|ती)|लेने (?:का|की|के) (?:मन|सोच|विचार|बारे))` },
    { signal: "intent", pattern: String.raw`(?:अपनी )?${LIFE} (?:ख़?त्म|ख़?तम|समाप्त|एंड) (?:कर(?:ना चाह| द${GA}| ल${GA}|ने का (?:मन|सोच|विचार|फ़?ैसला)|ने के बारे))` },
    { signal: "intent", pattern: String.raw`काश (?:मैं |मै )?(?:मर (?:जा(?:ऊँ|ऊं|उं|ता|ती)|गया होता|गई होती)|पैदा (?:ही )?(?:न|नहीं|ना) (?:हो(?:ता|ती)|हुआ|हुई))` },
    { signal: "intent", pattern: String.raw`(?<!(?:में|बिना|साथ|यहाँ|यहां|वहाँ|वहां|तरह|पर)\s)(?:जीना|जीने की इच्छा|जीने का मन|जीने को जी) (?:अब )?(?:नहीं|नही|ना) (?:चाह(?:ता|ती)|कर(?:ता|ती)|है|रही|रहा|होता|होती)` },
    { signal: "intent", pattern: String.raw`जीने (?:की|का|के) (?:अब )?(?:कोई )?(?:वजह|वज़ह|कारण|मतलब|मक़?सद|उम्मीद|इच्छा|लिए कुछ) (?:नहीं|नही|ना|बाक़?ी नहीं)` },
    { signal: "intent", pattern: String.raw`(?:^|\s)(?:मैं|मै) (?:अब )?(?:और )?(?:नहीं|नही) (?:जी|सह|झेल) (?:सकता|सकती|पा रहा|पा रही)(?:\s(?:अब|और|${HOON}|ये|यह|इसे))*${END}` },
    { signal: "intent", pattern: String.raw`(?:मैं|मै|मैंने|मुझे)\s.{0,15}(?:सुसाइडल|सूसाइडल)|(?:सुसाइडल|सूसाइडल) (?:महसूस|फ़?ील)` },
    // intent — romanised
    { signal: "intent", pattern: String.raw`\b${SUI_R}\s(?:karna|krna|karne|krne|kar ?lena|kr ?lena|karni)\s(?:chah?t[ai]|chahata|chahati|ka (?:mann?|mn|soch|vichar|khayal|khyal|plan|irada)|ki soch|ke bare me(?:in)? soch|hai\b)` },
    { signal: "intent", pattern: String.raw`\b${SUI_R}\s(?:ka?r ?l[uo]o?n?g[ai]|ka?r ?l[uo]o?n?\b|karu?o?n?g[ai]|kru?n?g[ai]|kar raha h|kar rahi h)` },
    { signal: "intent", pattern: String.raw`(?<!(?:liye|lie|khatir|tarah|tareh)\s)\b(?:marna|mar ?jana) (?:chah?t[ai]|chahata|chahati)\b` },
    { signal: "intent", pattern: String.raw`\bmu(?:jh|j)e (?:bas |ab )?(?:marna|mar ?jana) (?:hai|he)\b` },
    { signal: "intent", pattern: String.raw`\b(?:marne|mar jane) (?:ka|ko) (?:mann?|mn|dil|jee|ji) (?:karta|karti|krta|krti|hai|hota|hoti)\b` },
    { signal: "intent", pattern: String.raw`(?<!(?:me|mein|bina|sath|saath|yaha|yahan|waha)\s)\b(?:jeena|jina) (?:nahi|nahin|nai|na) (?:chahta|chahti|chata|chati)\b` },
    { signal: "intent", pattern: String.raw`\b(?:jeene|jine|jeeney) (?:ka|ki|ko) (?:koi )?(?:mann?|mn|dil|wajah|vajah|wajha|reason|ichha|iccha|matlab|maqsad) (?:nahi|nahin|nai|na)\b` },
    { signal: "intent", pattern: String.raw`\bkhud ko (?:maar|mar) (?:dal|daal|dunga|dungi|lunga|lungi|dena chah|na chah)|\b(?:apni|apne) (?:jaan|jan) (?:le (?:lunga|lungi|lu)|lena chah|lene ka)` },
    { signal: "intent", pattern: String.raw`\b(?:apni |apne )?(?:zindagi|zindgi|jindagi|jindgi|life) (?:khatam|khatm|khtm|end) (?:karna chah|krna chah|kar dunga|kar dungi|kar lunga|kar lungi|kr dunga|karne ka)` },
    { signal: "intent", pattern: String.raw`\bkaa?sh (?:main |mai |me )?(?:mar (?:jaun|jau|jata|jati)|paida (?:hi )?(?:na|nahi) (?:hota|hoti|hua))\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`(?:^|\s)(?:मैं|मै|मैंने)\s(?:अक्सर |फिर से |बार[- ]बार |रोज़? |अब भी |ख़?ुद ही )?(?:ख़?ुद|अपने आप) को (?:नुक़?सान|चोट|कट|हर्ट|काट|जला|तकलीफ़?)` },
    { signal: "self-harm", pattern: String.raw`(?:ख़?ुद|अपने आप) को (?:नुक़?सान|चोट|कट|हर्ट|तकलीफ़?) (?:पहु[ँं]?चा|कर|लगा|दे)(?:ता|ती|ती रहती|ता रहता|ने लगा|ने लगी)? ${HOON}` },
    { signal: "self-harm", pattern: String.raw`ब्लेड से (?:अपना |अपने |अपनी )?(?:हाथ|कलाई|बाजू|बांह|बाँह|ख़?ुद को|शरीर|जांघ|जाँघ) (?:काट|कट|चीर)` },
    { signal: "self-harm", pattern: String.raw`(?:^|\s)(?:मैं|मै|मैंने)\s.{0,15}सेल्फ[ -]?हार्म|सेल्फ[ -]?हार्म कर(?:ता|ती) ${HOON}` },
    { signal: "self-harm", pattern: String.raw`\b(?:mai|main|maine|me)\s(?:bhi |ab |fir se |phir se |roz )?khud ko (?:hurt|cut|nuksan|nuksaan|chot|kat)|\bkhud ko (?:hurt|cut|nuksan|nuksaan|chot|kaat|kat) (?:ka?r|pahu?n?cha)[a-z]* (?:hu|hoon|hun)\b|\bself[- ]?harm (?:karta|karti|krta|krti|kar raha|kar rahi) (?:hu|hoon|hun)\b` },
    // decision
    { signal: "decision", pattern: String.raw`क्या (?:मुझे|मैं|मै) (?:बस |सच में |अब )?(?:${SUI} (?:कर ल(?:ूँ|ूं|ू|ुं|ुँ)|कर लेनी चाहिए|करनी चाहिए|करना चाहिए|कर लेना चाहिए)|मर जा(?:ऊँ|ऊं|उं|ना चाहिए)(?!ग)|मरना चाहिए|अपनी जान (?:ले ल(?:ूँ|ूं|ू)|लेनी चाहिए)|ख़?ुद को मार|अपनी ${LIFE} ख़?त्म|जीना चाहिए${END})` },
    { signal: "decision", pattern: String.raw`(?:जिऊँ|जियूँ|जीऊं|जिऊं|जियूं|जीऊँ|जीना) या (?:मर(?:ूँ|ूं|ुं|ना|ू)|मर जा(?:ऊँ|ऊं|उं|ना))|मर(?:ूँ|ूं|ुं|ना|ू) या (?:जिऊँ|जियूँ|जीऊं|जिऊं|जियूं|जीऊँ|जीना)` },
    { signal: "decision", pattern: String.raw`(?:मेरी|मेरा) (?:ज़?ि(?:ं|न्)दगी|जीवन) (?:जीने )?(?:लायक|के लायक|का कोई मतलब|की कोई क़?ीमत)` },
    { signal: "decision", pattern: String.raw`${SUI} (?:ही )?(?:मेरा |मेरे लिए )?(?:एकमात्र|आख़?िरी|अकेला|इकलौता|एक ही|सबसे अच्छा) (?:रास्ता|विकल्प|उपाय|हल)|(?:मरने|${SUI}) के (?:अलावा|सिवा|सिवाय|सिवाए) (?:कोई|और कोई) (?:रास्ता|चारा|विकल्प|उपाय)` },
    { signal: "decision", pattern: String.raw`क्या ${SUI}\s.{0,15}मेरे लिए|${SUI} (?:न|ना) करने (?:की|के) (?:वजह|कारण)` },
    { signal: "decision", pattern: String.raw`(?:मैं|मै) मर (?:जाऊँ|जाऊं|जाउं|गया|गई|${JAUNGA}) तो (?:किसी को|कोई|क्या कोई|किसे|घरवालों को|किसीको)` },
    { signal: "decision", pattern: String.raw`\bkya (?:mujhe|muje|mai|main|me) (?:${SUI_R} (?:ka?r (?:lena|leni|lu|lun)|karna chahiye|kar leni chahiye)|mar jana chahiye|mar jaun?\b|marna chahiye|jeena chahiye)` },
    { signal: "decision", pattern: String.raw`\b(?:jeeu|jiyu|jiu|jeena) ya (?:maru|marun|marna|mar jaun?)\b` },
    // method
    { signal: "method", pattern: String.raw`${SUI}\s(?:कैसे|कैसें)\s(?:करें|करे|करूँ|करूं|करू|की जाती|की जाए|किया जाता|कर सकता|कर सकती|करते|कर ल(?:ूँ|ूं|ू))` },
    { signal: "method", pattern: String.raw`कैसे (?:${SUI} कर|ख़?ुद को मार|अपनी जान ल|मर(?:ूँ|ूं|ुं|ें|ू)(?:\s|$|[?।])|मरा जा)` },
    { signal: "method", pattern: String.raw`${SUI} करने (?:का|के) (?:सबसे )?(?:आसान |पक्का |अच्छा )?(?:तरीका|तरीके|तरीक़ा|तरीक़े|उपाय)` },
    { signal: "method", pattern: String.raw`(?:आसान|पक्का|बिना दर्द|दर्द रहित|सबसे अच्छा|जल्दी)\s.{0,10}(?:मरने|${SUI}|मौत) (?:का|के|की) (?:तरीका|तरीके|तरीक़ा|तरीक़े|उपाय|रास्ता)` },
    { signal: "method", pattern: String.raw`(?:मरने|मर जाने) (?:का|के) (?:सबसे )?(?:आसान |बिना दर्द |दर्द रहित |जल्दी |पक्का |अच्छा )?(?:तरीका|तरीके|तरीक़ा|तरीक़े|उपाय)` },
    { signal: "method", pattern: String.raw`बिना दर्द के (?:कैसे )?(?:मर(?:ें|ूँ|ूं|ना|ने|ा जाए)|${SUI})` },
    { signal: "method", pattern: String.raw`कितनी (?:नींद की )?(?:गोली|गोलियाँ|गोलियां|गोलिया|टैबलेट|दवा|दवाई|दवाइयाँ|दवाइयां|पैरासिटामोल).{0,40}(?:मर (?:जा|सक)|मौत (?:हो|आ)|मरने के लिए|जान (?:जा|चली))` },
    { signal: "method", pattern: String.raw`(?:जानलेवा|घातक) (?:ख़?ुराक|डोज़?|मात्रा)` },
    { signal: "method", pattern: String.raw`(?:फाँसी|फांसी|फासी|फंदा|फन्दा) (?:लगा|लगाकर|लगा कर|पर लटक|से लटक)\s?(?:ल${GA}|लूँ|लूं|लू|लेना चाह|द${GA}|ने का सोच|ने का मन|ने की सोच|कर मर)` },
    { signal: "method", pattern: String.raw`(?:पंखे|पेड़|पेड) से (?:लटक|फाँसी|फांसी)\s?(?:${JAUNGA}|जा(?:ऊँ|ऊं|उं)|ल${GA}|जाना चाह)` },
    { signal: "method", pattern: String.raw`ज़?हर (?:खा|पी) (?:ल${GA}|लूँ|लूं|लू|लेना चाह|कर मर|लिया|ली)` },
    { signal: "method", pattern: String.raw`(?:छत|बिल्डिंग|पुल|ब्रिज|इमारत|टेरेस|बालकनी|पहाड़|पहाड|खिड़की|खिडकी) (?:से|पर से) (?:कूद|छलांग लगा|छलाँग लगा)\s?(?:${JAUNGA}|जा(?:ऊँ|ऊं|उं)|ल${GA}|जाना चाह|कर मर|द${GA}|ने का (?:सोच|मन))` },
    { signal: "method", pattern: String.raw`(?:ट्रेन|रेल|गाड़ी|गाडी|ट्रक) (?:के आगे|के नीचे|के सामने) (?:कूद|आ|लेट)\s?(?:${JAUNGA}|जा(?:ऊँ|ऊं|उं)|ल${GA}|जाना चाह)` },
    { signal: "method", pattern: String.raw`(?:नस|नसें|कलाई) काट\s?(?:ल${GA}|ली|लिया|लू|लूँ|लूं|लेती ${HOON}|लेता ${HOON}|रहा|रही|दी|ने का)` },
    { signal: "method", pattern: String.raw`\b${SUI_R} (?:kaise|kese|kaisey) (?:kare|karu|karein|karte|kru|karun|kiya jata|kiya jaye)\b|\b${SUI_R} (?:karne )?ka (?:tarika|tareeka|tarike|tareeke|easy|aasan|asan)\b` },
    { signal: "method", pattern: String.raw`\b(?:marne|mrne) ka (?:sabse )?(?:aasan |asan |easy |painless |best |jaldi |pakka )?(?:tarika|tareeka|tarike|tareeke|way|upay)\b|\bbina dard ke (?:marne|mar|marna|suicide)\b` },
    { signal: "method", pattern: String.raw`\bkitni (?:neend ki )?(?:goli|goliyan|goliya|tablet|tablets|dawai|pills).{0,40}(?:mar (?:ja|sak)|maut|death|marne)` },
    { signal: "method", pattern: String.raw`\b(?:fansi|faansi|phansi|phaansi|fanda|fandaa) (?:laga|lga) ?(?:lunga|lungi|lu|lena|ke mar|kar mar|dunga)\b|\b(?:zeher|zehar|jeher|jahar|zahar) (?:kha|pi) ?(?:lunga|lungi|lu|lena|ke mar|kar mar|liya|li)\b|\b(?:nas|nass|kalai) (?:kaat|kat|cut) ?(?:lunga|lungi|li|liya|lu|dunga|leti|leta)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`${CLOSE}.{0,40}(?:${SUI}\s?(?:करना चाह|करने (?:की|का|के) (?:कोशिश|सोच|धमकी|प्लान|मन|विचार|बारे|बात)|की कोशिश|के (?:बारे में )?(?:सोच|बात)|कर ले(?:गा|गी)|की धमकी|के (?:ख़?याल|विचार))|मरना चाह(?:ता|ती)|मर जाना चाह|अपनी जान ले|ख़?ुद को (?:मार|नुक़?सान|चोट|काट|ख़?त्म|हर्ट|कट)|नस काट|(?:फाँसी|फांसी|फंदा) लगा|ज़?हर खा|सेल्फ[ -]?हार्म)` },
    { signal: "other-person", pattern: String.raw`${CLOSE_R}.{0,40}(?:${SUI_R} (?:karna chah|krna chah|karne ki (?:koshish|soch|dhamki|baat)|ki koshish|kar lega|kar legi|ki baat|ke bare)|marna chah|khud ko (?:hurt|cut|nuksan|nuksaan|maar|khatam|chot)|apni jaan le|nas kaat|fansi laga|zeher kha|self[- ]?harm)` }
  ])
});
