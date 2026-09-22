const rows = [
  { sequence:1,mode:"full",language:"en",topic:"identity",prompt:"What is Dialectical-Engine?",branch:"MODEL",topSourceId:"product-identity",navigation:null },
  { sequence:2,mode:"full",language:"ro",topic:"identity",prompt:"Ce este Dialectical Engine?",branch:"MODEL",topSourceId:"product-identity",navigation:null },
  { sequence:3,mode:"full",language:"en",topic:"export",prompt:"How do I export my debate from Dialectical-Engine?",branch:"MODEL",topSourceId:"export-json",navigation:null },
  { sequence:4,mode:"full",language:"ro",topic:"publish",prompt:"Cum public o dezbatere în DebateAIRO?",branch:"MODEL",topSourceId:"publish-a-debate",navigation:null },
  { sequence:5,mode:"full",language:"en",topic:"creation",prompt:"How do I create a debate?",branch:"MODEL",topSourceId:"getting-started-debate",navigation:"pointer" },
  { sequence:6,mode:"full",language:"en",topic:"recovery",prompt:"Can you give me the password recovery link?",branch:"DETERMINISTIC_RECOVERY",topSourceId:null,navigation:null },
  { sequence:7,mode:"full",language:"ro",topic:"recovery",prompt:"Dă-mi linkul de recuperare a parolei.",branch:"DETERMINISTIC_RECOVERY",topSourceId:null,navigation:null },
  { sequence:8,mode:"compact",language:"en",topic:"identity",prompt:"Tell me about DebateAIRO.",branch:"MODEL",topSourceId:"product-identity",navigation:"keyboard-submit" },
  { sequence:9,mode:"full",language:"en",topic:"unsupported",prompt:"Can Dialectical Engine diagnose my symptoms?",branch:"DETERMINISTIC_NO_SOURCE",topSourceId:null,navigation:null }
];

export const FEEDBACK_MATRIX = Object.freeze(rows.map(row => Object.freeze(row)));
const CANONICAL = JSON.stringify(FEEDBACK_MATRIX);

export function validateFeedbackMatrix(value) {
  if (!Array.isArray(value) || JSON.stringify(value) !== CANONICAL) {
    throw new Error("HARNESS_FEEDBACK_MATRIX_INVALID");
  }
  return true;
}
