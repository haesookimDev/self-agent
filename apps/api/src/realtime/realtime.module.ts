import { Module } from '@nestjs/common';
import { ConnectionRegistry } from './connection-registry.service.js';

@Module({
  providers: [ConnectionRegistry],
  exports: [ConnectionRegistry],
})
export class RealtimeModule {}
