import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApprovalDecisionSchema, CommandRequestSchema, type ApprovalDecision, type CommandRequest } from '@continuum/protocol';
import { UserId } from '../auth/user-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CommandService } from './command.service.js';

@Controller('v1/commands')
export class CommandController {
  constructor(private readonly commands: CommandService) {}

  @Post()
  create(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(CommandRequestSchema)) request: CommandRequest,
  ) {
    return this.commands.create(userId, request);
  }

  @Get()
  list(@UserId() userId: string, @Query('limit') limit?: string) {
    return this.commands.list(userId, limit ? Number(limit) : 100);
  }

  @Get('approvals/pending')
  pendingApprovals(@UserId() userId: string) {
    return this.commands.listPendingApprovals(userId);
  }

  @Get(':commandId')
  get(@UserId() userId: string, @Param('commandId') commandId: string) {
    return this.commands.get(userId, commandId);
  }

  @Get(':commandId/result')
  result(@UserId() userId: string, @Param('commandId') commandId: string) {
    return this.commands.result(userId, commandId);
  }

  @Post(':commandId/decision')
  decide(
    @UserId() userId: string,
    @Param('commandId') commandId: string,
    @Body(new ZodValidationPipe(ApprovalDecisionSchema)) decision: ApprovalDecision,
  ) {
    return this.commands.decide(userId, commandId, decision);
  }
}
