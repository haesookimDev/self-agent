import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ImprovementController } from './improvement.controller.js';
import { ImprovementQueueService } from './improvement-queue.service.js';
import { ImprovementService } from './improvement.service.js';

@Module({
  imports: [AuditModule],
  providers: [ImprovementService, ImprovementQueueService],
  controllers: [ImprovementController],
})
export class ImprovementModule {}
