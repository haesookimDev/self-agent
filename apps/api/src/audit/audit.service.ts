import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { STATE_STORE, type AuditEvent, type StateStore } from '../storage/storage.types.js';

@Injectable()
export class AuditService {
  constructor(@Inject(STATE_STORE) private readonly store: StateStore) {}

  async record(
    userId: string,
    kind: string,
    detail: Record<string, unknown>,
    deviceId: string | null = null,
    commandId: string | null = null,
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      userId,
      deviceId,
      commandId,
      kind,
      detail,
      createdAt: new Date().toISOString(),
    };
    await this.store.appendAudit(event);
  }

  list(userId: string, limit = 100): Promise<AuditEvent[]> {
    return this.store.listAudit(userId, Math.min(Math.max(limit, 1), 500));
  }
}
