import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MemoryController } from './memory.controller.js';
import { MemoryService } from './memory.service.js';

@Module({
  imports: [AuditModule],
  providers: [MemoryService],
  controllers: [MemoryController],
})
export class MemoryModule {}
