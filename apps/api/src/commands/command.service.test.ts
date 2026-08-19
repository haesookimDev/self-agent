import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { DeviceService } from '../devices/device.service.js';
import { ConnectionRegistry } from '../realtime/connection-registry.service.js';
import { MemoryStateStore } from '../storage/memory-state.store.js';
import { CommandService } from './command.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';

async function fixture() {
  const store = new MemoryStateStore();
  const audit = new AuditService(store);
  const devices = new DeviceService(store, audit);
  const connections = new ConnectionRegistry();
  const commands = new CommandService(store, devices, connections, audit);
  const registered = await devices.register(USER_ID, {
    name: 'Test PC',
    platform: 'windows',
    kind: 'executor',
    capabilities: {
      tools: ['file.read', 'file.write', 'system.install'],
      screenCapture: false,
      interactiveControl: false,
      fileSync: true,
    },
  });
  return { store, commands, deviceId: registered.device.id };
}

function expiresIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

describe('CommandService', () => {
  it('derives read policy on the server and queues without approval', async () => {
    const { commands, deviceId } = await fixture();
    const command = await commands.create(USER_ID, {
      targetDeviceId: deviceId,
      tool: 'file.read',
      args: { path: 'notes.txt' },
      idempotencyKey: 'read-notes-0001',
      expiresAt: expiresIn(5),
    });
    expect(command).toMatchObject({ risk: 'read', status: 'queued' });
  });

  it('requires a one-time decision before writes become queueable', async () => {
    const { commands, store, deviceId } = await fixture();
    const command = await commands.create(USER_ID, {
      targetDeviceId: deviceId,
      tool: 'file.write',
      args: { path: 'notes.txt', content: 'hello' },
      idempotencyKey: 'write-notes-0001',
      expiresAt: expiresIn(5),
    });
    expect(command.status).toBe('awaiting_approval');

    const approved = await commands.decide(USER_ID, command.id, {
      decision: 'approve',
      biometricVerified: false,
    });
    expect(approved.status).toBe('queued');
    expect((await store.getApproval(USER_ID, command.id))?.decision).toBe('approved');
    await expect(
      commands.decide(USER_ID, command.id, { decision: 'approve', biometricVerified: false }),
    ).rejects.toThrow('not awaiting approval');
  });

  it('enforces biometric verification for privileged commands', async () => {
    const { commands, deviceId } = await fixture();
    const command = await commands.create(USER_ID, {
      targetDeviceId: deviceId,
      tool: 'system.install',
      args: { package: 'example' },
      idempotencyKey: 'install-example-01',
      expiresAt: expiresIn(5),
    });
    await expect(
      commands.decide(USER_ID, command.id, { decision: 'approve', biometricVerified: false }),
    ).rejects.toThrow('Biometric verification');
  });

  it('returns the same command for an identical idempotent request', async () => {
    const { commands, deviceId } = await fixture();
    const request = {
      targetDeviceId: deviceId,
      tool: 'file.read' as const,
      args: { path: 'same.txt' },
      idempotencyKey: 'same-command-001',
      expiresAt: expiresIn(5),
    };
    const first = await commands.create(USER_ID, request);
    const second = await commands.create(USER_ID, request);
    expect(second.id).toBe(first.id);
  });
});
