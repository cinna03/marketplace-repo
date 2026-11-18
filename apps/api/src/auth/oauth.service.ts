import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OauthProvider } from '@prisma/client';
import jwt, { JwtPayload } from 'jsonwebtoken';
import jwks, { JwksClient } from 'jwks-rsa';
import { ApiError } from '../common/errors';
import { OauthProfile, profileFromClaims } from './oauth-claims';

@Injectable()
export class OauthService {
  private readonly googleKeys: JwksClient;
  private readonly appleKeys: JwksClient;

  constructor(private readonly config: ConfigService) {
    this.googleKeys = jwks({
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      cache: true,
      rateLimit: true,
    });
    this.appleKeys = jwks({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      rateLimit: true,
    });
  }

  async verify(provider: OauthProvider, idToken: string): Promise<OauthProfile> {
    const clientId =
      provider === 'google'
        ? this.config.get<string>('GOOGLE_CLIENT_ID')
        : this.config.get<string>('APPLE_CLIENT_ID');
    if (!clientId) {
      throw new ApiError(503, 'OAUTH_NOT_CONFIGURED', 'This sign-in provider is not configured.');
    }

    const payload = await this.verifyRs256(idToken, provider === 'google' ? this.googleKeys : this.appleKeys, {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: provider === 'google' ? ['https://accounts.google.com', 'accounts.google.com'] : 'https://appleid.apple.com',
    });
    return profileFromClaims(provider, payload);
  }

  private verifyRs256(idToken: string, keys: JwksClient, options: jwt.VerifyOptions): Promise<JwtPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        (header, callback) => {
          if (!header.kid) {
            callback(new Error('missing kid'));
            return;
          }
          keys.getSigningKey(header.kid, (error, key) => {
            if (error || !key) {
              callback(error ?? new Error('missing signing key'));
              return;
            }
            callback(null, key.getPublicKey());
          });
        },
        options,
        (error, decoded) => {
          if (error || !decoded || typeof decoded === 'string') {
            reject(new ApiError(401, 'OAUTH_INVALID', 'The sign-in token was rejected.'));
            return;
          }
          resolve(decoded);
        },
      );
    });
  }
}
