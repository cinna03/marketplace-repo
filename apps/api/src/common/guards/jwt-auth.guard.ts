import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiError } from '../errors';
import { AccessTokenPayload, RequestUser } from '../types';
import { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7));
    } catch {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    if (payload.purpose !== 'access') {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.status !== 'active' || user.tokenVersion !== payload.tv) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required');
    }

    const requestUser: RequestUser = {
      id: user.id,
      email: user.email,
      roles: user.roles.map((entry) => entry.role.name),
      tokenVersion: user.tokenVersion,
    };
    request.user = requestUser;
    return true;
  }
}
