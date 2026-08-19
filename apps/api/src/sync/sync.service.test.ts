import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { DeviceService } from '../devices/device.service.js';
import { MemoryStateStore } from '../storage/memory-state.store.js';
import { SyncService } from './sync.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';

describe('SyncService', () => {
  it('preserves both versions when two devices edit the same base', async () => {
    const store = new MemoryStateStore();
    const audit = new AuditService(store);
    const devices = new DeviceService(store, audit);
    const registered = await devices.register(USER_ID, {
      name: 'Sync PC',
      platform: 'macos',
      kind: 'executor',
      capabilities: {
        tools: ['file.read'],
        screenCapture: false,
        interactiveControl: false,
        fileSync: true,
      },
    });
    const objects = { signUpload: async () => 'https://upload.invalid/signed' };
    const sync = new SyncService(store, devices, objects as never, audit);
    const root = await sync.createRoot(USER_ID, {
      deviceId: registered.device.id,
      displayName: 'Workspace',
      localPath: '/workspace',
    });
    const base = await sync.registerVersion(USER_ID, {
      deviceId: registered.device.id,
      rootId: root.id,
      relativePath: 'notes.txt',
      baseVersionId: null,
      sha256: 'a'.repeat(64),
      size: 10,
      deleted: false,
    });
    const conflict = await sync.registerVersion(USER_ID, {
      deviceId: registered.device.id,
      rootId: root.id,
      relativePath: 'notes.txt',
      baseVersionId: null,
      sha256: 'b'.repeat(64),
      size: 12,
      deleted: false,
    });
    expect(base.version.conflict).toBe(false);
    expect(conflict.version.conflict).toBe(true);
    expect(await sync.listVersions(USER_ID, root.id)).toHaveLength(2);
  });
});
