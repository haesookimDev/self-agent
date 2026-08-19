import { Controller, Get, Inject, Query } from '@nestjs/common';
import { UserId } from '../auth/user-id.decorator.js';
import { AuditService } from './audit.service.js';

@Controller('v1/audit')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  list(@UserId() userId: string, @Query('limit') limit?: string) {
    return this.audit.list(userId, limit ? Number(limit) : 100);
  }
}
