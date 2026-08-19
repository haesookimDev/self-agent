import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  type Feedback,
  type ImprovementCandidate,
} from '@continuum/protocol';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import {
  STATE_STORE,
  type StateStore,
  type StoredFeedback,
} from '../storage/storage.types.js';
import { evaluateCandidateContent } from './candidate-evaluator.js';
import { ImprovementQueueService } from './improvement-queue.service.js';

export type CreateCandidateInput = Pick<
  ImprovementCandidate,
  'kind' | 'title' | 'before' | 'after' | 'rationale'
>;

@Injectable()
export class ImprovementService {
  constructor(
    @Inject(STATE_STORE) private readonly store: StateStore,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject(ImprovementQueueService) private readonly queue?: ImprovementQueueService,
  ) {}

  async recordFeedback(userId: string, input: Feedback): Promise<StoredFeedback> {
    const feedback: StoredFeedback = {
      id: randomUUID(),
      userId,
      ...input,
      createdAt: new Date().toISOString(),
    };
    await this.store.createFeedback(feedback);
    await this.audit.record(userId, 'improvement.feedback_recorded', { kind: input.kind });
    return feedback;
  }

  async createCandidate(
    userId: string,
    input: CreateCandidateInput,
  ): Promise<ImprovementCandidate> {
    const candidate: ImprovementCandidate = {
      id: randomUUID(),
      userId,
      ...input,
      status: 'draft',
      evaluationScore: null,
      safetyPassed: null,
      createdAt: new Date().toISOString(),
      activatedAt: null,
    };
    await this.store.createCandidate(candidate);
    await this.queue?.enqueue(userId, candidate.id);
    await this.audit.record(userId, 'improvement.candidate_created', {
      candidateId: candidate.id,
      kind: candidate.kind,
    });
    return candidate;
  }

  listCandidates(userId: string): Promise<ImprovementCandidate[]> {
    return this.store.listCandidates(userId);
  }

  async evaluate(userId: string, candidateId: string): Promise<ImprovementCandidate> {
    const candidate = await this.requireCandidate(userId, candidateId);
    if (!['draft', 'failed'].includes(candidate.status)) {
      throw new ConflictException('Only draft or failed candidates can be evaluated');
    }
    const evaluated = evaluateCandidateContent(candidate);
    await this.store.updateCandidate(evaluated);
    await this.audit.record(userId, 'improvement.candidate_evaluated', {
      candidateId,
      score: evaluated.evaluationScore,
      safetyPassed: evaluated.safetyPassed,
    });
    return evaluated;
  }

  async activate(userId: string, candidateId: string): Promise<ImprovementCandidate> {
    const candidate = await this.requireCandidate(userId, candidateId);
    if (candidate.status !== 'ready' || !candidate.safetyPassed) {
      throw new ConflictException('Candidate must pass evaluation before activation');
    }
    const previous = await this.store.getActiveCandidate(userId, candidate.kind);
    if (previous) await this.store.updateCandidate({ ...previous, status: 'rolled_back' });
    const activated: ImprovementCandidate = {
      ...candidate,
      status: 'active',
      activatedAt: new Date().toISOString(),
    };
    await this.store.updateCandidate(activated);
    await this.audit.record(userId, 'improvement.candidate_activated', { candidateId });
    return activated;
  }

  async rollback(userId: string, candidateId: string): Promise<ImprovementCandidate> {
    const candidate = await this.requireCandidate(userId, candidateId);
    if (candidate.status !== 'active') throw new ConflictException('Only the active candidate can be rolled back');
    const rolledBack: ImprovementCandidate = { ...candidate, status: 'rolled_back' };
    await this.store.updateCandidate(rolledBack);

    const prior = (await this.store.listCandidates(userId)).find(
      (item) =>
        item.id !== candidate.id && item.kind === candidate.kind && item.status === 'rolled_back',
    );
    if (prior) {
      await this.store.updateCandidate({
        ...prior,
        status: 'active',
        activatedAt: new Date().toISOString(),
      });
    }
    await this.audit.record(userId, 'improvement.candidate_rolled_back', {
      candidateId,
      restoredCandidateId: prior?.id ?? null,
    });
    return rolledBack;
  }

  private async requireCandidate(userId: string, candidateId: string): Promise<ImprovementCandidate> {
    const candidate = await this.store.getCandidate(userId, candidateId);
    if (!candidate) throw new NotFoundException('Improvement candidate not found');
    return candidate;
  }
}
