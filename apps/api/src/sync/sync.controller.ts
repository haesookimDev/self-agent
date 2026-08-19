import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { IdSchema, SyncVersionRequestSchema, type SyncVersionRequest } from '@continuum/protocol';
import { z } from 'zod';
import { UserId } from '../auth/user-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SyncService, type CreateRootInput } from './sync.service.js';

const CreateRootSchema = z.object({
  deviceId: IdSchema,
  displayName: z.string().trim().min(1).max(200),
  localPath: z.string().min(1).max(4_000),
});

@Controller('v1/sync')
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  @Get('roots')
  roots(@UserId() userId: string) {
    return this.sync.listRoots(userId);
  }

  @Post('roots')
  createRoot(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(CreateRootSchema)) input: CreateRootInput,
  ) {
    return this.sync.createRoot(userId, input);
  }

  @Post('versions')
  registerVersion(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(SyncVersionRequestSchema)) input: SyncVersionRequest,
  ) {
    return this.sync.registerVersion(userId, input);
  }

  @Get('roots/:rootId/versions')
  versions(@UserId() userId: string, @Param('rootId') rootId: string) {
    return this.sync.listVersions(userId, rootId);
  }
}
