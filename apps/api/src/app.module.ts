import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { CommandModule } from './commands/command.module.js';
import { DeviceModule } from './devices/device.module.js';
import { HealthController } from './health.controller.js';
import { ImprovementModule } from './improvements/improvement.module.js';
import { MemoryModule } from './memory/memory.module.js';
import { GatewayModule } from './realtime/gateway.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { StorageModule } from './storage/storage.module.js';
import { SyncModule } from './sync/sync.module.js';

@Module({
  imports: [
    StorageModule,
    RealtimeModule,
    AuditModule,
    DeviceModule,
    CommandModule,
    GatewayModule,
    MemoryModule,
    ImprovementModule,
    SyncModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
