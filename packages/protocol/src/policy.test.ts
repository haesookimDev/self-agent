import { describe, expect, it } from 'vitest';
import { policyForTool } from './policy.js';

describe('tool policy', () => {
  it('allows read-only operations without approval', () => {
    expect(policyForTool('file.read')).toMatchObject({
      risk: 'read',
      approvalRequired: false,
    });
  });

  it('never treats destructive or privileged operations as automatic', () => {
    for (const tool of ['file.trash', 'system.install', 'payment.submit'] as const) {
      expect(policyForTool(tool).approvalRequired).toBe(true);
    }
  });
});
