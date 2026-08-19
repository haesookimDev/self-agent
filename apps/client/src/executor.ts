import type { CommandEnvelope, RealtimeClientMessage, RealtimeServerMessage } from '@continuum/protocol';
import { invoke } from '@tauri-apps/api/core';
import { websocketUrl } from './api';

const TERMINAL_RESULTS_KEY = 'continuum.executorResults';

type ExecutorResult = Extract<RealtimeClientMessage, { type: 'command.result' }>['result'];

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
  const socket = new WebSocket(websocketUrl());
  let heartbeat: number | undefined;

  const send = (message: RealtimeClientMessage) => socket.send(JSON.stringify(message));
  socket.addEventListener('open', () => {
    send({ type: 'device.hello', deviceId, credential });
    heartbeat = window.setInterval(
      () => send({ type: 'device.heartbeat', deviceId }),
      20_000,
    );
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as RealtimeServerMessage;
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

  return () => {
    if (heartbeat) window.clearInterval(heartbeat);
    socket.close();
  };
}
