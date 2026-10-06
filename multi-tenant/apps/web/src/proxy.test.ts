// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

function request(path: string, headers: Record<string, string> = {}) {
  // The internal address a reverse proxy (e.g. Codespaces port forwarding) talks to.
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe('proxy', () => {
  // The redirect stays on the request's host; Next turns it into a relative Location header (an
  // end-to-end test checks that through the real server).
  it('sends visitors without a session to the login page', () => {
    const response = proxy(request('/students?page=2'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fstudents%3Fpage%3D2',
    );
  });

  it('omits the next parameter for the default home page', () => {
    expect(proxy(request('/dashboard')).headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });

  it('lets public pages and signed-in visitors through with a nonce-based CSP', () => {
    for (const response of [
      proxy(request('/login')),
      proxy(request('/students', { cookie: 'sid=opaque' })),
      proxy(request('/students', { cookie: '__Host-sid=opaque' })),
    ]) {
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('content-security-policy')).toMatch(/script-src 'self' 'nonce-/);
    }
  });

  it('asks browsers to upgrade insecure requests only behind TLS', () => {
    const plain = proxy(request('/login')).headers.get('content-security-policy');
    const tls = proxy(request('/login', { 'x-forwarded-proto': 'https' })).headers.get(
      'content-security-policy',
    );
    expect(plain).not.toContain('upgrade-insecure-requests');
    expect(tls).toContain('upgrade-insecure-requests');
  });
});
