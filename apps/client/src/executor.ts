import type { CommandEnvelope, RealtimeClientMessage, RealtimeServerMessage } from '@continuum/protocol';
import { invoke } from '@tauri-apps/api/core';
import { websocketUrl } from './api';

const TERMINAL_RESULTS_KEY = 'continuum.executorResults';

type ExecutorResult = Extract<RealtimeClientMessage, { type: 'command.result' }>['result'];

export type ExecutorConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface ExecutorStatus {
  state: ExecutorConnectionState;
  deviceId: string | null;
  message: string;
}

let executorStatus: ExecutorStatus = {
  state: 'idle',
  deviceId: null,
  message: 'PC 실행기 자격 증명이 아직 연결되지 않았습니다.',
};
let stopActiveExecutor: (() => void) | undefined;
const statusListeners = new Set<(status: ExecutorStatus) => void>();

function updateExecutorStatus(status: ExecutorStatus): void {
  executorStatus = status;
  for (const listener of statusListeners) listener(status);
}

export function getExecutorStatus(): ExecutorStatus {
  return executorStatus;
}

export function subscribeExecutorStatus(listener: (status: ExecutorStatus) => void): () => void {
  statusListeners.add(listener);
  listener(executorStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

function cachedResults(): Record<string, ExecutorResult> {
  try {
    return JSON.parse(localStorage.getItem(TERMINAL_RESULTS_KEY) ?? '{}') as Record<string, ExecutorResult>;
  } catch {
    return {};
  }
}

function cacheResult(result: ExecutorResult): void {
  const cache = cachedResults();
  cache[result.commandId] = result;
  const trimmed = Object.fromEntries(Object.entries(cache).slice(-500));
  localStorage.setItem(TERMINAL_RESULTS_KEY, JSON.stringify(trimmed));
}

async function execute(command: CommandEnvelope): Promise<Record<string, unknown>> {
  switch (command.tool) {
    case 'file.list':
      return { entries: await invoke('list_directory', command.args) };
    case 'file.read':
      return { content: await invoke('read_text_file', command.args) };
    case 'file.write':
      await invoke('write_text_file', command.args);
      return { written: true };
    case 'file.trash':
      await invoke('trash_path', command.args);
      return { trashed: true };
    case 'screen.snapshot':
      return { pngBase64: await invoke('capture_primary_screen') };
    case 'app.launch':
      await invoke('launch_allowed_app', command.args);
      return { launched: true };
    default:
      throw new Error(`Tool ${command.tool} is not supported by this executor build`);
  }
}

export function startLocalExecutor(deviceId: string, credential: string): () => void {
  stopActiveExecutor?.();
  updateExecutorStatus({ state: 'connecting', deviceId, message: '제어 서버에 연결하는 중입니다.' });

  let socket: WebSocket;
  try {
    socket = new WebSocket(websocketUrl());
  } catch (error) {
    updateExecutorStatus({
      state: 'error',
      deviceId,
      message: error instanceof Error ? error.message : String(error),
    });
    return () => undefined;
  }
  let heartbeat: number | undefined;
  let stopped = false;

  const send = (message: RealtimeClientMessage) => socket.send(JSON.stringify(message));
  socket.addEventListener('open', () => {
    if (stopped) return;
    updateExecutorStatus({ state: 'authenticating', deviceId, message: 'Device ID와 credential을 확인하는 중입니다.' });
    send({ type: 'device.hello', deviceId, credential });
    heartbeat = window.setInterval(
      () => send({ type: 'device.heartbeat', deviceId }),
      20_000,
    );
  });
  socket.addEventListener('message', (event) => {
    if (stopped) return;
    let message: RealtimeServerMessage;
    try {
      message = JSON.parse(String(event.data)) as RealtimeServerMessage;
    } catch {
      updateExecutorStatus({ state: 'error', deviceId, message: '서버가 올바르지 않은 실시간 메시지를 보냈습니다.' });
      return;
    }
    if (message.type === 'device.accepted') {
      updateExecutorStatus({ state: 'connected', deviceId, message: '자격 증명이 확인되어 PC 실행기가 온라인입니다.' });
      return;
    }
    if (message.type === 'error') {
      updateExecutorStatus({ state: 'error', deviceId, message: `${message.code}: ${message.message}` });
      return;
    }
    if (message.type !== 'command.dispatch') return;
    const previous = cachedResults()[message.command.id];
    if (previous) {
      send({ type: 'command.result', result: previous });
      return;
    }
    void (async () => {
      send({
        type: 'command.result',
        result: { commandId: message.command.id, status: 'running' },
      });
      let result: ExecutorResult;
      try {
        const output = await execute(message.command);
        result = {
          commandId: message.command.id,
          status: 'succeeded',
          output,
          finishedAt: new Date().toISOString(),
        };
      } catch (error) {
        result = {
          commandId: message.command.id,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString(),
        };
      }
      cacheResult(result);
      send({ type: 'command.result', result });
    })();
  });
  socket.addEventListener('error', () => {
    if (!stopped && executorStatus.state !== 'error') {
      updateExecutorStatus({ state: 'error', deviceId, message: '실행기 WebSocket 연결에 실패했습니다.' });
    }
  });
  socket.addEventListener('close', (event) => {
    if (heartbeat) window.clearInterval(heartbeat);
    if (!stopped && executorStatus.state !== 'error') {
      const reason = event.reason ? `: ${event.reason}` : '';
      updateExecutorStatus({ state: 'disconnected', deviceId, message: `서버 연결이 종료되었습니다${reason}` });
    }
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (heartbeat) window.clearInterval(heartbeat);
    socket.close();
    if (stopActiveExecutor === stop) stopActiveExecutor = undefined;
  };
  stopActiveExecutor = stop;
  return stop;
}
