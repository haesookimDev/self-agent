import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type MemoryItem } from '@continuum/protocol';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { STATE_STORE, type StateStore } from '../storage/storage.types.js';

export type CreateMemoryInput = Pick<MemoryItem, 'kind' | 'content' | 'source' | 'confidence'>;

@Injectable()
export class MemoryService {
  constructor(
    @Inject(STATE_STORE) private readonly store: StateStore,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(userId: string, input: CreateMemoryInput): Promise<MemoryItem> {
    const now = new Date().toISOString();
    const item: MemoryItem = {
      id: randomUUID(),
      userId,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.createMemory(item);
    await this.audit.record(userId, 'memory.created', { kind: item.kind, source: item.source });
    return item;
  }

  list(userId: string): Promise<MemoryItem[]> {
    return this.store.listMemories(userId);
  }

  async remove(userId: string, memoryId: string): Promise<void> {
    if (!(await this.store.deleteMemory(userId, memoryId))) throw new NotFoundException('Memory not found');
    await this.audit.record(userId, 'memory.deleted', { memoryId });
  }
}
