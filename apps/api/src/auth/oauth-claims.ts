import { JwtPayload } from 'jsonwebtoken';
import { OauthProvider } from '@prisma/client';
import { ApiError } from '../common/errors';

export type OauthProfile = {
  provider: OauthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
};

export function profileFromClaims(provider: OauthProvider, payload: JwtPayload): OauthProfile {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new ApiError(401, 'OAUTH_INVALID', 'The sign-in token was rejected.');
  }

  if (typeof payload.email !== 'string' || payload.email.length === 0) {
    throw new ApiError(400, 'OAUTH_EMAIL_REQUIRED', 'The identity provider did not share an email address.');
  }

  const verified = payload.email_verified === true || payload.email_verified === 'true';
  if (!verified) {
    throw new ApiError(401, 'OAUTH_EMAIL_UNVERIFIED', 'The identity provider has not verified this email.');
  }

  return {
    provider,
    providerUserId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
  };
}
