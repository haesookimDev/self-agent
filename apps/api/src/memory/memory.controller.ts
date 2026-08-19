import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { MemoryKindSchema } from '@continuum/protocol';
import { z } from 'zod';
import { UserId } from '../auth/user-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MemoryService, type CreateMemoryInput } from './memory.service.js';

const CreateMemorySchema = z.object({
  kind: MemoryKindSchema,
  content: z.string().trim().min(1).max(20_000),
  source: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

@Controller('v1/memories')
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memories: MemoryService) {}

  @Get()
  list(@UserId() userId: string) {
    return this.memories.list(userId);
  }

  @Post()
  create(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(CreateMemorySchema)) input: CreateMemoryInput,
  ) {
    return this.memories.create(userId, input);
  }

  @Delete(':memoryId')
  @HttpCode(204)
  remove(@UserId() userId: string, @Param('memoryId') memoryId: string) {
    return this.memories.remove(userId, memoryId);
  }
}
