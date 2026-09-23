import { describe,expect,it } from "vitest";

import {
  analyzeRecoverySemantics,type PredicatePolarity
} from "../../apps/api/src/support/recovery-intent.js";

type Language = "en" | "ro";
type Expected = Readonly<{
  navigation: PredicatePolarity;
  credentialOperation: PredicatePolarity;
}>;

const FORMS: Readonly<Record<Language,Readonly<{
  subjects: readonly string[];
  navigation: (subject: string) => readonly string[];
  affirmativeOperation: (subject: string) => readonly string[];
  negatedOperation: (subject: string) => readonly string[];
  join: (left: string,right: string,reverse: boolean) => string;
}>>> = Object.freeze({
  en:Object.freeze({
    subjects:Object.freeze(["my password","a forgotten password"]),
    navigation:(subject: string) => Object.freeze([
      `show me the recovery page for ${subject}`,
      `where can I find the recovery link for ${subject}`
    ]),
    affirmativeOperation:(subject: string) => Object.freeze([
      `reset ${subject} for me`,
      `Support must validate the reset token for ${subject}`
    ]),
    negatedOperation:(subject: string) => Object.freeze([
      `do not reset ${subject}`,
      `Support must not validate the reset token for ${subject}`,
      `I don’t want Support to submit the reset for ${subject}`
    ]),
    join:(left: string,right: string,reverse: boolean) => reverse
      ? `${right}; but ${left}.`
      : `${left}, and then ${right}.`
  }),
  ro:Object.freeze({
    subjects:Object.freeze(["parola mea","o parolă uitată"]),
    navigation:(subject: string) => Object.freeze([
      `arată-mi pagina de recuperare pentru ${subject}`,
      `unde găsesc linkul de recuperare pentru ${subject}`
    ]),
    affirmativeOperation:(subject: string) => Object.freeze([
      `resetează ${subject} în locul meu`,
      `Asistența trebuie să valideze tokenul de resetare pentru ${subject}`
    ]),
    negatedOperation:(subject: string) => Object.freeze([
      `nu reseta ${subject}`,
      `Asistența nu trebuie să valideze tokenul de resetare pentru ${subject}`,
      `nu vreau ca Asistența să trimită resetarea pentru ${subject}`
    ]),
    join:(left: string,right: string,reverse: boolean) => reverse
      ? `${right}; dar ${left}.`
      : `${left}, iar apoi ${right}.`
  })
});

function expectSemantics(text: string,language: Language,expected: Expected): void {
  expect(analyzeRecoverySemantics(text,language),text).toEqual({ language,...expected });
}

describe("CP1 recovery predicate semantics", () => {
  for (const language of ["en","ro"] as const) {
    const forms = FORMS[language];
    for (const subject of forms.subjects) {
      for (const navigation of forms.navigation(subject)) {
        it(`recognizes ${language} affirmative navigation: ${navigation}`, () => {
          expectSemantics(navigation,language,{
            navigation:"AFFIRMATIVE",credentialOperation:"ABSENT"
          });
        });
        for (const operation of forms.affirmativeOperation(subject)) {
          for (const reverse of [false,true]) {
            const text = forms.join(operation,navigation,reverse);
            it(`keeps ${language} affirmative operation and navigation by clause order: ${text}`, () => {
              expectSemantics(text,language,{
                navigation:"AFFIRMATIVE",credentialOperation:"AFFIRMATIVE"
              });
            });
          }
        }
        for (const operation of forms.negatedOperation(subject)) {
          for (const reverse of [false,true]) {
            const text = forms.join(operation,navigation,reverse);
            it(`keeps ${language} negation attached only to the operation clause: ${text}`, () => {
              expectSemantics(text,language,{
                navigation:"AFFIRMATIVE",credentialOperation:"NEGATED"
              });
            });
          }
        }
      }
      for (const operation of forms.affirmativeOperation(subject)) {
        it(`recognizes ${language} affirmative operation without navigation: ${operation}`, () => {
          expectSemantics(operation,language,{
            navigation:"ABSENT",credentialOperation:"AFFIRMATIVE"
          });
        });
      }
      for (const operation of forms.negatedOperation(subject)) {
        it(`recognizes ${language} negated operation without navigation: ${operation}`, () => {
          expectSemantics(operation,language,{
            navigation:"ABSENT",credentialOperation:"NEGATED"
          });
        });
      }
    }
  }

  it.each([
    ["en","Reset my password and give me the recovery link.","AFFIRMATIVE","AFFIRMATIVE"],
    ["en","Do not reset my password; just show me where I can recover it.","AFFIRMATIVE","NEGATED"],
    ["en","Can you check where the password reset page is?","AFFIRMATIVE","ABSENT"],
    ["en","I am not asking to reset a password. Where is Help?","ABSENT","NEGATED"],
    ["ro","Resetează-mi parola și dă-mi linkul de recuperare.","AFFIRMATIVE","AFFIRMATIVE"],
    ["ro","Nu-mi reseta parola; arată-mi doar unde o pot recupera.","AFFIRMATIVE","NEGATED"],
    ["ro","Verifică unde este pagina de resetare a parolei.","AFFIRMATIVE","ABSENT"],
    ["ro","Nu cer resetarea parolei. Unde găsesc Ajutor?","ABSENT","NEGATED"]
  ] as const)("preserves witnessed %s clause behavior: %s",(
    language,text,navigation,credentialOperation
  ) => {
    expectSemantics(text,language,{ navigation,credentialOperation });
  });

  it.each([
    ["en","The password policy article describes account safety."],
    ["en","Recovery time after a service incident is five minutes."],
    ["en","The reset token expires after the documented interval."],
    ["ro","Articolul despre parole descrie siguranța contului."],
    ["ro","Timpul de recuperare după incident este de cinci minute."],
    ["ro","Codul de resetare expiră după intervalul documentat."]
  ] as const)("keeps benign %s vocabulary outside recovery intent: %s",(language,text) => {
    expectSemantics(text,language,{ navigation:"ABSENT",credentialOperation:"ABSENT" });
  });

  it.each([
    ["en","Validate my reset token for me."],
    ["en","Please submit the reset code."],
    ["en","Support must check this reset token."],
    ["en","Please verify this recovery code."],
    ["en","Submit my recovery token."],
    ["ro","Validează codul de resetare pentru mine."],
    ["ro","Te rog trimite tokenul de resetare."],
    ["ro","Asistența trebuie să verifice codul de resetare."],
    ["ro","Verifică tokenul de recuperare."],
    ["ro","Trimite codul de recuperare."]
  ] as const)("recognizes a %s credential operation from its reset token/code subject: %s",(
    language,text
  ) => {
    expectSemantics(text,language,{ navigation:"ABSENT",credentialOperation:"AFFIRMATIVE" });
  });

  it.each([
    ["en","Do not verify this recovery code."],
    ["en","Support must not submit my recovery token."],
    ["ro","Nu verifica tokenul de recuperare."],
    ["ro","Asistența nu trebuie să trimită codul de recuperare."]
  ] as const)("keeps a negated %s recovery credential operation non-affirmative: %s",(
    language,text
  ) => {
    expectSemantics(text,language,{ navigation:"ABSENT",credentialOperation:"NEGATED" });
  });

  it.each([
    ["en","Do not validate my reset token, reset my password for me."],
    ["en","Do not validate my reset token; reset my password for me."],
    ["en","Do not validate my reset token, but reset my password for me."],
    ["ro","Nu valida tokenul de resetare, resetează-mi parola."],
    ["ro","Nu valida tokenul de resetare; resetează-mi parola."],
    ["ro","Nu valida tokenul de resetare, dar resetează-mi parola."]
  ] as const)("keeps %s negation local across predicate boundaries: %s",(language,text) => {
    expectSemantics(text,language,{ navigation:"ABSENT",credentialOperation:"AFFIRMATIVE" });
  });

  it("preserves predicate-local polarity over bounded punctuation and conjunction transforms", () => {
    const controls = [
      {
        language:"en",negated:"Do not validate my reset token",
        affirmative:"reset my password for me",separators:[", ","; ",". "," but "]
      },
      {
        language:"ro",negated:"Nu valida tokenul de resetare",
        affirmative:"resetează-mi parola",separators:[", ","; ",". "," dar "]
      }
    ] as const;
    for (const control of controls) {
      for (const separator of control.separators) {
        expectSemantics(
          `${control.negated}${separator}${control.affirmative}.`,
          control.language,
          { navigation:"ABSENT",credentialOperation:"AFFIRMATIVE" }
        );
      }
    }
  });
});
