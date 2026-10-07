import type { AskApplication } from '@debateai/api';
export function staffHttpAskApplication(): AskApplication {
    return {
        withContentLease: async (_id, use) => use(), submit: async () => ({run_ref: 'run:test', status: 'QUEUED'}),
        readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
        readAnswerIndex: async (_session, limit, offset) => ({items: [], open_runs: [], limit, offset, total: 0}),
        readInspection: async () => null, readLedgerDigest: async () => null, readNode: async () => null,
        recordInvestigation: async () => null, unlinkMemoryLink: async () => ({memory_link_id: 'memory:test',state: 'UNLINKED'}),
        readDeployment: async () => ({register: {register_version: 1,rows: []},scorecards: [],model_ledger: [],fleet: {state:'UNAVAILABLE',reason:'NO_TYPED_FLEET_SOURCE'}}),
        events: async function* () {}
    };
}
