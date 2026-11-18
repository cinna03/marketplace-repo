import { RoleName } from '@marketplace/contracts';

export const JWT_ISSUER = 'marketplace-api';
export const JWT_AUDIENCE = 'marketplace';
export const REFRESH_COOKIE = 'marketplace_refresh';

export type RequestUser = {
  id: string;
  email: string;
  roles: RoleName[];
  tokenVersion: number;
};

export type AccessTokenPayload = {
  sub: string;
  roles: RoleName[];
  tv: number;
  purpose: 'access' | 'mfa';
};
