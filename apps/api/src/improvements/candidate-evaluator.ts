import type { ImprovementCandidate } from '@continuum/protocol';

const UNSAFE_PATTERNS = [
  /bypass (all )?approvals?/i,
  /disable (the )?(audit|security)/i,
  /steal|exfiltrat/i,
  /raw\.shell/i,
  /self[- ]modify(ing)? code/i,
];

export function evaluateCandidateContent(candidate: ImprovementCandidate): ImprovementCandidate {
  const changed = candidate.before.trim() !== candidate.after.trim();
  const meaningful = candidate.after.trim().length >= 8;
  const safetyPassed = !UNSAFE_PATTERNS.some((pattern) => pattern.test(candidate.after));
  const score = Number(((Number(changed) + Number(meaningful) + Number(safetyPassed)) / 3).toFixed(3));
  return {
    ...candidate,
    status: safetyPassed && score >= 0.8 ? 'ready' : 'failed',
    evaluationScore: score,
    safetyPassed,
  };
}
