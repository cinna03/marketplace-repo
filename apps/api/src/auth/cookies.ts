import { CookieOptions } from 'express';
import { REFRESH_COOKIE } from '../common/types';

export function refreshCookieOptions(secure: boolean, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/v1/auth',
    maxAge: maxAgeMs,
  };
}

export const refreshCookieName = REFRESH_COOKIE;
