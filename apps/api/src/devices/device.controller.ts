import { Body, Controller, Get, Post } from '@nestjs/common';
import { DeviceCapabilitiesSchema, DeviceKindSchema, DevicePlatformSchema } from '@continuum/protocol';
import { z } from 'zod';
import { UserId } from '../auth/user-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DeviceService, type RegisterDeviceInput } from './device.service.js';

const RegisterDeviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  platform: DevicePlatformSchema,
  kind: DeviceKindSchema,
  capabilities: DeviceCapabilitiesSchema,
});

@Controller('v1/devices')
export class DeviceController {
  constructor(private readonly devices: DeviceService) {}

  @Get()
  list(@UserId() userId: string) {
    return this.devices.list(userId);
  }

  @Post()
  register(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(RegisterDeviceSchema)) input: RegisterDeviceInput,
  ) {
    return this.devices.register(userId, input);
  }
}
