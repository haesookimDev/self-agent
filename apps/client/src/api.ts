import type {
  ActionResult,
  Approval,
  ApprovalDecision,
  CommandEnvelope,
  CommandRequest,
  Device,
  ImprovementCandidate,
  MemoryItem,
} from '@continuum/protocol';
import { refreshAccessToken } from './auth';
import { apiBaseUrl } from './server-config';

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? '00000000-0000-4000-8000-000000000001';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const token = localStorage.getItem('continuum.accessToken');
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : { 'x-user-id': DEV_USER_ID }),
      ...init?.headers,
    },
  });
  if (response.status === 401 && !retried && (await refreshAccessToken())) {
    return request<T>(path, init, true);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(payload?.message ?? `Request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  devices: () => request<Device[]>('/v1/devices'),
  commands: () => request<CommandEnvelope[]>('/v1/commands?limit=100'),
  approvals: () => request<Approval[]>('/v1/commands/approvals/pending'),
  memories: () => request<MemoryItem[]>('/v1/memories'),
  candidates: () => request<ImprovementCandidate[]>('/v1/improvements/candidates'),
  sendCommand: (body: CommandRequest) =>
    request<CommandEnvelope>('/v1/commands', { method: 'POST', body: JSON.stringify(body) }),
  commandResult: (commandId: string) => request<ActionResult | null>(`/v1/commands/${commandId}/result`),
  decide: (commandId: string, body: ApprovalDecision) =>
    request<CommandEnvelope>(`/v1/commands/${commandId}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createMemory: (body: Pick<MemoryItem, 'kind' | 'content' | 'source' | 'confidence'>) =>
    request<MemoryItem>('/v1/memories', { method: 'POST', body: JSON.stringify(body) }),
  createCandidate: (
    body: Pick<ImprovementCandidate, 'kind' | 'title' | 'before' | 'after' | 'rationale'>,
  ) =>
    request<ImprovementCandidate>('/v1/improvements/candidates', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  candidateAction: (candidateId: string, action: 'evaluate' | 'activate' | 'rollback') =>
    request<ImprovementCandidate>(`/v1/improvements/candidates/${candidateId}/${action}`, {
      method: 'POST',
    }),
};

export function websocketUrl(): string {
  return `${apiBaseUrl().replace(/^http/, 'ws')}/v1/events`;
}
