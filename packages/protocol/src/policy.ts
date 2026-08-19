import type { RiskLevel, ToolName } from './schemas.js';

export interface ToolPolicy {
  risk: RiskLevel;
  approvalRequired: boolean;
  description: string;
}

export const TOOL_POLICIES = {
  'file.list': {
    risk: 'read',
    approvalRequired: false,
    description: 'List entries inside an explicitly shared folder',
  },
  'file.read': {
    risk: 'read',
    approvalRequired: false,
    description: 'Read a file inside an explicitly shared folder',
  },
  'screen.snapshot': {
    risk: 'read',
    approvalRequired: false,
    description: 'Capture the currently approved display',
  },
  'file.write': {
    risk: 'write',
    approvalRequired: true,
    description: 'Create or update a file inside an explicitly shared folder',
  },
  'app.launch': {
    risk: 'write',
    approvalRequired: true,
    description: 'Launch an application from the device allowlist',
  },
  'screen.control': {
    risk: 'write',
    approvalRequired: true,
    description: 'Start a time-limited interactive remote-control session',
  },
  'file.trash': {
    risk: 'destructive',
    approvalRequired: true,
    description: 'Move a file or directory to the operating-system trash',
  },
  'external.send': {
    risk: 'privileged',
    approvalRequired: true,
    description: 'Send data to an external service or person',
  },
  'system.install': {
    risk: 'privileged',
    approvalRequired: true,
    description: 'Install software or change system configuration',
  },
  'credentials.read': {
    risk: 'privileged',
    approvalRequired: true,
    description: 'Access credentials through an explicit native integration',
  },
  'payment.submit': {
    risk: 'privileged',
    approvalRequired: true,
    description: 'Submit a payment or financial transaction',
  },
} as const satisfies Record<ToolName, ToolPolicy>;

export function policyForTool(tool: ToolName): ToolPolicy {
  return TOOL_POLICIES[tool];
}
