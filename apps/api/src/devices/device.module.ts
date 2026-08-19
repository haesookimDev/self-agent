import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { DeviceController } from './device.controller.js';
import { DeviceService } from './device.service.js';

@Module({
  imports: [AuditModule],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}
