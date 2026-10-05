import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../platform/config/env.js';
import type { IssuedSession } from './session.service.js';

function baseOptions(config: AppConfig): CookieOptions {
  return { sameSite: 'lax', secure: config.cookieSecure, path: '/' };
}

/**
 * Session cookie: HttpOnly (unreachable from scripts). CSRF cookie: readable by the web app,
 * which echoes it in the `x-csrf-token` header; the API compares it with the hash stored on the
 * session (synchronizer token pattern with cookie transport).
 */
export function setSessionCookies(res: Response, config: AppConfig, session: IssuedSession): void {
  res.cookie(config.sessionCookieName, session.token, {
    ...baseOptions(config),
    httpOnly: true,
    expires: session.expiresAt,
  });
  res.cookie(config.csrfCookieName, session.csrfToken, {
    ...baseOptions(config),
    httpOnly: false,
    expires: session.expiresAt,
  });
}

export function clearSessionCookies(res: Response, config: AppConfig): void {
  res.clearCookie(config.sessionCookieName, { ...baseOptions(config), httpOnly: true });
  res.clearCookie(config.csrfCookieName, { ...baseOptions(config), httpOnly: false });
}
