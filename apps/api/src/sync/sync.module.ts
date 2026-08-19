import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { DeviceModule } from '../devices/device.module.js';
import { ObjectStoreService } from './object-store.service.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [AuditModule, DeviceModule],
  providers: [SyncService, ObjectStoreService],
  controllers: [SyncController],
})
export class SyncModule {}
