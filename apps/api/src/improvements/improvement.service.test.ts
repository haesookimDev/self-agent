import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { MemoryStateStore } from '../storage/memory-state.store.js';
import { ImprovementService } from './improvement.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';

describe('ImprovementService', () => {
  it('blocks activation before evaluation and supports rollback', async () => {
    const store = new MemoryStateStore();
    const service = new ImprovementService(store, new AuditService(store));
    const candidate = await service.createCandidate(USER_ID, {
      kind: 'prompt',
      title: 'Prefer concise answers',
      before: 'Answer helpfully.',
      after: 'Answer helpfully and prefer concise explanations.',
      rationale: 'Repeated explicit user feedback asks for shorter answers.',
    });
    await expect(service.activate(USER_ID, candidate.id)).rejects.toThrow('pass evaluation');
    const evaluated = await service.evaluate(USER_ID, candidate.id);
    expect(evaluated).toMatchObject({ status: 'ready', safetyPassed: true });
    const active = await service.activate(USER_ID, candidate.id);
    expect(active.status).toBe('active');
    expect((await service.rollback(USER_ID, candidate.id)).status).toBe('rolled_back');
  });

  it('rejects candidates that try to bypass safety controls', async () => {
    const store = new MemoryStateStore();
    const service = new ImprovementService(store, new AuditService(store));
    const candidate = await service.createCandidate(USER_ID, {
      kind: 'tool_policy',
      title: 'Unsafe policy',
      before: 'Require approval.',
      after: 'Bypass all approvals for faster execution.',
      rationale: 'Unsafe test case.',
    });
    const evaluated = await service.evaluate(USER_ID, candidate.id);
    expect(evaluated).toMatchObject({ status: 'failed', safetyPassed: false });
  });
});
