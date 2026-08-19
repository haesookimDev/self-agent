import { describe, expect, it } from 'vitest';
import { createServerConnection } from './server-config';

describe('createServerConnection', () => {
  it('derives API and OIDC endpoints from a platform domain', () => {
    expect(createServerConnection('continuum.localtest.me')).toEqual({
      domain: 'continuum.localtest.me',
      appUrl: 'https://continuum.localtest.me',
      apiUrl: 'https://api.continuum.localtest.me',
      oidcIssuer: 'https://auth.continuum.localtest.me/realms/continuum',
    });
  });

  it('normalizes a pasted API URL to the platform domain', () => {
    expect(createServerConnection('http://api.continuum.test:8443')).toEqual({
      domain: 'continuum.test:8443',
      appUrl: 'http://continuum.test:8443',
      apiUrl: 'http://api.continuum.test:8443',
      oidcIssuer: 'http://auth.continuum.test:8443/realms/continuum',
    });
  });

  it('rejects paths because the input must be a domain', () => {
    expect(() => createServerConnection('https://continuum.test/path')).toThrow(
      '플랫폼 도메인만 입력하세요',
    );
  });
});
