import type {
  ActionResult,
  Approval,
  CommandEnvelope,
  Device,
  Feedback,
  ImprovementCandidate,
  MemoryItem,
  SyncVersionRequest,
} from '@continuum/protocol';

export interface StoredDevice extends Device {
  credentialHash: string;
}

export interface StoredFeedback extends Feedback {
  id: string;
  userId: string;
  createdAt: string;
}

export interface SyncVersion extends SyncVersionRequest {
  id: string;
  userId: string;
  objectKey: string;
  conflict: boolean;
  createdAt: string;
}

export interface SyncRoot {
  id: string;
  userId: string;
  deviceId: string;
  displayName: string;
  localPath: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  userId: string;
  deviceId: string | null;
  commandId: string | null;
  kind: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface StateStore {
  close(): Promise<void>;

  createDevice(device: StoredDevice): Promise<void>;
  listDevices(userId: string): Promise<Device[]>;
  getDevice(userId: string, deviceId: string): Promise<StoredDevice | null>;
  getDeviceById(deviceId: string): Promise<StoredDevice | null>;
  updateDevicePresence(deviceId: string, online: boolean, at: string): Promise<void>;

  createCommand(command: CommandEnvelope): Promise<CommandEnvelope>;
  findCommandByIdempotency(userId: string, key: string): Promise<CommandEnvelope | null>;
  getCommand(userId: string, commandId: string): Promise<CommandEnvelope | null>;
  getCommandById(commandId: string): Promise<CommandEnvelope | null>;
  listCommands(userId: string, limit: number): Promise<CommandEnvelope[]>;
  updateCommand(command: CommandEnvelope): Promise<void>;
  listDispatchableCommands(deviceId: string, now: string): Promise<CommandEnvelope[]>;
  saveActionResult(result: ActionResult): Promise<void>;
  getActionResult(commandId: string): Promise<ActionResult | null>;

  createApproval(approval: Approval): Promise<void>;
  getApproval(userId: string, commandId: string): Promise<Approval | null>;
  listPendingApprovals(userId: string): Promise<Approval[]>;
  updateApproval(approval: Approval): Promise<void>;

  createMemory(item: MemoryItem): Promise<void>;
  listMemories(userId: string): Promise<MemoryItem[]>;
  deleteMemory(userId: string, memoryId: string): Promise<boolean>;

  createFeedback(feedback: StoredFeedback): Promise<void>;
  listFeedback(userId: string): Promise<StoredFeedback[]>;
  createCandidate(candidate: ImprovementCandidate): Promise<void>;
  getCandidate(userId: string, candidateId: string): Promise<ImprovementCandidate | null>;
  listCandidates(userId: string): Promise<ImprovementCandidate[]>;
  updateCandidate(candidate: ImprovementCandidate): Promise<void>;
  getActiveCandidate(userId: string, kind: ImprovementCandidate['kind']): Promise<ImprovementCandidate | null>;

  getSyncHead(userId: string, rootId: string, relativePath: string): Promise<SyncVersion | null>;
  createSyncRoot(root: SyncRoot): Promise<void>;
  getSyncRoot(userId: string, rootId: string): Promise<SyncRoot | null>;
  listSyncRoots(userId: string): Promise<SyncRoot[]>;
  createSyncVersion(version: SyncVersion): Promise<void>;
  listSyncVersions(userId: string, rootId: string): Promise<SyncVersion[]>;

  appendAudit(event: AuditEvent): Promise<void>;
  listAudit(userId: string, limit: number): Promise<AuditEvent[]>;
}

export const STATE_STORE = Symbol('STATE_STORE');
