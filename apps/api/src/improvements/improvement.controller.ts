import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CandidateKindSchema, FeedbackSchema, type Feedback } from '@continuum/protocol';
import { z } from 'zod';
import { UserId } from '../auth/user-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  ImprovementService,
  type CreateCandidateInput,
} from './improvement.service.js';

const CreateCandidateSchema = z.object({
  kind: CandidateKindSchema,
  title: z.string().trim().min(1).max(200),
  before: z.string().max(100_000),
  after: z.string().min(1).max(100_000),
  rationale: z.string().trim().min(1).max(20_000),
});

@Controller('v1/improvements')
export class ImprovementController {
  constructor(private readonly improvements: ImprovementService) {}

  @Post('feedback')
  feedback(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(FeedbackSchema)) input: Feedback,
  ) {
    return this.improvements.recordFeedback(userId, input);
  }

  @Get('candidates')
  candidates(@UserId() userId: string) {
    return this.improvements.listCandidates(userId);
  }

  @Post('candidates')
  create(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(CreateCandidateSchema)) input: CreateCandidateInput,
  ) {
    return this.improvements.createCandidate(userId, input);
  }

  @Post('candidates/:candidateId/evaluate')
  evaluate(@UserId() userId: string, @Param('candidateId') candidateId: string) {
    return this.improvements.evaluate(userId, candidateId);
  }

  @Post('candidates/:candidateId/activate')
  activate(@UserId() userId: string, @Param('candidateId') candidateId: string) {
    return this.improvements.activate(userId, candidateId);
  }

  @Post('candidates/:candidateId/rollback')
  rollback(@UserId() userId: string, @Param('candidateId') candidateId: string) {
    return this.improvements.rollback(userId, candidateId);
  }
}
