import type {
  ActionResult,
  Approval,
  CommandEnvelope,
  Device,
  ImprovementCandidate,
  MemoryItem,
} from '@continuum/protocol';
import { Pool, type QueryResultRow } from 'pg';
import type {
  AuditEvent,
  StateStore,
  StoredDevice,
  StoredFeedback,
  SyncVersion,
  SyncRoot,
} from './storage.types.js';

function iso(value: Date | string | null): string | null {
  return value instanceof Date ? value.toISOString() : value;
}

function mapDevice(row: QueryResultRow): StoredDevice {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    platform: row.platform,
    kind: row.kind,
    capabilities: row.capabilities,
    online: row.online,
    lastSeenAt: iso(row.last_seen_at),
    createdAt: iso(row.created_at)!,
    credentialHash: row.credential_hash,
  };
}

function publicDevice(device: StoredDevice): Device {
  const { credentialHash: _credentialHash, ...result } = device;
  return result;
}

function mapCommand(row: QueryResultRow): CommandEnvelope {
  return {
    id: row.id,
    userId: row.user_id,
    targetDeviceId: row.target_device_id,
    tool: row.tool,
    args: row.args,
    idempotencyKey: row.idempotency_key,
    expiresAt: iso(row.expires_at)!,
    risk: row.risk,
    status: row.status,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapApproval(row: QueryResultRow): Approval {
  return {
    id: row.id,
    commandId: row.command_id,
    userId: row.user_id,
    decision: row.decision,
    biometricRequired: row.biometric_required,
    biometricVerified: row.biometric_verified,
    decidedAt: iso(row.decided_at),
    consumedAt: iso(row.consumed_at),
    createdAt: iso(row.created_at)!,
  };
}

function mapMemory(row: QueryResultRow): MemoryItem {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    content: row.content,
    source: row.source,
    confidence: Number(row.confidence),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapCandidate(row: QueryResultRow): ImprovementCandidate {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    before: row.before_value,
    after: row.after_value,
    rationale: row.rationale,
    status: row.status,
    evaluationScore: row.evaluation_score === null ? null : Number(row.evaluation_score),
    safetyPassed: row.safety_passed,
    createdAt: iso(row.created_at)!,
    activatedAt: iso(row.activated_at),
  };
}

function mapSyncVersion(row: QueryResultRow): SyncVersion {
  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    rootId: row.root_id,
    relativePath: row.relative_path,
    baseVersionId: row.base_version_id,
    sha256: row.sha256,
    size: Number(row.size),
    objectKey: row.object_key,
    deleted: row.deleted,
    conflict: row.conflict,
    createdAt: iso(row.created_at)!,
  };
}

function mapSyncRoot(row: QueryResultRow): SyncRoot {
  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    displayName: row.display_name,
    localPath: row.local_path,
    createdAt: iso(row.created_at)!,
  };
}

export class PostgresStateStore implements StateStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createDevice(device: StoredDevice): Promise<void> {
    await this.pool.query(
      `INSERT INTO devices
        (id, user_id, name, platform, kind, capabilities, online, last_seen_at, created_at, credential_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        device.id,
        device.userId,
        device.name,
        device.platform,
        device.kind,
        JSON.stringify(device.capabilities),
        device.online,
        device.lastSeenAt,
        device.createdAt,
        device.credentialHash,
      ],
    );
  }

  async listDevices(userId: string): Promise<Device[]> {
    const result = await this.pool.query('SELECT * FROM devices WHERE user_id=$1 ORDER BY created_at', [
      userId,
    ]);
    return result.rows.map(mapDevice).map(publicDevice);
  }

  async getDevice(userId: string, deviceId: string): Promise<StoredDevice | null> {
    const result = await this.pool.query('SELECT * FROM devices WHERE id=$1 AND user_id=$2', [
      deviceId,
      userId,
    ]);
    return result.rows[0] ? mapDevice(result.rows[0]) : null;
  }

  async getDeviceById(deviceId: string): Promise<StoredDevice | null> {
    const result = await this.pool.query('SELECT * FROM devices WHERE id=$1', [deviceId]);
    return result.rows[0] ? mapDevice(result.rows[0]) : null;
  }

  async updateDevicePresence(deviceId: string, online: boolean, at: string): Promise<void> {
    await this.pool.query('UPDATE devices SET online=$2, last_seen_at=$3 WHERE id=$1', [
      deviceId,
      online,
      at,
    ]);
  }

  async createCommand(command: CommandEnvelope): Promise<CommandEnvelope> {
    const result = await this.pool.query(
      `INSERT INTO commands
        (id,user_id,target_device_id,tool,args,idempotency_key,expires_at,risk,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        command.id,
        command.userId,
        command.targetDeviceId,
        command.tool,
        JSON.stringify(command.args),
        command.idempotencyKey,
        command.expiresAt,
        command.risk,
        command.status,
        command.createdAt,
        command.updatedAt,
      ],
    );
    return mapCommand(result.rows[0]!);
  }

  async findCommandByIdempotency(userId: string, key: string): Promise<CommandEnvelope | null> {
    const result = await this.pool.query(
      'SELECT * FROM commands WHERE user_id=$1 AND idempotency_key=$2',
      [userId, key],
    );
    return result.rows[0] ? mapCommand(result.rows[0]) : null;
  }

  async getCommand(userId: string, commandId: string): Promise<CommandEnvelope | null> {
    const result = await this.pool.query('SELECT * FROM commands WHERE id=$1 AND user_id=$2', [
      commandId,
      userId,
    ]);
    return result.rows[0] ? mapCommand(result.rows[0]) : null;
  }

  async getCommandById(commandId: string): Promise<CommandEnvelope | null> {
    const result = await this.pool.query('SELECT * FROM commands WHERE id=$1', [commandId]);
    return result.rows[0] ? mapCommand(result.rows[0]) : null;
  }

  async listCommands(userId: string, limit: number): Promise<CommandEnvelope[]> {
    const result = await this.pool.query(
      'SELECT * FROM commands WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    );
    return result.rows.map(mapCommand);
  }

  async updateCommand(command: CommandEnvelope): Promise<void> {
    await this.pool.query(
      `UPDATE commands SET status=$2, args=$3, expires_at=$4, updated_at=$5 WHERE id=$1`,
      [command.id, command.status, JSON.stringify(command.args), command.expiresAt, command.updatedAt],
    );
  }

  async listDispatchableCommands(deviceId: string, now: string): Promise<CommandEnvelope[]> {
    const result = await this.pool.query(
      `SELECT * FROM commands
       WHERE target_device_id=$1 AND status IN ('queued','dispatched') AND expires_at>$2
       ORDER BY created_at`,
      [deviceId, now],
    );
    return result.rows.map(mapCommand);
  }

  async saveActionResult(result: ActionResult): Promise<void> {
    await this.pool.query(
      `INSERT INTO action_results (command_id,status,output,error,finished_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (command_id) DO UPDATE
       SET status=excluded.status, output=excluded.output, error=excluded.error,
           finished_at=excluded.finished_at, updated_at=now()`,
      [
        result.commandId,
        result.status,
        result.output ? JSON.stringify(result.output) : null,
        result.error ?? null,
        result.finishedAt ?? null,
      ],
    );
  }

  async getActionResult(commandId: string): Promise<ActionResult | null> {
    const result = await this.pool.query('SELECT * FROM action_results WHERE command_id=$1', [commandId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      commandId: row.command_id,
      status: row.status,
      ...(row.output === null ? {} : { output: row.output }),
      ...(row.error === null ? {} : { error: row.error }),
      ...(row.finished_at === null ? {} : { finishedAt: iso(row.finished_at)! }),
    };
  }

  async createApproval(approval: Approval): Promise<void> {
    await this.pool.query(
      `INSERT INTO approvals
        (id,command_id,user_id,decision,biometric_required,biometric_verified,decided_at,consumed_at,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        approval.id,
        approval.commandId,
        approval.userId,
        approval.decision,
        approval.biometricRequired,
        approval.biometricVerified,
        approval.decidedAt,
        approval.consumedAt,
        approval.createdAt,
      ],
    );
  }

  async getApproval(userId: string, commandId: string): Promise<Approval | null> {
    const result = await this.pool.query(
      'SELECT * FROM approvals WHERE command_id=$1 AND user_id=$2',
      [commandId, userId],
    );
    return result.rows[0] ? mapApproval(result.rows[0]) : null;
  }

  async listPendingApprovals(userId: string): Promise<Approval[]> {
    const result = await this.pool.query(
      `SELECT * FROM approvals WHERE user_id=$1 AND decision='pending' ORDER BY created_at`,
      [userId],
    );
    return result.rows.map(mapApproval);
  }

  async updateApproval(approval: Approval): Promise<void> {
    await this.pool.query(
      `UPDATE approvals SET decision=$2, biometric_verified=$3, decided_at=$4, consumed_at=$5
       WHERE id=$1`,
      [
        approval.id,
        approval.decision,
        approval.biometricVerified,
        approval.decidedAt,
        approval.consumedAt,
      ],
    );
  }

  async createMemory(item: MemoryItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO memory_items
        (id,user_id,kind,content,source,confidence,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        item.id,
        item.userId,
        item.kind,
        item.content,
        item.source,
        item.confidence,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }

  async listMemories(userId: string): Promise<MemoryItem[]> {
    const result = await this.pool.query(
      'SELECT * FROM memory_items WHERE user_id=$1 ORDER BY updated_at DESC',
      [userId],
    );
    return result.rows.map(mapMemory);
  }

  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM memory_items WHERE id=$1 AND user_id=$2', [
      memoryId,
      userId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async createFeedback(feedback: StoredFeedback): Promise<void> {
    await this.pool.query(
      `INSERT INTO feedback (id,user_id,run_id,kind,score,content,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        feedback.id,
        feedback.userId,
        feedback.runId ?? null,
        feedback.kind,
        feedback.score ?? null,
        feedback.content ?? null,
        feedback.createdAt,
      ],
    );
  }

  async listFeedback(userId: string): Promise<StoredFeedback[]> {
    const result = await this.pool.query(
      'SELECT * FROM feedback WHERE user_id=$1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      runId: row.run_id ?? undefined,
      kind: row.kind,
      score: row.score === null ? undefined : Number(row.score),
      content: row.content ?? undefined,
      createdAt: iso(row.created_at)!,
    }));
  }

  async createCandidate(candidate: ImprovementCandidate): Promise<void> {
    await this.pool.query(
      `INSERT INTO improvement_candidates
        (id,user_id,kind,title,before_value,after_value,rationale,status,evaluation_score,safety_passed,created_at,activated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        candidate.id,
        candidate.userId,
        candidate.kind,
        candidate.title,
        candidate.before,
        candidate.after,
        candidate.rationale,
        candidate.status,
        candidate.evaluationScore,
        candidate.safetyPassed,
        candidate.createdAt,
        candidate.activatedAt,
      ],
    );
  }

  async getCandidate(userId: string, candidateId: string): Promise<ImprovementCandidate | null> {
    const result = await this.pool.query(
      'SELECT * FROM improvement_candidates WHERE id=$1 AND user_id=$2',
      [candidateId, userId],
    );
    return result.rows[0] ? mapCandidate(result.rows[0]) : null;
  }

  async listCandidates(userId: string): Promise<ImprovementCandidate[]> {
    const result = await this.pool.query(
      'SELECT * FROM improvement_candidates WHERE user_id=$1 ORDER BY created_at DESC',
      [userId],
    );
    return result.rows.map(mapCandidate);
  }

  async updateCandidate(candidate: ImprovementCandidate): Promise<void> {
    await this.pool.query(
      `UPDATE improvement_candidates
       SET status=$2,evaluation_score=$3,safety_passed=$4,activated_at=$5,
           before_value=$6,after_value=$7,rationale=$8
       WHERE id=$1`,
      [
        candidate.id,
        candidate.status,
        candidate.evaluationScore,
        candidate.safetyPassed,
        candidate.activatedAt,
        candidate.before,
        candidate.after,
        candidate.rationale,
      ],
    );
  }

  async getActiveCandidate(
    userId: string,
    kind: ImprovementCandidate['kind'],
  ): Promise<ImprovementCandidate | null> {
    const result = await this.pool.query(
      `SELECT * FROM improvement_candidates
       WHERE user_id=$1 AND kind=$2 AND status='active'
       ORDER BY activated_at DESC LIMIT 1`,
      [userId, kind],
    );
    return result.rows[0] ? mapCandidate(result.rows[0]) : null;
  }

  async getSyncHead(
    userId: string,
    rootId: string,
    relativePath: string,
  ): Promise<SyncVersion | null> {
    const result = await this.pool.query(
      `SELECT * FROM file_versions
       WHERE user_id=$1 AND root_id=$2 AND relative_path=$3
       ORDER BY created_at DESC LIMIT 1`,
      [userId, rootId, relativePath],
    );
    return result.rows[0] ? mapSyncVersion(result.rows[0]) : null;
  }

  async createSyncRoot(root: SyncRoot): Promise<void> {
    await this.pool.query(
      `INSERT INTO sync_roots (id,user_id,device_id,display_name,local_path,created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [root.id, root.userId, root.deviceId, root.displayName, root.localPath, root.createdAt],
    );
  }

  async getSyncRoot(userId: string, rootId: string): Promise<SyncRoot | null> {
    const result = await this.pool.query('SELECT * FROM sync_roots WHERE id=$1 AND user_id=$2', [
      rootId,
      userId,
    ]);
    return result.rows[0] ? mapSyncRoot(result.rows[0]) : null;
  }

  async listSyncRoots(userId: string): Promise<SyncRoot[]> {
    const result = await this.pool.query(
      'SELECT * FROM sync_roots WHERE user_id=$1 ORDER BY created_at',
      [userId],
    );
    return result.rows.map(mapSyncRoot);
  }

  async createSyncVersion(version: SyncVersion): Promise<void> {
    await this.pool.query(
      `INSERT INTO file_versions
        (id,user_id,device_id,root_id,relative_path,base_version_id,sha256,size,object_key,deleted,conflict,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        version.id,
        version.userId,
        version.deviceId,
        version.rootId,
        version.relativePath,
        version.baseVersionId,
        version.sha256,
        version.size,
        version.objectKey,
        version.deleted,
        version.conflict,
        version.createdAt,
      ],
    );
  }

  async listSyncVersions(userId: string, rootId: string): Promise<SyncVersion[]> {
    const result = await this.pool.query(
      'SELECT * FROM file_versions WHERE user_id=$1 AND root_id=$2 ORDER BY created_at DESC',
      [userId, rootId],
    );
    return result.rows.map(mapSyncVersion);
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (id,user_id,device_id,command_id,kind,detail,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        event.id,
        event.userId,
        event.deviceId,
        event.commandId,
        event.kind,
        JSON.stringify(event.detail),
        event.createdAt,
      ],
    );
  }

  async listAudit(userId: string, limit: number): Promise<AuditEvent[]> {
    const result = await this.pool.query(
      'SELECT * FROM audit_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      commandId: row.command_id,
      kind: row.kind,
      detail: row.detail,
      createdAt: iso(row.created_at)!,
    }));
  }
}
