const issuer = import.meta.env.VITE_OIDC_ISSUER;
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID ?? 'continuum-client';
const redirectUri = import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/`;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function challenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function authConfigured(): boolean {
  return Boolean(issuer);
}

export function authenticated(): boolean {
  return Boolean(localStorage.getItem('continuum.accessToken'));
}

export async function login(): Promise<void> {
  if (!issuer) return;
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const state = crypto.randomUUID();
  sessionStorage.setItem('continuum.pkceVerifier', verifier);
  sessionStorage.setItem('continuum.oidcState', state);
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: 'S256',
  });
  window.location.assign(`${issuer}/protocol/openid-connect/auth?${query}`);
}

export async function completeLoginIfNeeded(): Promise<void> {
  if (!issuer) return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return;
  const expectedState = sessionStorage.getItem('continuum.oidcState');
  const verifier = sessionStorage.getItem('continuum.pkceVerifier');
  if (!expectedState || expectedState !== url.searchParams.get('state') || !verifier) {
    throw new Error('OIDC state validation failed');
  }
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error('OIDC token exchange failed');
  const token = (await response.json()) as TokenResponse;
  localStorage.setItem('continuum.accessToken', token.access_token);
  if (token.refresh_token) localStorage.setItem('continuum.refreshToken', token.refresh_token);
  localStorage.setItem('continuum.tokenExpiresAt', String(Date.now() + token.expires_in * 1_000));
  sessionStorage.removeItem('continuum.pkceVerifier');
  sessionStorage.removeItem('continuum.oidcState');
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('session_state');
  window.history.replaceState({}, '', url);
}

export function logout(): void {
  localStorage.removeItem('continuum.accessToken');
  localStorage.removeItem('continuum.refreshToken');
  localStorage.removeItem('continuum.tokenExpiresAt');
  if (issuer) {
    const query = new URLSearchParams({ client_id: clientId, post_logout_redirect_uri: redirectUri });
    window.location.assign(`${issuer}/protocol/openid-connect/logout?${query}`);
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  if (!issuer) return false;
  const refreshToken = localStorage.getItem('continuum.refreshToken');
  if (!refreshToken) return false;
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    localStorage.removeItem('continuum.accessToken');
    localStorage.removeItem('continuum.refreshToken');
    return false;
  }
  const token = (await response.json()) as TokenResponse;
  localStorage.setItem('continuum.accessToken', token.access_token);
  if (token.refresh_token) localStorage.setItem('continuum.refreshToken', token.refresh_token);
  localStorage.setItem('continuum.tokenExpiresAt', String(Date.now() + token.expires_in * 1_000));
  return true;
}
