import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Simplified and Traditional characters side by side. Chinese has no spaces, so no `\b`.
// "我想死你了" ("I miss you to death"), "笑死", "累死了" and "安乐死" (euthanasia) must not trip.
const SUICIDE = String.raw`(?:自杀|自殺|轻生|輕生|寻死|尋死|紫砂|自尽|自盡)`;
const SELF_HARM = String.raw`(?:自残|自殘|自伤|自傷|割腕|割手腕|划手|劃手|割自己|划自己|劃自己|伤害自己|傷害自己|弄伤自己|弄傷自己)`;
// "想死" followed by these is not wanting to die: 想死你了 (miss you), 死后 (after death), 死心 (give up), 死磕, 死守, 死机.
const NOT_DEATH = String.raw`(?!你|您|他|她|它|们|們|后|後|心|磕|守|机|機|记|記|掉你|了你|啦你|咯你)`;
const CLOSE = String.raw`(?:朋友|好友|闺蜜|閨蜜|男朋友|女朋友|男友|女友|老公|老婆|丈夫|妻子|儿子|兒子|女儿|女兒|哥哥|弟弟|姐姐|妹妹|妈妈|媽媽|爸爸|母亲|母親|父亲|父親|孩子|同学|同學|室友|同事|表哥|表姐|表弟|表妹|学生|學生)`;
// "我们" (we) is not the writer alone.
// Adverbs a writer puts between "我" and the verb ("我最近经常…", "我今晚就…").
const ADV = String.raw`(?:真的|真|好|很|已经|已經|有时|有時|有时候|有時候|经常|經常|常常|一直|又|甚至|最近|每天都|每天|也|就|总是|總是|开始|開始|时不时|時不時|今晚|今天|明天|现在|現在|马上|馬上|实在|實在)`;
const I = String.raw`(?:我(?!们|們)|俺|本人)`;

export const ZH: CrisisLexicon = Object.freeze({
  language: "zh",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`${I}(?:真的|真|好|很|是真的|已经|已經|现在|現在|每天都|一直|有点|有點|突然|又|就是)?(?:好)?(?:想|想要)(?:去)?死${NOT_DEATH}` },
    { signal: "intent", pattern: String.raw`${I}${ADV}{0,3}(?:想|要|想要|打算|准备|準備|决定|決定|考虑|考慮|在考虑|在考慮|计划|計劃)(?:去)?${SUICIDE}` },
    { signal: "intent", pattern: String.raw`${I}${ADV}{0,3}(?:有|有过|有過|会有|會有|产生|產生|冒出)(?:了)?${SUICIDE}(?:的)?(?:念头|念頭|想法|倾向|傾向|冲动|衝動)` },
    { signal: "intent", pattern: String.raw`(?:不想|不愿|不願|不愿意|不願意)(?:再)?活(?:了|下去|着了|著了)` },
    { signal: "intent", pattern: String.raw`${I}(?:真的|已经|已經|实在|實在)?不想(?:再)?活(?!在|到|成)` },
    { signal: "intent", pattern: String.raw`(?:活不下去|活不下來|活不下来)了` },
    { signal: "intent", pattern: String.raw`(?:活着|活著)(?:真|好|太|真的|实在|實在)?(?:没意思|沒意思|没有意思|沒有意思|好累|太累|太痛苦|好痛苦|没有意义|沒有意義|没意义|沒意義)` },
    { signal: "intent", pattern: String.raw`(?:结束|結束|了结|了結|了断|了斷)(?:我|自己)(?:的)?(?:生命|性命|一生)` },
    { signal: "intent", pattern: String.raw`(?:了结|了結|了断|了斷)自己` },
    { signal: "intent", pattern: String.raw`${I}.{0,4}(?:死了|去死|不在了)(?:算了|比较好|比較好|更好|最好|一了百了)` },
    { signal: "intent", pattern: String.raw`(?:不如|还不如|還不如)(?:死了|去死)(?:算了)?` },
    { signal: "intent", pattern: String.raw`(?:${SUICIDE}|死了)算了` },
    { signal: "intent", pattern: String.raw`${I}.{0,6}一了百了` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`${I}(?!认为|認為|觉得|覺得|想问|想問|想知道).{0,5}${SELF_HARM}` },
    { signal: "self-harm", pattern: String.raw`(?:自残|自殘|自伤|自傷|割腕)(?:了|过|過|停不下来|停不下來|上瘾|上癮|的习惯|的習慣|戒不掉)` },
    { signal: "self-harm", pattern: String.raw`(?:想|忍不住|控制不住)(?:要)?(?:自残|自殘|割腕|伤害自己|傷害自己)` },
    // decision
    { signal: "decision", pattern: String.raw`${I}(?:是不是|是否|该不该|該不該|应不应该|應不應該|应该|應該|要不要|还要不要|還要不要|到底该不该|到底該不該)(?:去)?(?:死${NOT_DEATH}|${SUICIDE}|结束生命|結束生命|活下去|继续活|繼續活)` },
    { signal: "decision", pattern: String.raw`${I}(?:的)?(?:人生|生命|命)(?:还|還)(?:有|值得)` },
    { signal: "decision", pattern: String.raw`${I}(?:的)?(?:人生|生命|命)值得(?:活|继续|繼續)` },
    { signal: "decision", pattern: String.raw`${I}(?:活着|活著|活下去|继续活|繼續活)(?:还|還)?有(?:什么|什麼|啥)?(?:意义|意義|意思|用)` },
    { signal: "decision", pattern: String.raw`${SUICIDE}(?:是|就是)?(?:我|我的)(?:唯一|最好)的?(?:选择|選擇|出路|办法|辦法)` },
    { signal: "decision", pattern: String.raw`如果${I}死了.{0,10}(?:会有人|會有人|有人会|有人會|有没有人|有沒有人|谁会|誰會)` },
    // method
    { signal: "method", pattern: String.raw`(?:怎么|怎麼|怎样|怎樣|如何|咋)(?:才能|才可以|可以)?(?:${SUICIDE}|去死|死得(?:快|痛快|干脆|乾脆)|结束自己|結束自己|上吊|割腕|跳楼|跳樓|烧炭|燒炭)` },
    { signal: "method", pattern: String.raw`(?:怎么|怎麼|怎样|怎樣|如何|咋)(?:才能|才可以|可以)?(?:无痛|無痛|不痛|没有痛苦地|沒有痛苦地|不痛苦地|快速|安静地|安靜地|轻松地|輕鬆地)(?:地)?死(?!的|了|亡率)` },
    { signal: "method", pattern: String.raw`(?:无痛|無痛|不痛|没有痛苦|沒有痛苦|不痛苦|最快|最简单|最簡單|最轻松|最輕鬆|最有效)的?(?:死法|${SUICIDE}(?:方法|方式)?|死亡方式|死的方法)` },
    { signal: "method", pattern: String.raw`${SUICIDE}的?(?:方法|方式|办法|辦法)(?:有哪些|有什么|有什麼|是什么|是什麼|推荐|推薦)` },
    { signal: "method", pattern: String.raw`致死(?:量|剂量|劑量)` },
    { signal: "method", pattern: String.raw`(?:吃|吞|喝)(?:多少|几|幾).{0,10}(?:会死|會死|能死|才会死|才會死|才能死|致死|死得了)` },
    { signal: "method", pattern: String.raw`(?:几|幾)(?:楼|樓|层|層|米).{0,6}(?:会死|會死|能死|才会死|才會死|必死|摔死)` },
    { signal: "method", pattern: String.raw`${I}${ADV}{0,3}(?:想|要|想要|打算|准备|準備|决定|決定)(?:去)?(?:上吊|跳楼|跳樓|跳河|跳桥|跳橋|跳海|卧轨|臥軌|吞药|吞藥|吞安眠药|吞安眠藥|喝农药|喝農藥|烧炭|燒炭)` },
    { signal: "method", pattern: String.raw`${I}(?:已经|已經)?(?:写|寫|留)(?:好)?(?:了)?(?:遗书|遺書)` },
    { signal: "method", pattern: String.raw`(?:要不要|该不该|該不該|应该|應該)(?:写|寫|留)(?:遗书|遺書)` },
    // other-person
    { signal: "other-person", pattern: String.raw`${CLOSE}.{0,12}(?:想死${NOT_DEATH}|(?:想|要|打算|准备|準備|试图|試圖|企图|企圖|扬言|揚言|说要|說要)(?:去)?${SUICIDE}|(?:在|又|一直|经常|經常|偷偷|开始|開始|总是|總是)${SELF_HARM}|${SELF_HARM}(?:了|过|過)|不想活|有${SUICIDE}(?:的)?(?:念头|念頭|倾向|傾向))` }
  ])
});
