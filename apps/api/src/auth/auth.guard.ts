import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { IS_PUBLIC } from './public.decorator.js';

export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  userId?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly appConfig = config();
  private readonly jwks = this.appConfig.OIDC_JWKS_URL
    ? createRemoteJWKSet(new URL(this.appConfig.OIDC_JWKS_URL))
    : undefined;

  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (this.appConfig.AUTH_DISABLED) {
      const requestedUser = request.headers['x-user-id'];
      request.userId = typeof requestedUser === 'string' ? requestedUser : DEV_USER_ID;
      return true;
    }

    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }
    if (!this.jwks || !this.appConfig.OIDC_ISSUER || !this.appConfig.OIDC_AUDIENCE) {
      throw new UnauthorizedException('OIDC is not configured');
    }

    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.jwks, {
        issuer: this.appConfig.OIDC_ISSUER,
        audience: this.appConfig.OIDC_AUDIENCE,
      });
      if (!payload.sub) throw new Error('Token has no subject');
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
