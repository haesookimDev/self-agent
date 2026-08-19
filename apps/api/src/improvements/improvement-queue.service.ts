import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { config } from '../config.js';
import { STATE_STORE, type StateStore } from '../storage/storage.types.js';
import { evaluateCandidateContent } from './candidate-evaluator.js';

interface EvaluationJob {
  userId: string;
  candidateId: string;
}

@Injectable()
export class ImprovementQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImprovementQueueService.name);
  private readonly queue?: Queue<EvaluationJob>;
  private readonly worker?: Worker<EvaluationJob>;
  private readonly queueRedis?: Redis;
  private readonly workerRedis?: Redis;

  constructor(
    @Inject(STATE_STORE) private readonly store: StateStore,
    private readonly audit: AuditService,
  ) {
    const redisUrl = config().REDIS_URL;
    if (!redisUrl) return;
    this.queueRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.workerRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<EvaluationJob>('improvement-evaluations', {
      connection: this.queueRedis,
    });
    this.worker = new Worker<EvaluationJob>(
      'improvement-evaluations',
      async (job) => {
        const candidate = await this.store.getCandidate(job.data.userId, job.data.candidateId);
        if (!candidate || !['draft', 'failed'].includes(candidate.status)) return;
        const evaluated = evaluateCandidateContent(candidate);
        await this.store.updateCandidate(evaluated);
        await this.audit.record(job.data.userId, 'improvement.candidate_evaluated', {
          candidateId: candidate.id,
          score: evaluated.evaluationScore,
          safetyPassed: evaluated.safetyPassed,
          worker: 'bullmq',
        });
      },
      { connection: this.workerRedis, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Evaluation job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });
  }

  async enqueue(userId: string, candidateId: string): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      'evaluate',
      { userId, candidateId },
      { jobId: candidateId, attempts: 3, backoff: { type: 'exponential', delay: 1_000 } },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.workerRedis?.quit();
    await this.queueRedis?.quit();
  }
}
