import { z } from 'zod';
import { refSchema, uuidSchema } from './common.js';
import { financeKpisSchema, financeSummarySchema } from './finance.js';
import { auditLogItemSchema } from './audit.js';

/**
 * Role-aware dashboard. Each section is present only when the caller holds the permissions it
 * needs; the client renders whatever sections it receives.
 */
export const dashboardSchema = z.object({
  asOf: z.string(),
  students: z
    .object({
      activeCount: z.number().int(),
      newThisMonth: z.number().int(),
      incompleteRecords: z.number().int(),
      byBranch: z.array(refSchema.extend({ activeCount: z.number().int() })),
    })
    .optional(),
  finance: financeSummarySchema.optional(),
  financeKpis: financeKpisSchema.optional(),
  teaching: z
    .object({
      classes: z.array(
        z.object({
          id: uuidSchema,
          name: z.string(),
          branch: refSchema,
          gradeLevel: z.string().nullable(),
          studentCount: z.number().int(),
          role: z.enum(['homeroom', 'subject']),
          subject: z.string().nullable(),
        }),
      ),
      assignedStudentCount: z.number().int(),
    })
    .optional(),
  administration: z
    .object({
      activeMembers: z.number().int(),
      pendingInvitations: z.number().int(),
      branchCount: z.number().int(),
    })
    .optional(),
  recentActivity: z.array(auditLogItemSchema).optional(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
