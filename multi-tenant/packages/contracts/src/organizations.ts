import { MODULE_KEYS } from '@repo/authorization';
import { z } from 'zod';
import { currencySchema, optionalText, phoneSchema, uuidSchema } from './common.js';
import { emailSchema } from './auth.js';

export const organizationStatusSchema = z.enum(['active', 'suspended', 'archived']);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, {
    message: 'Lowercase letters, digits and hyphens (3–63 characters)',
  });

export const timezoneSchema = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Unknown time zone' },
);

export const organizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  legalName: z.string().nullable(),
  slug: z.string(),
  status: organizationStatusSchema,
  planKey: z.string(),
  locale: z.string(),
  timezone: z.string(),
  defaultCurrency: z.string(),
  modules: z.array(z.object({ key: z.enum(MODULE_KEYS), enabled: z.boolean() })),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const updateOrganizationRequestSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: optionalText(200),
  timezone: timezoneSchema.optional(),
});
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;

export const branchCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, { message: '2–20 characters: letters, digits, - or _' });

export const branchSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  status: z.enum(['active', 'inactive']),
  city: z.string().nullable(),
  district: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  isHeadquarters: z.boolean(),
  studentCount: z.number().int(),
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type Branch = z.infer<typeof branchSchema>;

export const createBranchRequestSchema = z.object({
  code: branchCodeSchema,
  name: z.string().trim().min(2).max(120),
  city: optionalText(80),
  district: optionalText(80),
  address: optionalText(300),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
});
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;

export const updateBranchRequestSchema = createBranchRequestSchema
  .omit({ code: true })
  .partial()
  .extend({ status: z.enum(['active', 'inactive']).optional() });
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;

/** Platform: provision a new tenant with its first branch and administrator. */
export const createOrganizationRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  legalName: optionalText(200),
  timezone: timezoneSchema.default('Europe/Istanbul'),
  defaultCurrency: currencySchema.default('TRY'),
  planKey: z.enum(['starter', 'standard', 'enterprise']).default('standard'),
  firstBranch: z.object({
    code: branchCodeSchema,
    name: z.string().trim().min(2).max(120),
  }),
  administrator: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema,
  }),
});
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

export const platformOrganizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  status: organizationStatusSchema,
  planKey: z.string(),
  branchCount: z.number().int(),
  memberCount: z.number().int(),
  studentCount: z.number().int(),
  createdAt: z.string(),
});
export type PlatformOrganization = z.infer<typeof platformOrganizationSchema>;
