import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Device, DeviceCapabilities, DeviceKind, DevicePlatform } from '@continuum/protocol';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { STATE_STORE, type StateStore, type StoredDevice } from '../storage/storage.types.js';

export interface RegisterDeviceInput {
  name: string;
  platform: DevicePlatform;
  kind: DeviceKind;
  capabilities: DeviceCapabilities;
}

export interface RegisteredDevice {
  device: Device;
  credential: string;
}

function credentialHash(credential: string): string {
  return createHash('sha256').update(credential).digest('hex');
}

@Injectable()
export class DeviceService {
  constructor(
    @Inject(STATE_STORE) private readonly store: StateStore,
    private readonly audit: AuditService,
  ) {}

  async register(userId: string, input: RegisterDeviceInput): Promise<RegisteredDevice> {
    const devices = await this.store.listDevices(userId);
    if (devices.some((device) => device.name.toLocaleLowerCase() === input.name.toLocaleLowerCase())) {
      throw new ConflictException('A device with this name is already registered');
    }

    const credential = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    const stored: StoredDevice = {
      id: randomUUID(),
      userId,
      name: input.name,
      platform: input.platform,
      kind: input.kind,
      capabilities: input.capabilities,
      online: false,
      lastSeenAt: null,
      createdAt: now,
      credentialHash: credentialHash(credential),
    };
    await this.store.createDevice(stored);
    await this.audit.record(userId, 'device.registered', { name: stored.name, kind: stored.kind }, stored.id);
    const { credentialHash: _credentialHash, ...device } = stored;
    return { device, credential };
  }

  list(userId: string): Promise<Device[]> {
    return this.store.listDevices(userId);
  }

  async requireExecutor(userId: string, deviceId: string): Promise<StoredDevice> {
    const device = await this.store.getDevice(userId, deviceId);
    if (!device || device.kind !== 'executor') throw new NotFoundException('Executor device not found');
    return device;
  }

  async authenticate(deviceId: string, credential: string): Promise<StoredDevice | null> {
    const device = await this.store.getDeviceById(deviceId);
    if (!device) return null;
    const supplied = Buffer.from(credentialHash(credential));
    const expected = Buffer.from(device.credentialHash);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? device : null;
  }

  setPresence(deviceId: string, online: boolean): Promise<void> {
    return this.store.updateDevicePresence(deviceId, online, new Date().toISOString());
  }
}
