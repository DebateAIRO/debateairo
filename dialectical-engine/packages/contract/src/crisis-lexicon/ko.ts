import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Korean is often typed without spaces ("죽고싶다"), so spaces are optional (`\s?`). Particles
// attach to the word, so `\b` is used only at the start. "배고파 죽겠다", "좋아 죽겠어" and
// "창피해서 죽고 싶다" (hyperbole) must not trip; neither must "죽고 싶냐?" (a threat to someone else).
const NOT_EMBARRASSED = String.raw`(?<!창피해서\s?|쪽팔려서\s?|부끄러워서\s?|민망해서\s?|창피해\s?|쪽팔려\s?)`;
// "…하려고 하는 사람" / "…싶은 청소년": a question about people, not the writer.
const NOT_GENERIC = String.raw`(?!\s?(?:하는|한|하던|은|는|던)?\s?(?:사람|청소년|학생|이들|환자|분들|아이들|사람들|십대|노인))`;
const ME = String.raw`(?:나는|난|내가|나|저는|전|제가|저)`;
const CLOSE = String.raw`(?:친구|절친|남친|여친|남자\s?친구|여자\s?친구|남편|아내|와이프|엄마|아빠|어머니|아버지|동생|언니|오빠|형|누나|아들|딸|룸메|룸메이트|동료|사촌|조카)`;

export const KO: CrisisLexicon = Object.freeze({
  language: "ko",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`${NOT_EMBARRASSED}(?:죽고|뒤지고|죽어\s?버리고)\s?싶(?!지\s?않|진\s?않|냐|니\?)${NOT_GENERIC}` },
    { signal: "intent", pattern: String.raw`자살(?:하고\s?싶|할래|할\s?거|할\s?것|하려고|하기로|해\s?버릴|하겠|할\s?생각|을\s?생각|을\s?결심|하고\s?말|\s?마렵|\s?충동(?:이\s?(?:들|심해|와|생겨|너무)|을\s?(?:느껴|느끼고\s?있|참을\s?수)))${NOT_GENERIC}` },
    { signal: "intent", pattern: String.raw`(?:그냥|차라리|이제)\s?(?:자살할까|죽을까|죽어\s?버릴까|죽어버릴까)` },
    { signal: "intent", pattern: String.raw`자살할까\s?(?:봐|말까|생각|고민)` },
    { signal: "intent", pattern: String.raw`극단(?:적)?\s?선택을?\s?(?:하고\s?싶|할까|하려고|할\s?거|하겠|할\s?생각)${NOT_GENERIC}` },
    { signal: "intent", pattern: String.raw`(?:^|[.!?,]\s?|더\s?이상\s?|이제\s?|그냥\s?|정말\s?|진짜\s?|너무\s?|이제는\s?|그만\s?)(?:살기\s?싫|살고\s?싶지\s?않|살고\s?싶지가\s?않)` },
    { signal: "intent", pattern: String.raw`${NOT_EMBARRASSED}(?:사라지고|없어지고|소멸하고)\s?싶${NOT_GENERIC}` },
    { signal: "intent", pattern: String.raw`(?:죽는\s?게|죽는\s?것이|죽는게)\s?(?:나을|낫|편할|편하)` },
    { signal: "intent", pattern: String.raw`(?:삶을|생을|목숨을|인생을|내\s?삶을|제\s?삶을)\s?(?:끝내고\s?싶|끝낼까|끝내려|끝내기로|마감하고\s?싶|마감하려|스스로\s?끊)` },
    { signal: "intent", pattern: String.raw`${ME}\s?(?:그냥|차라리|이제)?\s?죽어(?:야겠|버릴\s?거|버리고\s?싶|야\s?해)` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`자해(?:를|을)?\s?(?:하고\s?싶|했|해요|해\s?왔|하게\s?돼|하게\s?되|하는\s?(?:게|걸|습관)|하고\s?있|를\s?멈|를\s?끊|를\s?못\s?끊|를\s?해|충동|흉터|자국|합니다|해서|중독|를\s?반복)` },
    { signal: "self-harm", pattern: String.raw`(?:손목|팔|허벅지)(?:을|를)?\s?(?:긋|그어|그었|그을|칼로\s?긋|커터칼로)` },
    { signal: "self-harm", pattern: String.raw`(?:나를|날|저를|제\s?몸을|내\s?몸을|스스로를?|자신을)\s?(?:해치|다치게\s?하고\s?싶|상처\s?내|학대하)` },
    // decision
    { signal: "decision", pattern: String.raw`${ME}\s?(?:그냥|이제|차라리)?\s?(?:죽어야|죽는\s?게\s?맞|자살해야|죽어도\s?될|죽어도\s?되|사라져야)` },
    { signal: "decision", pattern: String.raw`계속\s?살아야\s?(?:할까|하나|하는지|하는\s?이유)` },
    { signal: "decision", pattern: String.raw`왜\s?(?:살아야|사는지|살아야\s?하는지)\s?(?:하는지\s?)?모르겠` },
    { signal: "decision", pattern: String.raw`(?<!에\s?|서\s?)(?:살|살아갈|계속\s?살)\s?(?:가치|이유|의미)가?\s?(?:있을까|있나|있나요|있는지|없어|없다|없는\s?것\s?같|없습니다|없어요)` },
    { signal: "decision", pattern: String.raw`자살(?:이|은)?\s?(?:제|나의|내|저의)\s?(?:유일한|최선의)` },
    { signal: "decision", pattern: String.raw`(?:내가|제가)\s?죽으면\s?.{0,15}(?:슬퍼할|신경\s?쓸|알아챌|그리워할|울어\s?줄)\s?(?:사람|이)` },
    // method
    { signal: "method", pattern: String.raw`(?<!잘\s?)(?:자살(?:하는)?|죽는|죽을\s?수\s?있는)\s?(?:방법|법)(?!\s?(?:정보|을\s?(?:차단|규제|공유하는|다룬)|에\s?대한))` },
    { signal: "method", pattern: String.raw`(?:고통\s?없이|안\s?아프게|편하게|편안하게|확실하게|빨리|쉽게|깔끔하게|조용히)\s?(?:죽는|죽을\s?수\s?있는|자살하는|자살할\s?수\s?있는)\s?(?:방법|법|약|곳|장소)` },
    { signal: "method", pattern: String.raw`어떻게\s?(?:하면\s?)?(?:편하게\s?|확실하게\s?)?(?:죽을\s?수|자살할\s?수|자살하|죽을까)` },
    { signal: "method", pattern: String.raw`치사량` },
    { signal: "method", pattern: String.raw`(?:수면제|약|타이레놀|진통제|신경안정제|수면유도제).{0,10}(?:몇\s?(?:알|개|정|통)|얼마나).{0,10}(?:먹으면|먹어야|삼키면)\s?(?:죽|사망)` },
    { signal: "method", pattern: String.raw`몇\s?층.{0,10}(?:뛰어내리면|떨어지면|투신하면)\s?(?:죽|즉사|사망)` },
    { signal: "method", pattern: String.raw`목(?:을)?\s?(?:매|매달)(?:고\s?싶|아\s?죽|어\s?죽|는\s?방법|려고|아야|을까)` },
    { signal: "method", pattern: String.raw`(?:번개탄|연탄)\s?(?:을\s?)?(?:피우|피워|자살)` },
    { signal: "method", pattern: String.raw`(?:뛰어내리고|투신하고|투신할|뛰어내릴)\s?(?:싶|거|까|래)` },
    { signal: "method", pattern: String.raw`유서(?:를)?\s?(?:썼|써\s?놓|쓰고\s?있|써야|쓸까|작성했)` },
    // other-person
    { signal: "other-person", pattern: String.raw`${CLOSE}(?:가|이|는|도)\s?.{0,15}(?:죽고\s?싶|자살(?:하려|하고\s?싶|할\s?것|시도|을\s?시도|을\s?암시|하겠다|할까\s?봐)|자해(?:를|를\s?해|해|하고|했)|극단적\s?선택(?:을\s?하려|을\s?시도))` }
  ])
});
