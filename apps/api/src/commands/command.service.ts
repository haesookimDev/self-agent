import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  policyForTool,
  type ActionResult,
  type Approval,
  type ApprovalDecision,
  type CommandEnvelope,
  type CommandRequest,
} from '@continuum/protocol';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { DeviceService } from '../devices/device.service.js';
import { ConnectionRegistry } from '../realtime/connection-registry.service.js';
import { STATE_STORE, type StateStore } from '../storage/storage.types.js';

const MAX_COMMAND_LIFETIME_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class CommandService {
  constructor(
    @Inject(STATE_STORE) private readonly store: StateStore,
    @Inject(DeviceService) private readonly devices: DeviceService,
    @Inject(ConnectionRegistry) private readonly connections: ConnectionRegistry,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(userId: string, request: CommandRequest): Promise<CommandEnvelope> {
    const expiresAt = new Date(request.expiresAt).getTime();
    const nowMs = Date.now();
    if (expiresAt <= nowMs) throw new BadRequestException('expiresAt must be in the future');
    if (expiresAt - nowMs > MAX_COMMAND_LIFETIME_MS) {
      throw new BadRequestException('Commands cannot live longer than 24 hours');
    }

    const existing = await this.store.findCommandByIdempotency(userId, request.idempotencyKey);
    if (existing) {
      const sameRequest =
        existing.targetDeviceId === request.targetDeviceId &&
        existing.tool === request.tool &&
        existing.expiresAt === request.expiresAt &&
        isDeepStrictEqual(existing.args, request.args);
      if (!sameRequest) throw new ConflictException('Idempotency key was used for another command');
      return this.expireIfNeeded(existing);
    }

    const target = await this.devices.requireExecutor(userId, request.targetDeviceId);
    if (!target.capabilities.tools.includes(request.tool)) {
      throw new BadRequestException('Target device does not advertise this tool capability');
    }
    const policy = policyForTool(request.tool);
    const now = new Date().toISOString();
    const command: CommandEnvelope = {
      ...request,
      id: randomUUID(),
      userId,
      risk: policy.risk,
      status: policy.approvalRequired ? 'awaiting_approval' : 'queued',
      createdAt: now,
      updatedAt: now,
    };
    await this.store.createCommand(command);

    if (policy.approvalRequired) {
      const approval: Approval = {
        id: randomUUID(),
        commandId: command.id,
        userId,
        decision: 'pending',
        biometricRequired: ['destructive', 'privileged'].includes(policy.risk),
        biometricVerified: false,
        decidedAt: null,
        consumedAt: null,
        createdAt: now,
      };
      await this.store.createApproval(approval);
    }

    await this.audit.record(
      userId,
      'command.created',
      { tool: command.tool, risk: command.risk, status: command.status },
      command.targetDeviceId,
      command.id,
    );
    await this.tryDispatch(command);
    return (await this.store.getCommand(userId, command.id))!;
  }

  async get(userId: string, commandId: string): Promise<CommandEnvelope> {
    const command = await this.store.getCommand(userId, commandId);
    if (!command) throw new NotFoundException('Command not found');
    return this.expireIfNeeded(command);
  }

  async list(userId: string, limit = 100): Promise<CommandEnvelope[]> {
    const commands = await this.store.listCommands(userId, Math.min(Math.max(limit, 1), 500));
    return Promise.all(commands.map((command) => this.expireIfNeeded(command)));
  }

  async result(userId: string, commandId: string): Promise<ActionResult | null> {
    await this.get(userId, commandId);
    return this.store.getActionResult(commandId);
  }

  listPendingApprovals(userId: string): Promise<Approval[]> {
    return this.store.listPendingApprovals(userId);
  }

  async decide(
    userId: string,
    commandId: string,
    decision: ApprovalDecision,
  ): Promise<CommandEnvelope> {
    const command = await this.get(userId, commandId);
    if (command.status === 'expired') throw new ConflictException('Command has expired');
    if (command.status !== 'awaiting_approval') {
      throw new ConflictException('Command is not awaiting approval');
    }
    const approval = await this.store.getApproval(userId, commandId);
    if (!approval || approval.decision !== 'pending') {
      throw new ConflictException('Approval was already decided');
    }
    if (approval.biometricRequired && decision.decision === 'approve' && !decision.biometricVerified) {
      throw new ForbiddenException('Biometric verification is required');
    }

    const now = new Date().toISOString();
    const updatedApproval: Approval = {
      ...approval,
      decision: decision.decision === 'approve' ? 'approved' : 'denied',
      biometricVerified: decision.biometricVerified,
      decidedAt: now,
    };
    const updatedCommand: CommandEnvelope = {
      ...command,
      status: decision.decision === 'approve' ? 'queued' : 'cancelled',
      updatedAt: now,
    };
    await this.store.updateApproval(updatedApproval);
    await this.store.updateCommand(updatedCommand);
    await this.audit.record(
      userId,
      `command.${decision.decision === 'approve' ? 'approved' : 'denied'}`,
      { biometricVerified: decision.biometricVerified },
      command.targetDeviceId,
      command.id,
    );
    await this.tryDispatch(updatedCommand);
    return (await this.store.getCommand(userId, command.id))!;
  }

  async dispatchPendingForDevice(deviceId: string): Promise<void> {
    const pending = await this.store.listDispatchableCommands(deviceId, new Date().toISOString());
    for (const command of pending) await this.tryDispatch(command);
  }

  async acceptResult(deviceId: string, result: ActionResult): Promise<CommandEnvelope> {
    const command = await this.store.getCommandById(result.commandId);
    if (!command || command.targetDeviceId !== deviceId) {
      throw new NotFoundException('Command does not belong to this device');
    }
    if (['succeeded', 'failed', 'cancelled', 'expired'].includes(command.status)) {
      if (command.status === result.status) return command;
      throw new ConflictException('Command is already terminal');
    }
    if (!['dispatched', 'running'].includes(command.status)) {
      throw new ConflictException('Command was not dispatched');
    }

    const now = new Date().toISOString();
    const updated: CommandEnvelope = {
      ...command,
      status: result.status,
      updatedAt: now,
    };
    await this.store.saveActionResult(result);
    await this.store.updateCommand(updated);
    await this.audit.record(
      command.userId,
      `command.${result.status}`,
      result.error ? { error: result.error } : {},
      deviceId,
      command.id,
    );
    return updated;
  }

  private async tryDispatch(command: CommandEnvelope): Promise<boolean> {
    if (!['queued', 'dispatched'].includes(command.status)) return false;
    if (Date.parse(command.expiresAt) <= Date.now()) {
      await this.expireIfNeeded(command);
      return false;
    }
    if (!this.connections.isOnline(command.targetDeviceId)) return false;

    let dispatchable = command;
    if (command.status === 'queued') {
      const policy = policyForTool(command.tool);
      if (policy.approvalRequired) {
        const approval = await this.store.getApproval(command.userId, command.id);
        if (!approval || approval.decision !== 'approved') return false;
        if (!approval.consumedAt) {
          await this.store.updateApproval({ ...approval, consumedAt: new Date().toISOString() });
        }
      }
      dispatchable = { ...command, status: 'dispatched', updatedAt: new Date().toISOString() };
      await this.store.updateCommand(dispatchable);
    }

    const sent = this.connections.send(command.targetDeviceId, {
      type: 'command.dispatch',
      command: dispatchable,
    });
    if (sent) {
      await this.audit.record(
        command.userId,
        'command.dispatched',
        {},
        command.targetDeviceId,
        command.id,
      );
    }
    return sent;
  }

  private async expireIfNeeded(command: CommandEnvelope): Promise<CommandEnvelope> {
    if (
      Date.parse(command.expiresAt) <= Date.now() &&
      !['succeeded', 'failed', 'cancelled', 'expired'].includes(command.status)
    ) {
      const expired: CommandEnvelope = {
        ...command,
        status: 'expired',
        updatedAt: new Date().toISOString(),
      };
      await this.store.updateCommand(expired);
      await this.audit.record(
        command.userId,
        'command.expired',
        {},
        command.targetDeviceId,
        command.id,
      );
      return expired;
    }
    return command;
  }
}
