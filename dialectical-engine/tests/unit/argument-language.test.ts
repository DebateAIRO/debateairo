import { describe, expect, it } from "vitest";

import { detectArgumentLanguage } from "@debateai/kernel";

const CASES = [
  ["ro", "Romanian", "Ar trebui ca România să investească mai mult în transportul public, deoarece orașele au nevoie de aer mai curat."],
  ["en", "English", "Should the government fund public transit when it can reduce congestion and improve access to work?"],
  ["fr", "French", "La ville devrait-elle financer les transports publics, car ils sont utiles pour les habitants et pour le climat ?"],
  ["de", "German", "Sollte die Stadt den öffentlichen Verkehr ausbauen, weil er für die Bürger und für das Klima wichtig ist?"],
  ["es", "Spanish", "¿Debería la ciudad invertir en transporte público porque es mejor para los ciudadanos y para el clima?"],
  ["it", "Italian", "La città dovrebbe investire nel trasporto pubblico perché è utile per i cittadini e per il clima?"],
  ["pt", "Portuguese", "A cidade deveria investir em transporte público porque é melhor para os cidadãos e para o clima?"],
  ["pl", "Polish", "Czy państwo powinno więcej inwestować w transport publiczny, ponieważ jest on ważny dla ludzi i dla klimatu?"],
  ["ar", "Arabic", "هل ينبغي للحكومة أن تستثمر أكثر في النقل العام لأنه يفيد المجتمع ويقلل التلوث؟"],
  ["he", "Hebrew", "האם הממשלה צריכה להשקיע יותר בתחבורה ציבורית כדי להפחית זיהום ולשפר את הגישה לעבודה?"],
  ["zh", "Chinese", "政府是否应该增加公共交通投资，以减少拥堵并改善居民的出行机会？"],
  ["ja", "Japanese", "政府は渋滞を減らし市民の移動を改善するために、公共交通へもっと投資すべきでしょうか。"],
  ["ko", "Korean", "정부는 혼잡을 줄이고 시민의 이동권을 개선하기 위해 대중교통에 더 투자해야 할까요?"],
  ["ru", "Russian", "Должно ли государство больше инвестировать в общественный транспорт, чтобы уменьшить пробки и загрязнение?"],
  ["uk", "Ukrainian", "Чи має держава більше інвестувати у громадський транспорт, щоб зменшити затори й поліпшити якість повітря?"],
  ["bg", "Bulgarian", "Трябва ли държавата да инвестира повече в обществения транспорт, за да намали задръстванията и замърсяването?"],
  ["el", "Greek", "Πρέπει η κυβέρνηση να επενδύσει περισσότερο στις δημόσιες συγκοινωνίες για να μειώσει τη ρύπανση;"],
  ["hi", "Hindi", "क्या सरकार को भीड़ और प्रदूषण कम करने के लिए सार्वजनिक परिवहन में अधिक निवेश करना चाहिए?"],
  ["tr", "Turkish", "Hükümet, trafik sıkışıklığını azaltmak ve halkın işe erişimini iyileştirmek için toplu taşımaya daha çok yatırım yapmalı mı?"],
] as const;

describe("detectArgumentLanguage", () => {
  it.each(CASES)("detects %s debate prose", (tag, nameEn, text) => {
    expect(detectArgumentLanguage(text)).toEqual({ tag, nameEn, confidence: "high" });
  });

  it("falls back instead of guessing a short ambiguous claim", () => {
    expect(detectArgumentLanguage("Mai bine?")).toEqual({
      tag: "und",
      nameEn: "the same language as the question",
      confidence: "low"
    });
  });
});
