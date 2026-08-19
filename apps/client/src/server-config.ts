const SERVER_CONNECTION_KEY = 'continuum.serverConnection';

export interface ServerConnection {
  domain: string;
  appUrl: string;
  apiUrl: string;
  oidcIssuer: string;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function createServerConnection(input: string): ServerConnection {
  const value = input.trim();
  if (!value) throw new Error('서버 도메인을 입력하세요.');

  let parsed: URL;
  try {
    parsed = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new Error('올바른 서버 도메인을 입력하세요.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('서버 주소는 HTTP 또는 HTTPS여야 합니다.');
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('경로나 인증 정보 없이 플랫폼 도메인만 입력하세요.');
  }

  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith('api.')) hostname = hostname.slice(4);
  if (hostname.startsWith('auth.')) hostname = hostname.slice(5);
  if (!hostname) throw new Error('올바른 서버 도메인을 입력하세요.');

  const authority = `${hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  const origin = (prefix = '') => `${parsed.protocol}//${prefix}${authority}`;
  return {
    domain: authority,
    appUrl: origin(),
    apiUrl: origin('api.'),
    oidcIssuer: `${origin('auth.')}/realms/continuum`,
  };
}

export function loadServerConnection(): ServerConnection | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(SERVER_CONNECTION_KEY);
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<ServerConnection>;
    if (typeof value.appUrl !== 'string') return null;
    return createServerConnection(value.appUrl);
  } catch {
    return null;
  }
}

export function saveServerConnection(connection: ServerConnection): void {
  const previous = loadServerConnection();
  localStorage.setItem(SERVER_CONNECTION_KEY, JSON.stringify(connection));
  if (previous?.apiUrl !== connection.apiUrl || previous.oidcIssuer !== connection.oidcIssuer) {
    localStorage.removeItem('continuum.accessToken');
    localStorage.removeItem('continuum.refreshToken');
    localStorage.removeItem('continuum.tokenExpiresAt');
  }
}

export function needsServerConnection(): boolean {
  return isTauriRuntime() && loadServerConnection() === null;
}

export function apiBaseUrl(): string {
  return loadServerConnection()?.apiUrl ?? withoutTrailingSlash(import.meta.env.VITE_API_URL ?? 'http://localhost:3000');
}

export function oidcIssuer(): string | undefined {
  const configured = loadServerConnection()?.oidcIssuer ?? import.meta.env.VITE_OIDC_ISSUER;
  return configured ? withoutTrailingSlash(configured) : undefined;
}

export function oidcRedirectUri(): string {
  const connection = loadServerConnection();
  if (connection) {
    if (isTauriRuntime() && import.meta.env.DEV) return `${window.location.origin}/`;
    return `${connection.appUrl}/`;
  }
  return import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/`;
}
