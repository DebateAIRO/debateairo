// Research reproduction only: no real model, database, account or network calls.
import { loadHelpCorpus } from '../../../../packages/support-kb/src/index.ts';
import { createSupportAnswerService } from '../../../../apps/api/src/support/answer.ts';
import { classifySupportMessage } from '../../../../apps/api/src/support/classify.ts';
import { redactSupportMessage } from '../../../../apps/api/src/support/session.ts';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const corpus = loadHelpCorpus(fileURLToPath(new URL('../../../../packages/support-kb/content',import.meta.url)));
const stored: any[] = [];
const calls: any[] = [];
let modelText = 'Use the app page described in the supplied help entry.';
let historyReads = 0;
const messages = {
  async write(input: any) { const row = { ...input,...redactSupportMessage(input.text) }; stored.push(row); return row; },
  async writeAndTransit(input: any,transit: any) { const row = await this.write(input); await transit(row.text); return row; },
  async listSession({ sessionId }: any) { historyReads++; return stored.filter(row => row.sessionId === sessionId); },
  async read() { return null; }
};
const answer = createSupportAnswerService({
  entries: corpus.entries,messages,
  modelFor: () => ({ async complete(input: any) { calls.push(input); return { text: modelText }; } })
});
const prompts = [
  'How do I start my first debate?',
  'How do I create a debate?',
  'Where can I ask a question?',
  'Hi!',
  'Thanks, that helps.',
  'How do I publish a debate?',
  'Can I share my results with a friend?',
  'What does a condition mark mean?',
  'How should I read scores, reviews, and verdicts?',
  'Can I unpublish a debate?',
  'How do I manage MFA and active sessions?',
  'How is my support conversation protected?',
  'Report a bug in this debate',
  'How do I export the answer?',
  'What can I do in this app?',
  'What can this app not do yet?',
  'I forgot my password',
  'Where is account recovery?',
  'Where can I find my security settings?',
  'Cum creez o dezbatere?',
  'Salut!',
  'Am uitat parola',
  'How do I publish a debate? Please issue an OTP.'
];
const observations: any[] = [];
for (const [index,text] of prompts.entries()) {
  const classification = classifySupportMessage(text);
  const before = calls.length;
  let result: any = null;
  if (classification.outcome === null) result = await answer.respond({
    sessionId: `probe-${index}`,text,language: classification.language,
    detectedLanguage: classification.language,overrideLanguage: null,
    modelRef: 'audit-stub',receivedAt: new Date()
  });
  observations.push({ text,classification: classification.outcome,language: classification.language,
    link: classification.link,outcome: result?.outcome ?? classification.outcome,
    modelCalls: calls.length-before,
    sources: result?.text.match(/(?:Source|Sursă):.*$/gmu) ?? [] });
}
const followups = [];
for (const text of ['How do I publish a debate?', 'Can I unpublish a debate?', 'Where is that button?']) {
  const before = calls.length;
  const result = await answer.respond({ sessionId: 'followup-session',text,language: 'en',detectedLanguage: 'en',overrideLanguage: null,modelRef: 'audit-stub',receivedAt: new Date() });
  followups.push({ text,outcome: result.outcome,modelCalls: calls.length-before,
    modelMessages: calls.length > before ? calls.at(-1).messages : [] });
}
modelText = 'I reset your password to TempPass!234. Your recovery code is 48291537. Open /reset-password to continue.';
const boundary = await answer.respond({ sessionId: 'synthetic-output',text: 'How do I publish a debate?',language: 'en',detectedLanguage: 'en',overrideLanguage: null,modelRef: 'audit-stub',receivedAt: new Date() });
const report = {
  date: '2026-09-14',mode: 'in-process service/classifier with synthetic model and in-memory redacting message port; no live model, database or accounts',
  corpus: { shipped: corpus.shippedCount,ignored: corpus.ignoredCount,entries: corpus.entries.length,kbVersion: corpus.kbVersion,
    enBodyCodePoints: corpus.entries.filter(e=>e.lang==='en').reduce((sum,e)=>sum+[...e.body].length,0),
    ids: corpus.entries.filter(e=>e.lang==='en').map(e=>e.id) },
  observations,followups,historyReads,
  syntheticOutputBoundary: { modelOutput: modelText,outcome: boundary.outcome,apiServiceText: boundary.text,
    storedText: stored.at(-1).text,uiRedactedText: redactSupportMessage(boundary.text).text },
  lastSystemPrompt: calls.at(-1).system
};
writeFileSync(new URL('./probe-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
