import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  mfaChallengeSchema,
  mfaConfirmSchema,
  oauthSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '@marketplace/contracts';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiError } from '../common/errors';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequestUser } from '../common/types';
import { AuthService, toPublicSession } from './auth.service';
import { refreshCookieName, refreshCookieOptions } from './cookies';

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('providers')
  providers() {
    return {
      googleClientId: this.config.get<string>('GOOGLE_CLIENT_ID') || null,
      appleClientId: this.config.get<string>('APPLE_CLIENT_ID') || null,
    };
  }

  @Post('register')
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: { email: string; password: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(body.email, body.password, request.ip);
    return this.present(response, result);
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: { email: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.email, body.password);
    return this.present(response, result);
  }

  @Post('refresh')
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const raw = body.refreshToken ?? request.cookies?.[refreshCookieName];
    if (!raw) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in again.');
    const session = await this.auth.refresh(raw);
    this.setCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      tokenType: 'Bearer' as const,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(body.refreshToken ?? request.cookies?.[refreshCookieName]);
    response.clearCookie(refreshCookieName, this.cookieOptions(0));
  }

  @Post('oauth/google')
  async google(
    @Body(new ZodValidationPipe(oauthSchema)) body: { idToken: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.present(response, await this.auth.signInWithProvider('google', body.idToken));
  }

  @Post('oauth/apple')
  async apple(
    @Body(new ZodValidationPipe(oauthSchema)) body: { idToken: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.present(response, await this.auth.signInWithProvider('apple', body.idToken));
  }

  @Post('mfa/enroll')
  @UseGuards(JwtAuthGuard)
  enroll(@CurrentUser() user: RequestUser) {
    return this.auth.enrollMfa(user.id, user.email);
  }

  @Post('mfa/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async confirm(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(mfaConfirmSchema)) body: { code: string },
    @Req() request: Request,
  ) {
    await this.auth.confirmMfa(user.id, body.code, request.ip);
  }

  @Post('mfa/challenge')
  async challenge(
    @Body(new ZodValidationPipe(mfaChallengeSchema)) body: { mfaToken: string; code: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.challengeMfa(body.mfaToken, body.code);
    return this.present(response, session);
  }

  @Post('password/forgot')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async forgot(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string }) {
    const resetUrl = await this.auth.forgotPassword(body.email);
    const local = this.config.get<string>('NODE_ENV') === 'development';
    return {
      message: 'If an account exists for that email, a reset link is on the way.',
      ...(local && resetUrl ? { resetUrl } : {}),
    };
  }

  @Post('password/reset')
  @HttpCode(204)
  async reset(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string },
    @Req() request: Request,
  ) {
    await this.auth.resetPassword(body.token, body.password, request.ip);
  }

  private present(
    response: Response,
    result: Awaited<ReturnType<AuthService['login']>>,
  ) {
    if ('mfaRequired' in result) return result;
    this.setCookie(response, result.refreshToken);
    return toPublicSession(result);
  }

  private setCookie(response: Response, refreshToken: string) {
    response.cookie(refreshCookieName, refreshToken, this.cookieOptions(this.refreshMaxAge()));
  }

  private cookieOptions(maxAge: number) {
    return refreshCookieOptions(this.config.get<string>('NODE_ENV') === 'production', maxAge);
  }

  private refreshMaxAge() {
    return this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000;
  }
}
