import type { RealtimeClientMessage, RealtimeServerMessage } from '@continuum/protocol';

export class RemoteScreenSession {
  readonly peer: RTCPeerConnection;
  readonly commands: RTCDataChannel;

  constructor(
    readonly sessionId: string,
    readonly targetDeviceId: string,
    private readonly signal: (message: RealtimeClientMessage) => void,
    onStream: (stream: MediaStream) => void,
    iceServers: RTCIceServer[],
  ) {
    this.peer = new RTCPeerConnection({ iceServers });
    this.commands = this.peer.createDataChannel('input', { ordered: true });
    this.peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) onStream(stream);
    };
    this.peer.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal({ candidate: event.candidate.toJSON() });
    };
  }

  async offer(): Promise<void> {
    await this.peer.setLocalDescription(await this.peer.createOffer());
    this.sendSignal({ description: this.peer.localDescription?.toJSON() });
  }

  async receive(message: RealtimeServerMessage): Promise<void> {
    if (message.type !== 'webrtc.signal' || message.sessionId !== this.sessionId) return;
    const description = message.signal.description as RTCSessionDescriptionInit | undefined;
    const candidate = message.signal.candidate as RTCIceCandidateInit | undefined;
    if (description) await this.peer.setRemoteDescription(description);
    if (candidate) await this.peer.addIceCandidate(candidate);
  }

  sendPointer(x: number, y: number, action: 'move' | 'down' | 'up'): void {
    if (this.commands.readyState === 'open') {
      this.commands.send(JSON.stringify({ type: 'pointer', x, y, action }));
    }
  }

  close(): void {
    this.commands.close();
    this.peer.close();
  }

  private sendSignal(signal: Record<string, unknown>): void {
    this.signal({
      type: 'webrtc.signal',
      targetDeviceId: this.targetDeviceId,
      sessionId: this.sessionId,
      signal,
    });
  }
}
