import { z } from 'zod';

export const IdSchema = z.string().uuid();
export const DateTimeSchema = z.string().datetime({ offset: true });

export const DevicePlatformSchema = z.enum([
  'windows',
  'macos',
  'android',
  'ios',
  'web',
]);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const DeviceKindSchema = z.enum(['executor', 'controller']);
export type DeviceKind = z.infer<typeof DeviceKindSchema>;

export const ToolNameSchema = z.enum([
  'file.list',
  'file.read',
  'screen.snapshot',
  'file.write',
  'app.launch',
  'screen.control',
  'file.trash',
  'external.send',
  'system.install',
  'credentials.read',
  'payment.submit',
]);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const RiskLevelSchema = z.enum([
  'read',
  'write',
  'destructive',
  'privileged',
]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const DeviceCapabilitiesSchema = z.object({
  tools: z.array(ToolNameSchema),
  screenCapture: z.boolean(),
  interactiveControl: z.boolean(),
  fileSync: z.boolean(),
});
export type DeviceCapabilities = z.infer<typeof DeviceCapabilitiesSchema>;

export const DeviceSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  name: z.string().min(1).max(100),
  platform: DevicePlatformSchema,
  kind: DeviceKindSchema,
  capabilities: DeviceCapabilitiesSchema,
  online: z.boolean(),
  lastSeenAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type Device = z.infer<typeof DeviceSchema>;

export const CommandRequestSchema = z.object({
  targetDeviceId: IdSchema,
  tool: ToolNameSchema,
  args: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(8).max(200),
  expiresAt: DateTimeSchema,
});
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

export const CommandStatusSchema = z.enum([
  'queued',
  'awaiting_approval',
  'dispatched',
  'running',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
]);
export type CommandStatus = z.infer<typeof CommandStatusSchema>;

export const CommandEnvelopeSchema = CommandRequestSchema.extend({
  id: IdSchema,
  userId: IdSchema,
  risk: RiskLevelSchema,
  status: CommandStatusSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;

export const ActionResultSchema = z.object({
  commandId: IdSchema,
  status: z.enum(['running', 'succeeded', 'failed']),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().max(4_000).optional(),
  finishedAt: DateTimeSchema.optional(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(['approve', 'deny']),
  biometricVerified: z.boolean().default(false),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalSchema = z.object({
  id: IdSchema,
  commandId: IdSchema,
  userId: IdSchema,
  decision: z.enum(['pending', 'approved', 'denied']),
  biometricRequired: z.boolean(),
  biometricVerified: z.boolean(),
  decidedAt: DateTimeSchema.nullable(),
  consumedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const MemoryKindSchema = z.enum(['preference', 'fact', 'instruction', 'summary']);
export const MemoryItemSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  kind: MemoryKindSchema,
  content: z.string().min(1).max(20_000),
  source: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const FeedbackSchema = z.object({
  runId: IdSchema.optional(),
  kind: z.enum(['rating', 'correction', 'approval_denied', 'task_result']),
  score: z.number().min(-1).max(1).optional(),
  content: z.string().max(20_000).optional(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const CandidateKindSchema = z.enum(['memory', 'prompt', 'tool_policy']);
export const CandidateStatusSchema = z.enum([
  'draft',
  'evaluating',
  'failed',
  'ready',
  'active',
  'rejected',
  'rolled_back',
]);
export const ImprovementCandidateSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  kind: CandidateKindSchema,
  title: z.string().min(1).max(200),
  before: z.string(),
  after: z.string(),
  rationale: z.string(),
  status: CandidateStatusSchema,
  evaluationScore: z.number().nullable(),
  safetyPassed: z.boolean().nullable(),
  createdAt: DateTimeSchema,
  activatedAt: DateTimeSchema.nullable(),
});
export type ImprovementCandidate = z.infer<typeof ImprovementCandidateSchema>;

export const SyncVersionRequestSchema = z.object({
  deviceId: IdSchema,
  rootId: IdSchema,
  relativePath: z.string().min(1).max(4_000),
  baseVersionId: IdSchema.nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
});
export type SyncVersionRequest = z.infer<typeof SyncVersionRequestSchema>;

export const RealtimeClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('device.hello'), deviceId: IdSchema, credential: z.string().min(16) }),
  z.object({ type: z.literal('device.heartbeat'), deviceId: IdSchema }),
  z.object({ type: z.literal('command.result'), result: ActionResultSchema }),
  z.object({
    type: z.literal('webrtc.signal'),
    targetDeviceId: IdSchema,
    sessionId: IdSchema,
    signal: z.record(z.string(), z.unknown()),
  }),
]);
export type RealtimeClientMessage = z.infer<typeof RealtimeClientMessageSchema>;

export const RealtimeServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('device.accepted'), deviceId: IdSchema }),
  z.object({ type: z.literal('command.dispatch'), command: CommandEnvelopeSchema }),
  z.object({ type: z.literal('command.updated'), command: CommandEnvelopeSchema }),
  z.object({
    type: z.literal('webrtc.signal'),
    sourceDeviceId: IdSchema,
    sessionId: IdSchema,
    signal: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type RealtimeServerMessage = z.infer<typeof RealtimeServerMessageSchema>;
