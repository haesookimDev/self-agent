import { Global, Module } from '@nestjs/common';
import { config } from '../config.js';
import { MemoryStateStore } from './memory-state.store.js';
import { PostgresStateStore } from './postgres-state.store.js';
import { STATE_STORE, type StateStore } from './storage.types.js';

@Global()
@Module({
  providers: [
    {
      provide: STATE_STORE,
      useFactory: (): StateStore => {
        const databaseUrl = config().DATABASE_URL;
        return databaseUrl ? new PostgresStateStore(databaseUrl) : new MemoryStateStore();
      },
    },
  ],
  exports: [STATE_STORE],
})
export class StorageModule {}
