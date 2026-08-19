import { Injectable } from '@nestjs/common';
import type { RealtimeServerMessage } from '@continuum/protocol';
import WebSocket from 'ws';

@Injectable()
export class ConnectionRegistry {
  private readonly byDevice = new Map<string, WebSocket>();
  private readonly bySocket = new WeakMap<WebSocket, string>();

  attach(deviceId: string, socket: WebSocket): void {
    const previous = this.byDevice.get(deviceId);
    if (previous && previous !== socket) previous.close(4001, 'Device connected elsewhere');
    this.byDevice.set(deviceId, socket);
    this.bySocket.set(socket, deviceId);
  }

  detach(socket: WebSocket): string | undefined {
    const deviceId = this.bySocket.get(socket);
    if (deviceId && this.byDevice.get(deviceId) === socket) this.byDevice.delete(deviceId);
    return deviceId;
  }

  deviceFor(socket: WebSocket): string | undefined {
    return this.bySocket.get(socket);
  }

  isOnline(deviceId: string): boolean {
    return this.byDevice.get(deviceId)?.readyState === WebSocket.OPEN;
  }

  send(deviceId: string, message: RealtimeServerMessage): boolean {
    const socket = this.byDevice.get(deviceId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
}
