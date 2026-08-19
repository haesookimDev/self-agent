import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SyncVersionRequest } from '@continuum/protocol';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { DeviceService } from '../devices/device.service.js';
import {
  STATE_STORE,
  type StateStore,
  type SyncRoot,
  type SyncVersion,
} from '../storage/storage.types.js';
import { ObjectStoreService } from './object-store.service.js';

export interface CreateRootInput {
  deviceId: string;
  displayName: string;
  localPath: string;
}

@Injectable()
export class SyncService {
  constructor(
    @Inject(STATE_STORE) private readonly store: StateStore,
    @Inject(DeviceService) private readonly devices: DeviceService,
    @Inject(ObjectStoreService) private readonly objects: ObjectStoreService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async createRoot(userId: string, input: CreateRootInput): Promise<SyncRoot> {
    await this.devices.requireExecutor(userId, input.deviceId);
    const root: SyncRoot = {
      id: randomUUID(),
      userId,
      deviceId: input.deviceId,
      displayName: input.displayName,
      localPath: input.localPath,
      createdAt: new Date().toISOString(),
    };
    await this.store.createSyncRoot(root);
    await this.audit.record(userId, 'sync.root_created', { rootId: root.id }, input.deviceId);
    return root;
  }

  listRoots(userId: string): Promise<SyncRoot[]> {
    return this.store.listSyncRoots(userId);
  }

  async registerVersion(
    userId: string,
    input: SyncVersionRequest,
  ): Promise<{ version: SyncVersion; uploadUrl: string | null }> {
    const root = await this.store.getSyncRoot(userId, input.rootId);
    if (!root) throw new NotFoundException('Sync root not found');
    await this.devices.requireExecutor(userId, input.deviceId);
    if (root.deviceId !== input.deviceId) {
      throw new BadRequestException('This sync root belongs to another device');
    }
    if (input.relativePath.startsWith('/') || input.relativePath.split(/[\\/]/).includes('..')) {
      throw new BadRequestException('relativePath must remain inside the sync root');
    }

    const head = await this.store.getSyncHead(userId, input.rootId, input.relativePath);
    const conflict = Boolean(head && head.id !== input.baseVersionId);
    const id = randomUUID();
    const objectKey = input.deleted
      ? `tombstones/${userId}/${input.rootId}/${id}`
      : `users/${userId}/roots/${input.rootId}/${id}`;
    const version: SyncVersion = {
      ...input,
      id,
      userId,
      objectKey,
      conflict,
      createdAt: new Date().toISOString(),
    };
    await this.store.createSyncVersion(version);
    await this.audit.record(
      userId,
      conflict ? 'sync.conflict_created' : input.deleted ? 'sync.tombstone_created' : 'sync.version_created',
      { rootId: input.rootId, relativePath: input.relativePath, versionId: id },
      input.deviceId,
    );
    const uploadUrl = input.deleted
      ? null
      : await this.objects.signUpload(objectKey, input.sha256, input.size);
    return { version, uploadUrl };
  }

  listVersions(userId: string, rootId: string): Promise<SyncVersion[]> {
    return this.store.listSyncVersions(userId, rootId);
  }
}
