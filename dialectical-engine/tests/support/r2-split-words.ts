// OWNER WORDING — approve before switch-on (ruling Q1, option 1; this rename ships live at R2b's upload, engine 1 included).
/**
 * R2, ruling Q1 option 1: each locale's word for SPLIT is the word it used for CONTESTED before R2
 * (`home.verdict.contested` = `debateDrawers.verdict.contested` = `archive.verdictContested`, identical in all 35
 * locales at 1bc8f549b, pre-flight PF-R2b4.10). CONTESTED's words become the locale's existing story label, `public.story.label.contested`.
 */
export const SPLIT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  ar: "موضع نزاع", bg: "Оспорено", cs: "Sporné", da: "Bestridt", de: "Umstritten", el: "Αμφισβητούμενο", en: "Contested",
  es: "Cuestionada", et: "Vaidlustatud", fi: "Kiistanalainen", fr: "Contesté", ga: "Faoi chonspóid", he: "שנוי במחלוקת",
  hi: "विवादित", hr: "Osporeno", hu: "Vitatott", id: "Diperdebatkan", it: "Contestata", ja: "見解が対立", ko: "논쟁 중",
  lt: "Ginčijamas", lv: "Apstrīdēts", mt: "Ikkontestat", nl: "Betwist", pl: "Kwestionowana", pt: "Contestado",
  ro: "Contestat", ru: "Спорный", sk: "Sporné", sl: "Izpodbijano", sv: "Omstritt", tr: "Tartışmalı", uk: "Оспорено",
  vi: "Còn tranh cãi", zh: "有争议"
});
