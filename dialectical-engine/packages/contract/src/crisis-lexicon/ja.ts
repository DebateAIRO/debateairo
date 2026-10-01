import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Japanese has no spaces, so no `\b`. "死ぬほど疲れた", "暑くて死にそう", "恥ずかしくて死にたい"
// and "生きるべきか死ぬべきか" (Hamlet) must not trip. Online spellings: しにたい, 氏にたい, タヒにたい
// (NFKC folds half-width ﾀﾋ to タヒ), リスカ/アムカ (cutting), OD (overdose).
const ME = String.raw`(?:私|わたし|僕|ぼく|俺|おれ|オレ|自分|うち|あたし|わたくし)`;
// Hyperbole: "so embarrassed I want to die / disappear".
const NOT_EMBARRASSED = String.raw`(?<!恥ずかしくて|はずかしくて|恥ずかしすぎて|恥ずかしさで|恥ずかしい|気まずくて|照れくさくて)`;
const CLOSE = String.raw`(?:友達|友だち|友人|親友|彼氏|彼女|夫|妻|旦那|嫁|息子|娘|兄|弟|姉|妹|母|父|母親|父親|子ども|子供|同僚|後輩|先輩|生徒|クラスメイト|ルームメイト|いとこ)`;

export const JA: CrisisLexicon = Object.freeze({
  language: "ja",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`${NOT_EMBARRASSED}(?:死にたい|しにたい|シニタイ|氏にたい|タヒにたい|タヒりたい|死にてぇ|死にてえ|死にてー|死にたく(?:なる|なった|なって|なります))(?!くらい|ぐらい|ほど|」|』)` },
    { signal: "intent", pattern: String.raw`${NOT_EMBARRASSED}(?:消えたい|きえたい|消えてしまいたい|消えてなくなりたい|いなくなりたい|この世から消え)(?!くらい|ぐらい|ほど|」|』)` },
    { signal: "intent", pattern: String.raw`自殺(?:したい|しようかな|しよう(?!と(?:する|した|している)(?:人|若者|者|方|子))|するしかない|するつもり|する予定|を決め|を決意|しちゃおう|しそう|してしまいたい|したくなる)` },
    { signal: "intent", pattern: String.raw`自殺を考えて(?:います|いる|る|ます)(?!人|若者|方|子|者|学生|患者|中高生|ひと|生徒)` },
    { signal: "intent", pattern: String.raw`(?:希死念慮|自殺願望|自殺念慮)(?:が|は)(?:あります|あって|ある(?!人|方|若者|患者|者|子)|強|消えない|止まらない|ひどい|出て|なくならない)` },
    { signal: "intent", pattern: String.raw`(?:生きて(?:い)?たくない|生きたくない|もう生きられない|生きるのが(?:つらい|辛い|しんどい|疲れた|もう無理|嫌になった))` },
    { signal: "intent", pattern: String.raw`${ME}(?:なんか|なんて|は|が|も)?(?:もう|いっそ)?(?:死んだ|いなくなった|消えた)(?:ほう|方)が(?:まし|マシ|いい|楽)` },
    { signal: "intent", pattern: String.raw`もう死んだ(?:ほう|方)が` },
    { signal: "intent", pattern: String.raw`(?:もう|いっそ|いっそのこと)?死のう(?:かな|と思|と決|か)` },
    { signal: "intent", pattern: String.raw`(?:人生を終わりにしたい|人生を終わらせたい|人生終わりにしたい|命を絶(?:ちたい|とう|つつもり|つしかない))` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`(?:リスカ|アムカ|レグカ)` },
    { signal: "self-harm", pattern: String.raw`(?:リストカット|自傷(?:行為)?)(?:を)?(?:して(?:しまう|しまい|しまった|る|います|いる|ます)|した|しちゃ|したい|がやめられ|をやめられ|が止まら|を止められ|の癖|癖|がひどく|の跡|痕)` },
    { signal: "self-harm", pattern: String.raw`(?:手首|腕|太もも|足)を(?:切って(?:しまう|しまい|しまった|いる|る|います)|切った|切りたい|切っちゃ|切るのが|切る癖)` },
    { signal: "self-harm", pattern: String.raw`(?:カッター|カミソリ|剃刀)で(?:手首|腕|自分)` },
    { signal: "self-harm", pattern: String.raw`(?:od|オーバードーズ|過量服薬)(?:を)?(?:した|しちゃ|しそう|したい|して(?:しまい|しまった|る|います))` },
    { signal: "self-harm", pattern: String.raw`自分を(?:傷つけ|傷付け|痛めつけ)(?:たい|て(?:しまう|しまい|しまった|いる|る|います)|た|ちゃう|ちゃった)` },
    // decision
    { signal: "decision", pattern: String.raw`${ME}(?:は|が|って|も)?(?:もう)?(?:死ぬべき|死んだ(?:ほう|方)がいい|生きる(?:価値|意味)(?:は|が|って)?(?:ない|ありますか|ある(?:の|ん)?(?:か|でしょうか|かな|\?))|生きていていい|生きてていい|生きてる意味|生きている意味|生きてる価値|生きている価値)` },
    { signal: "decision", pattern: String.raw`(?:もう死んでもいい(?:ですか|でしょうか|かな|よね)|死んでもいい(?:ですか|でしょうか))` },
    { signal: "decision", pattern: String.raw`生きてる意味(?:が|って|は|も)?(?:ない|ある|あるの|わからない|分からない)` },
    { signal: "decision", pattern: String.raw`生きる意味(?:が|も)(?:ない|分からない|わからない|見つからない)(?!のか|としたら|なら|と言える|のでは)` },
    { signal: "decision", pattern: String.raw`${ME}(?:が)?死んだら.{0,10}(?:悲しむ|気にする|気づく|困る|泣く)(?:人|ひと)` },
    // method
    { signal: "method", pattern: String.raw`(?:楽に|確実に|痛くなく|痛みなく|苦しまずに|苦しまず|簡単に|安楽に|静かに|きれいに|綺麗に|すぐに)死(?:ねる|ぬ|ねます)(?:方法|やり方|手段|薬|場所|か)` },
    { signal: "method", pattern: String.raw`(?:楽な|痛くない|苦しくない|確実な|簡単な|一番楽な|綺麗な|きれいな)(?:死に方|自殺(?:の)?(?:方法|仕方|やり方))` },
    { signal: "method", pattern: String.raw`(?:死に方(?:を)?教えて|死ねる方法)` },
    { signal: "method", pattern: String.raw`死ぬ方法(?:を)?(?:教え|知りたい|探し|調べ|は(?:ありますか|何)|って|ある\?|ないかな)` },
    { signal: "method", pattern: String.raw`自殺(?:の)?(?:方法|仕方|やり方|手段)(?:を)?(?:教え|知りたい|探し|調べ|は(?:ありますか|何)|って|で一番|で楽|で確実|ある\?)` },
    { signal: "method", pattern: String.raw`致死量` },
    { signal: "method", pattern: String.raw`(?:何錠|何粒|何mg|何ミリ|どれくらい|どのくらい|どれだけ).{0,12}(?:飲めば|飲んだら|飲むと|で)(?:死ね|死ぬ|確実に死)` },
    { signal: "method", pattern: String.raw`何階から.{0,6}(?:飛び降りれば|飛び降りたら|落ちたら|落ちれば)(?:死ね|死ぬ|確実)` },
    { signal: "method", pattern: String.raw`(?:首(?:を)?(?:吊り|吊る|つり|つる)(?:たい|ます|ましょう|方法|やり方|ロープ)|首吊り(?:自殺)?(?:の)?(?:方法|やり方|したい|しよう)|首を吊(?:りたい|ろう|ろうと))` },
    { signal: "method", pattern: String.raw`(?:飛び降り(?:たい|よう|ようかな|ようと思|自殺(?:したい|しよう))|(?:電車|線路|ホーム)に飛び込(?:みたい|もう|む(?:つもり|しか)))` },
    { signal: "method", pattern: String.raw`(?:練炭(?:自殺|を焚|で死)|遺書(?:を)?(?:書いた|書きました|書こう|書くべき|準備))` },
    // other-person
    { signal: "other-person", pattern: String.raw`${CLOSE}(?:が|は|も)(?:最近|ずっと|また)?.{0,10}(?:死にたい|消えたい|自殺(?:したい|しよう|をほのめか|しそう|未遂|を考えて|するかも)|自傷(?:行為)?(?:を)?(?:して|した|を繰り返)|リスカ|リストカット(?:を)?(?:して|した)|od(?:した|して|しちゃ)|オーバードーズ)` }
  ])
});
