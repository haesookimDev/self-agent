import { Inject, Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, type OnGatewayConnection, type OnGatewayDisconnect } from '@nestjs/websockets';
import { RealtimeClientMessageSchema, type RealtimeServerMessage } from '@continuum/protocol';
import type { RawData } from 'ws';
import WebSocket from 'ws';
import { CommandService } from '../commands/command.service.js';
import { DeviceService } from '../devices/device.service.js';
import { STATE_STORE, type StateStore } from '../storage/storage.types.js';
import { ConnectionRegistry } from './connection-registry.service.js';

@Injectable()
@WebSocketGateway({ path: '/v1/events' })
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(DeviceGateway.name);

  constructor(
    @Inject(STATE_STORE) private readonly store: StateStore,
    private readonly devices: DeviceService,
    private readonly commands: CommandService,
    private readonly connections: ConnectionRegistry,
  ) {}

  handleConnection(client: WebSocket): void {
    client.on('message', (raw) => void this.onMessage(client, raw));
    client.on('error', (error) => this.logger.warn(`WebSocket error: ${error.message}`));
  }

  handleDisconnect(client: WebSocket): void {
    const deviceId = this.connections.detach(client);
    if (deviceId) void this.devices.setPresence(deviceId, false);
  }

  private async onMessage(client: WebSocket, raw: RawData): Promise<void> {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.toString());
    } catch {
      return this.error(client, 'invalid_json', 'Message must be valid JSON');
    }
    const parsed = RealtimeClientMessageSchema.safeParse(decoded);
    if (!parsed.success) return this.error(client, 'invalid_message', 'Message schema is invalid');

    try {
      const message = parsed.data;
      if (message.type === 'device.hello') {
        const device = await this.devices.authenticate(message.deviceId, message.credential);
        if (!device) {
          this.error(client, 'unauthorized', 'Device credentials are invalid');
          client.close(4003, 'Unauthorized');
          return;
        }
        this.connections.attach(device.id, client);
        await this.devices.setPresence(device.id, true);
        this.send(client, { type: 'device.accepted', deviceId: device.id });
        if (device.kind === 'executor') await this.commands.dispatchPendingForDevice(device.id);
        return;
      }

      const sourceDeviceId = this.connections.deviceFor(client);
      if (!sourceDeviceId) return this.error(client, 'unauthorized', 'Send device.hello first');

      if (message.type === 'device.heartbeat') {
        if (message.deviceId !== sourceDeviceId) {
          return this.error(client, 'forbidden', 'Heartbeat device does not match session');
        }
        await this.devices.setPresence(sourceDeviceId, true);
        return;
      }
      if (message.type === 'command.result') {
        const command = await this.commands.acceptResult(sourceDeviceId, message.result);
        this.send(client, { type: 'command.updated', command });
        return;
      }
      if (message.type === 'webrtc.signal') {
        const source = await this.store.getDeviceById(sourceDeviceId);
        const target = source
          ? await this.store.getDevice(source.userId, message.targetDeviceId)
          : null;
        if (!source || !target) return this.error(client, 'forbidden', 'Target device is outside this account');
        if (
          !this.connections.send(target.id, {
            type: 'webrtc.signal',
            sourceDeviceId,
            sessionId: message.sessionId,
            signal: message.signal,
          })
        ) {
          return this.error(client, 'device_offline', 'Target device is offline');
        }
      }
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : String(error));
      this.error(client, 'request_failed', error instanceof Error ? error.message : 'Request failed');
    }
  }

  private send(client: WebSocket, message: RealtimeServerMessage): void {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  }

  private error(client: WebSocket, code: string, message: string): void {
    this.send(client, { type: 'error', code, message });
  }
}
