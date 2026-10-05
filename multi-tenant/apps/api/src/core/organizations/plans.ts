import { MODULE_KEYS, type ModuleKey } from '@repo/authorization';

/**
 * Subscription plans → modules enabled at provisioning. Billing integration is out of scope for
 * the MVP; the plan key is stored on the organization and modules can be overridden per tenant.
 */
export const PLAN_MODULES: Record<'starter' | 'standard' | 'enterprise', readonly ModuleKey[]> = {
  starter: ['students', 'admissions', 'finance', 'administration'],
  standard: MODULE_KEYS,
  enterprise: MODULE_KEYS,
};

export type PlanKey = keyof typeof PLAN_MODULES;
