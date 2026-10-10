// GAP-RUNNER (2026-10-09): on the private preview the runner refuses, before its worker exists,
// every open job no team member owns, with the API's own rule and the API's own failure code.
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PREVIEW_TEAM_ONLY_REASON, postgresRunnerPreviewTeamGateStore, refusePreviewOutsiderWork } from '../../apps/runner/src/runner-preview-team-gate.js';
import { PREVIEW_TEAM_RUNS_SQL } from '../../packages/providers/src/preview-test.js';
import { RUNNER_ENVIRONMENT_KEYS, parseRunnerEnvironment } from '../../packages/register/src/runtime-environment.js';
import { validRunnerEnvironmentFixture } from '../support/apiEnvironmentFixture.js';

const ALICE = '0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e';
const run = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const job = (n: number) => `10000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

function harness(open: Array<{ runId: string; workItemId: string; claimLive?: boolean }>, teamOwned: readonly string[], options: { unrecorded?: boolean } = {}) {
  const calls: string[] = [];
  const failures: unknown[] = [];
  const lines: unknown[] = [];
  return {
    calls, failures, lines,
    input: (previewConfigured: boolean, teamUserIds: readonly string[] | undefined) => ({
      previewConfigured, teamUserIds,
      work: {
        listOpenRunWork: async (limit: number) => { calls.push(`list:${limit}`); return open.map(item => ({ claimLive: false, ...item })); },
        failClaimable: async (failure: unknown) => { calls.push('fail'); failures.push(failure); return !options.unrecorded; }
      },
      teamRuns: async (runIds: readonly string[], team: readonly string[]) => { calls.push(`team:${runIds.length}:${team.length}`); return new Set(teamOwned); },
      log: (line: unknown) => lines.push(line)
    })
  };
}

describe('refusePreviewOutsiderWork', () => {
  it('off the preview reads nothing and refuses nothing', async () => {
    const h = harness([{ runId: run(1), workItemId: job(1) }], []);
    expect(await refusePreviewOutsiderWork(h.input(false, undefined))).toEqual({ checked: 0, refused: 0 });
    expect(h.calls).toEqual([]);
  });

  it('records each outsider job FAILED with the API code and leaves the team jobs alone', async () => {
    const open = [{ runId: run(1), workItemId: job(1) }, { runId: run(2), workItemId: job(2) }, { runId: run(2), workItemId: job(3) }, { runId: run(3), workItemId: job(4) }];
    const h = harness(open, [run(1), run(3)]);
    expect(await refusePreviewOutsiderWork(h.input(true, [ALICE]))).toEqual({ checked: 4, refused: 2 });
    expect(PREVIEW_TEAM_ONLY_REASON).toBe('RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY');
    expect(h.calls).toEqual(['list:101', 'team:3:1', 'fail', 'fail']);
    expect(h.failures).toEqual([
      { runId: run(2), workItemId: job(2), reason: 'RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY' },
      { runId: run(2), workItemId: job(3), reason: 'RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY' }
    ]);
    expect(h.lines).toEqual([
      { kind: 'DEBATEAI_RUNNER_STARTUP', event: 'PREVIEW_TEAM_ONLY', runId: run(2) },
      { kind: 'DEBATEAI_RUNNER_STARTUP', event: 'PREVIEW_TEAM_ONLY', runId: run(2) }
    ]);
  });

  it('refuses the start, writing nothing, while an outsider job has a live claim; a team live claim is left alone', async () => {
    const open = [{ runId: run(1), workItemId: job(1), claimLive: true }, { runId: run(2), workItemId: job(2) }, { runId: run(3), workItemId: job(3), claimLive: true }];
    const h = harness(open, [run(1)]);
    await expect(refusePreviewOutsiderWork(h.input(true, [ALICE]))).rejects.toMatchObject({ code: 'RUNNER_PREVIEW_OUTSIDER_CLAIM_LIVE' });
    expect(h.calls).toEqual(['list:101', 'team:3:1']);
    const ok = harness([{ runId: run(1), workItemId: job(1), claimLive: true }, { runId: run(2), workItemId: job(2) }], [run(1)]);
    expect(await refusePreviewOutsiderWork(ok.input(true, [ALICE]))).toEqual({ checked: 2, refused: 1 });
    expect(ok.failures).toEqual([{ runId: run(2), workItemId: job(2), reason: 'RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY' }]);
  });

  it('an empty queue needs no team read', async () => {
    const h = harness([], []);
    expect(await refusePreviewOutsiderWork(h.input(true, [ALICE]))).toEqual({ checked: 0, refused: 0 });
    expect(h.calls).toEqual(['list:101']);
  });

  it.each([
    ['no team listed', undefined, [], {}, 'RUNNER_PREVIEW_TEAM_UNSET', []],
    ['an empty team', [], [], {}, 'RUNNER_PREVIEW_TEAM_UNSET', []],
    ['more than 100 open jobs', [ALICE], Array.from({ length: 101 }, (_, n) => ({ runId: run(n), workItemId: job(n) })), {}, 'RUNNER_STARTUP_BACKLOG_SATURATED', ['list:101']],
    ['an unrecorded refusal', [ALICE], [{ runId: run(9), workItemId: job(9) }], { unrecorded: true }, 'RUNNER_PREVIEW_TEAM_REFUSAL_UNRECORDED', ['list:101', 'team:1:1', 'fail']]
  ] as const)('refuses the start on %s, failing nothing more', async (_name, team, open, options, code, calls) => {
    const h = harness([...open], [], options);
    await expect(refusePreviewOutsiderWork(h.input(true, team))).rejects.toMatchObject({ code });
    expect(h.calls).toEqual(calls);
    expect(h.lines.at(-1)).toEqual({ kind: 'DEBATEAI_RUNNER_STARTUP', event: 'PREVIEW_TEAM_GATE_REFUSED', code });
  });
});

describe('the store applies the API rule on the runner pool', () => {
  it('lists every open run job and asks the shared team query with uuid arrays', async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const query = async (text: string, values: unknown[]) => {
      queries.push({ text, values });
      if (text === PREVIEW_TEAM_RUNS_SQL) return { rows: [{ run_id: run(1) }] };
      if (text.startsWith('UPDATE')) return { rows: [], rowCount: 1 };
      return { rows: [{ work_item_id: job(1), run_id: run(1), claim_live: false }], rowCount: 1 };
    };
    const client = { query: async (text: string, values: unknown[] = []) => (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) ? { rows: [] } : query(text, values)), release: () => undefined };
    const pool = { query, connect: async () => client };
    const store = postgresRunnerPreviewTeamGateStore(pool as never);
    expect(await store.work.listOpenRunWork(101)).toEqual([{ runId: run(1), workItemId: job(1), claimLive: false }]);
    expect(queries[0]!.text).toMatch(/state IN \('READY', 'CLAIMED'\)/);
    expect(queries[0]!.text).toMatch(/run_id IS NOT NULL/);
    expect(queries[0]!.values).toEqual([101]);
    expect([...await store.teamRuns([run(1), run(2)], [ALICE])]).toEqual([run(1)]);
    expect(queries[1]).toEqual({ text: PREVIEW_TEAM_RUNS_SQL, values: [[run(1), run(2)], [ALICE]] });
    expect(await store.work.failClaimable({ runId: run(1), workItemId: job(1), reason: 'RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY' })).toBe(true);
    // Only what claimById could still take: never a DONE/FAILED job, a live claim or a settled attempt.
    expect(queries[2]!.text.replace(/\s+/g, ' ')).toContain("WHERE work_item_id = $1 AND run_id = $2 AND settled_attempt_id IS NULL AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))");
    expect(queries[2]!.values).toEqual([job(1), run(1), 'RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY']);
  });

  it('the API waker reads the very same query', async () => {
    const api = await readFile(resolve('apps/api/src/index.ts'), 'utf8');
    const method = api.slice(api.indexOf('async #previewTeamRuns('), api.indexOf('async #refusePreviewOutsider('));
    expect(method).toContain('PREVIEW_TEAM_RUNS_SQL,');
    expect(method).not.toContain('SELECT');
  });
});

describe('PREVIEW_TEAM_USER_IDS_JSON in the runner environment', () => {
  const PREVIEW = JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high', budget_socket: '/run/debateai-v3-preview/team-budget-v2.sock', scope_id: 'fixture' });
  it('is an optional runner key parsed with the API rules', () => {
    expect(RUNNER_ENVIRONMENT_KEYS.optional).toContain('PREVIEW_TEAM_USER_IDS_JSON');
    expect((parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([ALICE]) }) as { PREVIEW_TEAM_USER_IDS?: readonly string[] }).PREVIEW_TEAM_USER_IDS).toEqual([ALICE]);
    expect((parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW }) as { PREVIEW_TEAM_USER_IDS?: readonly string[] }).PREVIEW_TEAM_USER_IDS).toEqual([]);
    expect((parseRunnerEnvironment(validRunnerEnvironmentFixture()) as { PREVIEW_TEAM_USER_IDS?: readonly string[] }).PREVIEW_TEAM_USER_IDS).toBeUndefined();
  });
  it('refuses a team list off the preview and a malformed one on it', () => {
    expect(() => parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([ALICE]) })).toThrow('PREVIEW_TEAM_USER_IDS_WITHOUT_PREVIEW');
    expect(() => parseRunnerEnvironment({ ...validRunnerEnvironmentFixture(), PREVIEW_PROVIDER_TEST_CONFIG_JSON: PREVIEW, PREVIEW_TEAM_USER_IDS_JSON: JSON.stringify([ALICE, ALICE]) })).toThrow('PREVIEW_TEAM_USER_IDS_INVALID');
  });
});
