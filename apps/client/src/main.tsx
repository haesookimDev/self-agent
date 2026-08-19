import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { completeLoginIfNeeded } from './auth';
import { startLocalExecutor } from './executor';
import './styles.css';

const deviceId = localStorage.getItem('continuum.deviceId');
const isTauri = '__TAURI_INTERNALS__' in window;
if (isTauri && deviceId) {
  const { invoke } = await import('@tauri-apps/api/core');
  const credential = await invoke<string>('load_device_credential', { deviceId }).catch(() => null);
  if (credential) startLocalExecutor(deviceId, credential);
}

await completeLoginIfNeeded();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
