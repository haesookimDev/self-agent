import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { DeviceModule } from '../devices/device.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CommandController } from './command.controller.js';
import { CommandService } from './command.service.js';

@Module({
  imports: [AuditModule, DeviceModule, RealtimeModule],
  controllers: [CommandController],
  providers: [CommandService],
  exports: [CommandService],
})
export class CommandModule {}
