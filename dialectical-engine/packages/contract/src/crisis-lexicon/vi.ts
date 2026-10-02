import type { CrisisLexicon, CrisisPattern, CrisisSignal } from "./types.js";

// Vietnamese. Normalisation strips the tone and vowel marks ("tự tử" → "tu tu") but keeps "đ",
// which people typing without marks write as "d": every "đ" below is widened to "[dđ]".
// Stripped, "tự tử" (suicide) and "từ từ" (slowly) are the same letters, and "tự vẫn" (suicide)
// equals "tư vấn" (advice). So every phrase built on those words is ALSO listed accent-exact
// (`accents: "keep"`): the key word must be spelled "tự tử"/"tự vẫn", or "tu tu" typed with no
// marks at all, while the words around it may carry their marks or not. The folded lists
// never contain "tu tu" or "tu van". "mệt muốn chết", "nhớ em muốn chết", "cười muốn chết"
// (hyperbole) must not trip.
const FP = String.raw`(?:tôi|mình|em|tao|tớ|tui|con|t)`;
const NOT_OBJECT = String.raw`(?<!nhớ |yêu |thương |ghét |chờ |đợi |cười |mệt |đói |nóng )`;
const ADV = String.raw`(?:thật sự|thực sự|thật|rất|chỉ|đang|lại|cũng|vẫn|cứ|luôn|hay|thường|bây giờ|giờ|hôm nay|tối nay|đêm nay|quá|thiệt|mỗi ngày|nhiều lúc|đôi khi|đã|có lúc|nhiều khi|thật lòng|rất là|chắc|chắc là|thì|là|nay|lúc này|bắt đầu)`;
const WANT = String.raw`(?:muốn|mún|chỉ muốn|định|tính|có ý định|nghĩ đến|nghĩ tới|nghĩ đến chuyện|nghĩ tới chuyện|nghĩ đến việc|quyết định|lên kế hoạch|muốn được)`;
// "chết" that is not "chết cười / chết đói / chết mê / chết mất…".
const CHET = String.raw`chết(?! cười| ngất| mê| cha| tiệt| đói| khát| rét| mệt| mất| của| trong| ở| à\b| hả\b| sao\b| hay sao| nóng)`;
// Suicide words whose folded spelling is unambiguous.
const SUICIDE_FOLDED = String.raw`(?:tự sát|quyên sinh|tự kết liễu|tự tận|kết liễu (?:bản thân|cuộc đời|đời mình|mình|chính mình))`;
// Where an accent-kept pattern puts its suicide word (see KEY below).
const SLOT = "§";
const NEG = String.raw`(?:không|ko|k|hok|hông|hong|kh|khum|hem|chẳng|chả|hổng)`;
const CLOSE = String.raw`(?:bạn|bạn thân|bạn trai|bạn gái|người yêu|ny|chồng|vợ|con trai|con gái|con|em trai|em gái|anh trai|chị gái|mẹ|bố|ba|má|đồng nghiệp|bạn cùng phòng|học sinh|cháu|em họ|anh họ)`;

function build(SUICIDE: string): readonly Readonly<{ signal: CrisisSignal; pattern: string }>[] {
  return [
  // intent
  { signal: "intent", pattern: String.raw`${NOT_OBJECT}\b${FP} (?:${ADV} ){0,3}${WANT} (?:đi )?(?:${SUICIDE}|${CHET})` },
  { signal: "intent", pattern: String.raw`\b${FP} (?:${ADV} ){0,3}(?:sẽ|sắp|phải) (?:đi )?${SUICIDE}` },
  { signal: "intent", pattern: String.raw`\b${NEG} (?:còn )?(?:muốn|mún|thiết) (?:sống|tiếp tục sống|sống tiếp) (?:nữa|tiếp nữa)\b` },
  { signal: "intent", pattern: String.raw`\b${NEG} (?:còn )?(?:muốn|mún) (?:sống|tiếp tục sống|sống tiếp)\s*(?:$|[.!?,;…])` },
  { signal: "intent", pattern: String.raw`\b(?:chẳng|chả|không|ko|k) (?:còn )?thiết sống\b` },
  { signal: "intent", pattern: String.raw`\b${FP} (?:còn )?sống (?:tiếp )?(?:để |còn )?(?:làm gì|làm chi|có ý nghĩa gì|vô nghĩa|còn ý nghĩa gì)` },
  { signal: "intent", pattern: String.raw`\b${FP} (?:${ADV} ){0,2}(?:chán sống|mệt mỏi với cuộc sống|không muốn tồn tại|muốn biến mất (?:khỏi|mãi mãi|vĩnh viễn))(?! ở| tại| với)` },
  { signal: "intent", pattern: String.raw`(?<!quyền |quyền được |được )\b(?:kết thúc|chấm dứt|kết liễu) (?:cuộc đời|cuộc sống|đời|sinh mạng|mạng sống) (?:của )?(?:mình|tôi|tao|em|bản thân)\b` },
  { signal: "intent", pattern: String.raw`\bchết (?:quách |phứt )?(?:đi )?(?:cho xong|cho rồi|cho khỏe|cho nhẹ nợ|cho xong chuyện)\b` },
  { signal: "intent", pattern: String.raw`\bsống (?:không bằng|chẳng bằng|không khác gì) chết\b` },
  // self-harm
  { signal: "self-harm", pattern: String.raw`\b${FP} (?:${ADV} ){0,3}(?:muốn |hay |thường |lại |đang |vẫn |cứ |bắt đầu |không ngừng |không thể ngừng |đã |không thể dừng )?(?:tự )?(?:làm hại|làm đau|làm tổn thương|hành hạ|rạch|cắt|cứa) (?:bản thân|chính mình|tay|cổ tay|ven|đùi|mình)\b` },
  { signal: "self-harm", pattern: String.raw`\b(?:tự )?rạch (?:cổ )?tay\b` },
  { signal: "self-harm", pattern: String.raw`\btự (?:cắt|cứa) (?:tay|cổ tay|ven|đùi)\b` },
  { signal: "self-harm", pattern: String.raw`\b(?:để|cách|muốn|không thể|sao|giúp|${FP}) (?:${ADV} )?(?:ngừng|dừng|bỏ|cai|thôi) (?:việc )?tự (?:làm hại|làm đau|hại|rạch tay|cắt tay)` },
  // decision
  { signal: "decision", pattern: String.raw`\b${FP} (?:có )?(?:nên|phải) (?:${SUICIDE}|${CHET}|kết thúc cuộc đời|kết thúc cuộc sống|sống tiếp|tiếp tục sống)\b(?! ở| tại| với| cùng| như)` },
  { signal: "decision", pattern: String.raw`\bcó nên ${SUICIDE} (?:không|ko|k|hay không|hông|hả|ha)\b` },
  { signal: "decision", pattern: String.raw`\b(?:cuộc đời|cuộc sống|đời|mạng sống) (?:của )?${FP} (?:có |còn |có còn |không còn |chẳng còn )?(?:đáng sống|ý nghĩa gì|giá trị gì|lý do gì)` },
  { signal: "decision", pattern: String.raw`\bnếu ${FP} (?:${CHET}|mất đi|biến mất|không còn|${SUICIDE}).{0,30}\b(?:ai|có ai|liệu có ai|mọi người) (?:quan tâm|buồn|nhớ|để ý|nhận ra|khóc|cần)` },
  { signal: "decision", pattern: String.raw`\b(?:${SUICIDE}|chết) (?:là|có phải là|mới là) (?:cách|lối|con đường|lựa chọn) (?:giải thoát|thoát|duy nhất|tốt nhất)(?: duy nhất| tốt nhất)? (?:cho|của) (?:tôi|mình|em|tao)\b` },
  { signal: "decision", pattern: String.raw`\b(?:lý do|lí do) (?:để )?(?:tiếp tục sống|sống tiếp)\b` },
  { signal: "decision", pattern: String.raw`\b(?:lý do|lí do) (?:để )?(?:không|đừng) ${SUICIDE}` },
  // method
  { signal: "method", pattern: String.raw`\b(?:cách|làm sao|làm thế nào|bằng cách nào|làm cách nào|phương pháp) (?:để )?(?:${SUICIDE}|${CHET}|treo cổ|thắt cổ)` },
  { signal: "method", pattern: String.raw`\bchết (?:mà )?(?:không|ko|k|chẳng|ít) (?:đau|bị đau|thấy đau|đau đớn)\b` },
  { signal: "method", pattern: String.raw`\b${SUICIDE} (?:không đau|nhẹ nhàng|nhanh nhất|ít đau)` },
  { signal: "method", pattern: String.raw`\b(?:uống|nuốt|dùng|ăn) (?:bao nhiêu|mấy) (?:viên|liều|hộp|vỉ|gram|mg)?.{0,25}(?:thì|sẽ|để|mới|là|có) (?:chết|tử vong|quá liều)` },
  { signal: "method", pattern: String.raw`\bliều (?:lượng )?(?:gây chết|chết người|gây tử vong|tối thiểu gây chết)\b` },
  { signal: "method", pattern: String.raw`\b(?:tầng|lầu) (?:mấy|bao nhiêu|thứ mấy).{0,20}(?:nhảy xuống|rơi xuống|nhảy).{0,10}(?:chết|tử vong)` },
  { signal: "method", pattern: String.raw`\b${FP} (?:${ADV} ){0,3}(?:${WANT}|sẽ|sắp) (?:đi )?(?:nhảy lầu|nhảy cầu|nhảy sông|treo cổ|thắt cổ|uống thuốc chuột|uống thuốc sâu|uống thuốc trừ sâu|uống cả lọ thuốc|uống hết thuốc|lao vào xe|đâm đầu vào xe)` },
  { signal: "method", pattern: String.raw`\b${FP} (?:${ADV} ){0,3}(?:muốn |định |nên |có nên |sẽ )?(?:viết|để lại|soạn) (?:xong )?(?:một )?(?:lá )?thư tuyệt mệnh` },
  // other-person
  { signal: "other-person", pattern: String.raw`\b${CLOSE} (?:của )?(?:tôi|mình|em|tao|tui|tớ)\b.{0,30}\b(?:(?:muốn|mún|định|dọa|tính|có ý định|đã thử|thử|nghĩ đến|nói muốn|bảo muốn|đòi) (?:đi )?(?:${SUICIDE}|${CHET}|kết thúc cuộc đời)|(?:tự )?(?:rạch|cắt) (?:tay|cổ tay)|tự (?:làm hại|làm đau|hành hạ) (?:bản thân|chính mình)|không muốn sống nữa)` }
];
}

/** Each accented letter may also be typed bare ("muốn" or "muon"); "đ" may be "d". */
function eitherMarks(source: string): string {
  return [...source].map((letter) => {
    if (letter === "đ") return "[đd]";
    const bare = letter.normalize("NFD")[0] ?? letter;
    return bare !== letter && /[a-z]/u.test(bare) ? `[${letter}${bare}]` : letter;
  }).join("");
}

// The accent-exact suicide words: "tự tử" (and its typos), "tu tu" typed with no marks at all
// (unless "từ từ" + verb, e.g. "tu tu tim hieu"), and "tự vẫn"/"tự vận". "từ từ" and "tư vấn"
// never match.
const FROM_TU_TU_VERBS = eitherMarks("học|tìm|làm|tan|trả|giảm|thay|nghĩ|hiểu|cai|bỏ|xem|đọc|chạy|ăn|uống|tăng|đưa|tiết|phát|xây|nâng|chuyển|lên|xuống|tiến|tập|thử|quên|mua|bán|chơi|tích|kiếm|sửa|ra|vào|về|nói|viết|kể|mở|đóng|trở|biến|hồi|phục|khỏi|cảm|thích|yêu|quay|nhìn|bước|thôi");
const KEY = String.raw`(?:tự tử|tự tữ|tự tủ|tự tu|tu tử|tu tu(?! (?:${FROM_TU_TU_VERBS})\b)|tự vẫn|tự vận|${SUICIDE_FOLDED})`;

const FOLDED: readonly CrisisPattern[] = build(SUICIDE_FOLDED).map((entry) => Object.freeze({
  signal: entry.signal,
  pattern: entry.pattern.replaceAll("đ", "[dđ]")
}));

const ACCENT_EXACT: readonly CrisisPattern[] = build(SLOT)
  .filter((entry) => entry.pattern.includes(SLOT))
  .map((entry) => Object.freeze({
    signal: entry.signal,
    pattern: eitherMarks(entry.pattern).replaceAll(SLOT, KEY),
    accents: "keep" as const
  }));

export const VI: CrisisLexicon = Object.freeze({
  language: "vi",
  patterns: Object.freeze<CrisisPattern[]>([...FOLDED, ...ACCENT_EXACT])
});
