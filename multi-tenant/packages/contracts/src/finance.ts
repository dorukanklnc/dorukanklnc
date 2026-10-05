import { z } from 'zod';
import {
  currencySchema,
  isoDateSchema,
  isoDateTimeSchema,
  paginationQuerySchema,
  positiveAmountMinorSchema,
  refSchema,
  searchTermSchema,
  sortDirectionSchema,
  uuidSchema,
} from './common.js';

// ── Agreements, discounts, plans ─────────────────────────────────────────────────────────

export const discountCategorySchema = z.enum([
  'sibling',
  'early_payment',
  'scholarship',
  'staff',
  'corporate',
  'other',
]);
export type DiscountCategory = z.infer<typeof discountCategorySchema>;

const discountBase = {
  category: discountCategorySchema,
  label: z.string().trim().min(1).max(80),
};

export const discountInputSchema = z.discriminatedUnion('kind', [
  z.object({
    ...discountBase,
    kind: z.literal('percentage'),
    /** Basis points: 1000 = 10 %. */
    percentageBps: z.number().int().min(1).max(10_000),
  }),
  z.object({
    ...discountBase,
    kind: z.literal('fixed'),
    amountMinor: positiveAmountMinorSchema,
  }),
]);
export type DiscountInput = z.infer<typeof discountInputSchema>;

export const roundingUnitSchema = z.union([
  z.literal(1),
  z.literal(100),
  z.literal(1000),
  z.literal(10_000),
]);

export const planInputSchema = z.object({
  installmentCount: z.number().int().min(1).max(36),
  firstDueDate: isoDateSchema,
  downPaymentMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  downPaymentDueDate: isoDateSchema.optional(),
  /** Installments are rounded down to this unit (100 = whole TRY); the remainder goes to one installment. */
  roundingUnitMinor: roundingUnitSchema.default(100),
  remainderPlacement: z.enum(['first', 'last']).default('last'),
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const agreementPreviewRequestSchema = z.object({
  currency: currencySchema.default('TRY'),
  grossAmountMinor: positiveAmountMinorSchema,
  discounts: z.array(discountInputSchema).max(10).default([]),
  plan: planInputSchema,
});
export type AgreementPreviewRequest = z.infer<typeof agreementPreviewRequestSchema>;

export const discountLineSchema = z.object({
  category: discountCategorySchema,
  label: z.string(),
  kind: z.enum(['percentage', 'fixed']),
  percentageBps: z.number().int().nullable(),
  fixedAmountMinor: z.number().int().nullable(),
  amountMinor: z.number().int(),
});
export type DiscountLine = z.infer<typeof discountLineSchema>;

export const scheduleLineSchema = z.object({
  sequenceNo: z.number().int(),
  dueDate: z.string(),
  amountMinor: z.number().int(),
  isDownPayment: z.boolean(),
});
export type ScheduleLine = z.infer<typeof scheduleLineSchema>;

export const agreementPreviewSchema = z.object({
  currency: z.string(),
  grossAmountMinor: z.number().int(),
  discounts: z.array(discountLineSchema),
  discountTotalMinor: z.number().int(),
  netAmountMinor: z.number().int(),
  schedule: z.array(scheduleLineSchema),
});
export type AgreementPreview = z.infer<typeof agreementPreviewSchema>;

export const createAgreementRequestSchema = agreementPreviewRequestSchema.extend({
  studentId: uuidSchema,
  title: z.string().trim().min(2).max(120),
  academicYearId: uuidSchema.optional(),
  responsibleGuardianId: uuidSchema.optional(),
  signedOn: isoDateSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateAgreementRequest = z.infer<typeof createAgreementRequestSchema>;

export const agreementStatusSchema = z.enum(['active', 'completed', 'cancelled']);

export const agreementSchema = z.object({
  id: uuidSchema,
  studentId: uuidSchema,
  accountId: uuidSchema,
  branch: refSchema,
  title: z.string(),
  currency: z.string(),
  grossAmountMinor: z.number().int(),
  discountTotalMinor: z.number().int(),
  netAmountMinor: z.number().int(),
  paidMinor: z.number().int(),
  outstandingMinor: z.number().int(),
  status: agreementStatusSchema,
  signedOn: z.string().nullable(),
  academicYear: refSchema.nullable(),
  responsibleGuardian: refSchema.nullable(),
  discounts: z.array(discountLineSchema),
  plan: z
    .object({
      id: uuidSchema,
      installmentCount: z.number().int(),
      firstDueDate: z.string(),
      downPaymentMinor: z.number().int(),
      status: z.string(),
    })
    .nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Agreement = z.infer<typeof agreementSchema>;

// ── Receivables (installments + charges) ────────────────────────────────────────────────

export const receivableKindSchema = z.enum(['installment', 'charge']);
export const receivableStatusSchema = z.enum(['open', 'paid', 'cancelled']);
export const receivableCategorySchema = z.enum([
  'tuition',
  'down_payment',
  'books',
  'uniform',
  'transport',
  'meals',
  'trip',
  'exam',
  'other',
]);
export type ReceivableCategory = z.infer<typeof receivableCategorySchema>;

export const receivableListQuerySchema = paginationQuerySchema.extend({
  kind: receivableKindSchema.optional(),
  status: receivableStatusSchema.optional(),
  overdue: z.stringbool().optional(),
  dueFrom: isoDateSchema.optional(),
  dueTo: isoDateSchema.optional(),
  studentId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  q: searchTermSchema.optional(),
  sort: z.enum(['dueDate', 'amount', 'student']).default('dueDate'),
  direction: sortDirectionSchema.default('asc'),
});
export type ReceivableListQuery = z.infer<typeof receivableListQuerySchema>;

export const studentRefSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  studentNumber: z.string(),
});

export const receivableSchema = z.object({
  id: uuidSchema,
  kind: receivableKindSchema,
  sequenceNo: z.number().int().nullable(),
  category: receivableCategorySchema,
  description: z.string(),
  currency: z.string(),
  amountMinor: z.number().int(),
  allocatedMinor: z.number().int(),
  outstandingMinor: z.number().int(),
  dueDate: z.string(),
  status: receivableStatusSchema,
  isOverdue: z.boolean(),
  daysOverdue: z.number().int(),
  student: studentRefSchema,
  branch: refSchema,
  agreementId: uuidSchema.nullable(),
});
export type Receivable = z.infer<typeof receivableSchema>;

export const createChargeRequestSchema = z.object({
  studentId: uuidSchema,
  currency: currencySchema.default('TRY'),
  category: receivableCategorySchema.exclude(['tuition', 'down_payment']),
  description: z.string().trim().min(2).max(160),
  amountMinor: positiveAmountMinorSchema,
  dueDate: isoDateSchema,
});
export type CreateChargeRequest = z.infer<typeof createChargeRequestSchema>;

// ── Payments ────────────────────────────────────────────────────────────────────────────

export const paymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'credit_card',
  'pos',
  'online',
  'check',
  'other',
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentStatusSchema = z.enum(['completed', 'reversed']);

export const allocationInputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }),
  z.object({
    mode: z.literal('manual'),
    items: z
      .array(z.object({ receivableId: uuidSchema, amountMinor: positiveAmountMinorSchema }))
      .min(1)
      .max(100),
  }),
]);
export type AllocationInput = z.infer<typeof allocationInputSchema>;

export const recordPaymentRequestSchema = z.object({
  studentId: uuidSchema,
  currency: currencySchema.default('TRY'),
  amountMinor: positiveAmountMinorSchema,
  method: paymentMethodSchema.exclude(['online']),
  receivedAt: isoDateTimeSchema.optional(),
  payerGuardianId: uuidSchema.optional(),
  payerName: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  allocation: allocationInputSchema.default({ mode: 'auto' }),
});
export type RecordPaymentRequest = z.infer<typeof recordPaymentRequestSchema>;

export const allocationSchema = z.object({
  id: uuidSchema,
  receivableId: uuidSchema,
  description: z.string(),
  dueDate: z.string(),
  amountMinor: z.number().int(),
  reversedAt: z.string().nullable(),
});

export const paymentSchema = z.object({
  id: uuidSchema,
  receiptNumber: z.string(),
  student: studentRefSchema,
  accountId: uuidSchema,
  branch: refSchema,
  currency: z.string(),
  amountMinor: z.number().int(),
  allocatedMinor: z.number().int(),
  refundedMinor: z.number().int(),
  unallocatedMinor: z.number().int(),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  receivedAt: z.string(),
  payerName: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  provider: z.string().nullable(),
  recordedBy: z.string().nullable(),
  reversedAt: z.string().nullable(),
  reversalReason: z.string().nullable(),
  allocations: z.array(allocationSchema),
  createdAt: z.string(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const paymentListItemSchema = paymentSchema.omit({ allocations: true, notes: true });
export type PaymentListItem = z.infer<typeof paymentListItemSchema>;

export const paymentListQuerySchema = paginationQuerySchema.extend({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  method: paymentMethodSchema.optional(),
  status: paymentStatusSchema.optional(),
  studentId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  q: searchTermSchema.optional(),
  sort: z.enum(['receivedAt', 'amount']).default('receivedAt'),
  direction: sortDirectionSchema.default('desc'),
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export const reversePaymentRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type ReversePaymentRequest = z.infer<typeof reversePaymentRequestSchema>;

// ── Student finance overview ────────────────────────────────────────────────────────────

export const accountBalanceSchema = z.object({
  accountId: uuidSchema,
  branch: refSchema,
  currency: z.string(),
  totalDueMinor: z.number().int(),
  paidMinor: z.number().int(),
  outstandingMinor: z.number().int(),
  overdueMinor: z.number().int(),
  creditMinor: z.number().int(),
  nextDue: z.object({ dueDate: z.string(), amountMinor: z.number().int() }).nullable(),
});
export type AccountBalance = z.infer<typeof accountBalanceSchema>;

export const studentFinanceSchema = z.object({
  student: studentRefSchema,
  accounts: z.array(accountBalanceSchema),
  agreements: z.array(agreementSchema),
});
export type StudentFinance = z.infer<typeof studentFinanceSchema>;

// ── Online payment links (provider abstraction) ─────────────────────────────────────────

export const createPaymentLinkRequestSchema = z.object({
  studentId: uuidSchema,
  currency: currencySchema.default('TRY'),
  amountMinor: positiveAmountMinorSchema,
  description: z.string().trim().min(2).max(160),
});
export type CreatePaymentLinkRequest = z.infer<typeof createPaymentLinkRequestSchema>;

export const paymentLinkSchema = z.object({
  id: uuidSchema,
  provider: z.string(),
  status: z.enum(['created', 'succeeded', 'failed', 'expired', 'cancelled']),
  amountMinor: z.number().int(),
  currency: z.string(),
  checkoutUrl: z.string(),
  expiresAt: z.string(),
  paymentId: uuidSchema.nullable(),
});
export type PaymentLink = z.infer<typeof paymentLinkSchema>;

// ── Collections dashboard ───────────────────────────────────────────────────────────────

export const agingBucketSchema = z.enum(['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']);
export type AgingBucket = z.infer<typeof agingBucketSchema>;

export const financeSummaryQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  currency: currencySchema.optional(),
});
export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;

export const financeKpisSchema = z.object({
  currency: z.string(),
  asOf: z.string(),
  overdueMinor: z.number().int(),
  collectedThisMonthMinor: z.number().int(),
  expectedThisMonthMinor: z.number().int(),
  dueThisMonthMinor: z.number().int(),
  /** 0..1, null when nothing was due this month yet. */
  collectionRateThisMonth: z.number().nullable(),
});
export type FinanceKpis = z.infer<typeof financeKpisSchema>;

export const financeSummarySchema = financeKpisSchema.extend({
  dueTodayMinor: z.number().int(),
  dueTodayCount: z.number().int(),
  overdueCount: z.number().int(),
  overdueAccountCount: z.number().int(),
  paymentsTodayMinor: z.number().int(),
  paymentsTodayCount: z.number().int(),
  aging: z.array(
    z.object({ bucket: agingBucketSchema, amountMinor: z.number().int(), count: z.number().int() }),
  ),
  monthly: z.array(
    z.object({
      month: z.string(),
      dueMinor: z.number().int(),
      collectedMinor: z.number().int(),
    }),
  ),
  upcoming: z.array(receivableSchema),
  topOverdue: z.array(
    z.object({
      student: studentRefSchema,
      overdueMinor: z.number().int(),
      oldestDueDate: z.string(),
      overdueCount: z.number().int(),
    }),
  ),
});
export type FinanceSummary = z.infer<typeof financeSummarySchema>;
