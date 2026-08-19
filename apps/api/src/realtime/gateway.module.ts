import { Module } from '@nestjs/common';
import { CommandModule } from '../commands/command.module.js';
import { DeviceModule } from '../devices/device.module.js';
import { DeviceGateway } from './device.gateway.js';
import { RealtimeModule } from './realtime.module.js';

@Module({
  imports: [CommandModule, DeviceModule, RealtimeModule],
  providers: [DeviceGateway],
})
export class GatewayModule {}
