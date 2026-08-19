import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';

export const UserId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.userId) throw new Error('AuthGuard did not attach a user id');
  return request.userId;
});
