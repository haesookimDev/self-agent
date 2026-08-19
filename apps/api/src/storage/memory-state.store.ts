import type {
  ActionResult,
  Approval,
  CommandEnvelope,
  Device,
  ImprovementCandidate,
  MemoryItem,
} from '@continuum/protocol';
import type {
  AuditEvent,
  StateStore,
  StoredDevice,
  StoredFeedback,
  SyncVersion,
  SyncRoot,
} from './storage.types.js';

export class MemoryStateStore implements StateStore {
  private readonly devices = new Map<string, StoredDevice>();
  private readonly commands = new Map<string, CommandEnvelope>();
  private readonly results = new Map<string, ActionResult>();
  private readonly approvals = new Map<string, Approval>();
  private readonly memories = new Map<string, MemoryItem>();
  private readonly feedback = new Map<string, StoredFeedback>();
  private readonly candidates = new Map<string, ImprovementCandidate>();
  private readonly syncVersions = new Map<string, SyncVersion>();
  private readonly syncRoots = new Map<string, SyncRoot>();
  private readonly audit: AuditEvent[] = [];

  async close(): Promise<void> {}

  async createDevice(device: StoredDevice): Promise<void> {
    this.devices.set(device.id, structuredClone(device));
  }

  async listDevices(userId: string): Promise<Device[]> {
    return [...this.devices.values()]
      .filter((device) => device.userId === userId)
      .map(({ credentialHash: _credentialHash, ...device }) => structuredClone(device));
  }

  async getDevice(userId: string, deviceId: string): Promise<StoredDevice | null> {
    const device = this.devices.get(deviceId);
    return device?.userId === userId ? structuredClone(device) : null;
  }

  async getDeviceById(deviceId: string): Promise<StoredDevice | null> {
    const device = this.devices.get(deviceId);
    return device ? structuredClone(device) : null;
  }

  async updateDevicePresence(deviceId: string, online: boolean, at: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (device) this.devices.set(deviceId, { ...device, online, lastSeenAt: at });
  }

  async createCommand(command: CommandEnvelope): Promise<CommandEnvelope> {
    this.commands.set(command.id, structuredClone(command));
    return structuredClone(command);
  }

  async findCommandByIdempotency(userId: string, key: string): Promise<CommandEnvelope | null> {
    const command = [...this.commands.values()].find(
      (item) => item.userId === userId && item.idempotencyKey === key,
    );
    return command ? structuredClone(command) : null;
  }

  async getCommand(userId: string, commandId: string): Promise<CommandEnvelope | null> {
    const command = this.commands.get(commandId);
    return command?.userId === userId ? structuredClone(command) : null;
  }

  async getCommandById(commandId: string): Promise<CommandEnvelope | null> {
    const command = this.commands.get(commandId);
    return command ? structuredClone(command) : null;
  }

  async listCommands(userId: string, limit: number): Promise<CommandEnvelope[]> {
    return [...this.commands.values()]
      .filter((command) => command.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((command) => structuredClone(command));
  }

  async updateCommand(command: CommandEnvelope): Promise<void> {
    this.commands.set(command.id, structuredClone(command));
  }

  async listDispatchableCommands(deviceId: string, now: string): Promise<CommandEnvelope[]> {
    return [...this.commands.values()]
      .filter(
        (command) =>
          command.targetDeviceId === deviceId &&
          ['queued', 'dispatched'].includes(command.status) &&
          command.expiresAt > now,
      )
      .map((command) => structuredClone(command));
  }

  async saveActionResult(result: ActionResult): Promise<void> {
    this.results.set(result.commandId, structuredClone(result));
  }

  async getActionResult(commandId: string): Promise<ActionResult | null> {
    const result = this.results.get(commandId);
    return result ? structuredClone(result) : null;
  }

  async createApproval(approval: Approval): Promise<void> {
    this.approvals.set(approval.commandId, structuredClone(approval));
  }

  async getApproval(userId: string, commandId: string): Promise<Approval | null> {
    const approval = this.approvals.get(commandId);
    return approval?.userId === userId ? structuredClone(approval) : null;
  }

  async listPendingApprovals(userId: string): Promise<Approval[]> {
    return [...this.approvals.values()]
      .filter((approval) => approval.userId === userId && approval.decision === 'pending')
      .map((approval) => structuredClone(approval));
  }

  async updateApproval(approval: Approval): Promise<void> {
    this.approvals.set(approval.commandId, structuredClone(approval));
  }

  async createMemory(item: MemoryItem): Promise<void> {
    this.memories.set(item.id, structuredClone(item));
  }

  async listMemories(userId: string): Promise<MemoryItem[]> {
    return [...this.memories.values()]
      .filter((item) => item.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((item) => structuredClone(item));
  }

  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const item = this.memories.get(memoryId);
    return item?.userId === userId ? this.memories.delete(memoryId) : false;
  }

  async createFeedback(feedback: StoredFeedback): Promise<void> {
    this.feedback.set(feedback.id, structuredClone(feedback));
  }

  async listFeedback(userId: string): Promise<StoredFeedback[]> {
    return [...this.feedback.values()]
      .filter((item) => item.userId === userId)
      .map((item) => structuredClone(item));
  }

  async createCandidate(candidate: ImprovementCandidate): Promise<void> {
    this.candidates.set(candidate.id, structuredClone(candidate));
  }

  async getCandidate(userId: string, candidateId: string): Promise<ImprovementCandidate | null> {
    const candidate = this.candidates.get(candidateId);
    return candidate?.userId === userId ? structuredClone(candidate) : null;
  }

  async listCandidates(userId: string): Promise<ImprovementCandidate[]> {
    return [...this.candidates.values()]
      .filter((item) => item.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => structuredClone(item));
  }

  async updateCandidate(candidate: ImprovementCandidate): Promise<void> {
    this.candidates.set(candidate.id, structuredClone(candidate));
  }

  async getActiveCandidate(
    userId: string,
    kind: ImprovementCandidate['kind'],
  ): Promise<ImprovementCandidate | null> {
    const candidate = [...this.candidates.values()].find(
      (item) => item.userId === userId && item.kind === kind && item.status === 'active',
    );
    return candidate ? structuredClone(candidate) : null;
  }

  async getSyncHead(
    userId: string,
    rootId: string,
    relativePath: string,
  ): Promise<SyncVersion | null> {
    const versions = [...this.syncVersions.values()]
      .filter(
        (item) =>
          item.userId === userId && item.rootId === rootId && item.relativePath === relativePath,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return versions[0] ? structuredClone(versions[0]) : null;
  }

  async createSyncRoot(root: SyncRoot): Promise<void> {
    this.syncRoots.set(root.id, structuredClone(root));
  }

  async getSyncRoot(userId: string, rootId: string): Promise<SyncRoot | null> {
    const root = this.syncRoots.get(rootId);
    return root?.userId === userId ? structuredClone(root) : null;
  }

  async listSyncRoots(userId: string): Promise<SyncRoot[]> {
    return [...this.syncRoots.values()]
      .filter((root) => root.userId === userId)
      .map((root) => structuredClone(root));
  }

  async createSyncVersion(version: SyncVersion): Promise<void> {
    this.syncVersions.set(version.id, structuredClone(version));
  }

  async listSyncVersions(userId: string, rootId: string): Promise<SyncVersion[]> {
    return [...this.syncVersions.values()]
      .filter((item) => item.userId === userId && item.rootId === rootId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => structuredClone(item));
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    this.audit.push(structuredClone(event));
  }

  async listAudit(userId: string, limit: number): Promise<AuditEvent[]> {
    return this.audit
      .filter((item) => item.userId === userId)
      .slice(-limit)
      .reverse()
      .map((item) => structuredClone(item));
  }
}
