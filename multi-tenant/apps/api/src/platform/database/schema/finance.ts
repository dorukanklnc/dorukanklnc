import {
  agreementStatusSchema,
  discountCategorySchema,
  paymentMethodSchema,
  paymentStatusSchema,
  receivableCategorySchema,
  receivableKindSchema,
  receivableStatusSchema,
} from '@repo/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  currencyCheck,
  currencyCode,
  enumCheck,
  minor,
  primaryId,
  timestamptz,
  updatedAt,
} from './_shared.js';
import { branches, organizations } from './core.js';
import { academicYears, enrollments, guardians, students } from './education.js';

export type PaymentMethod = (typeof paymentMethodSchema.options)[number];
export type ReceivableKind = (typeof receivableKindSchema.options)[number];
export type ReceivableStatus = (typeof receivableStatusSchema.options)[number];
export type ReceivableCategory = (typeof receivableCategorySchema.options)[number];

export const PAYMENT_PLAN_STATUSES = ['active', 'superseded', 'cancelled'] as const;
export const PAYMENT_INTENT_STATUSES = [
  'created',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
] as const;
export const PROVIDER_EVENT_STATUSES = ['received', 'processed', 'ignored', 'failed'] as const;

/**
 * One receivable account per student, branch and currency ("cari hesap").
 * Every finance row below references its account through (organization_id, branch_id, account_id)
 * so payments, receivables and allocations of one account can never span branches or tenants.
 */
export const financialAccounts = pgTable(
  'financial_accounts',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    studentId: uuid().notNull(),
    currency: currencyCode().notNull(),
    status: text().$type<'active' | 'closed'>().notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('financial_accounts_org_id_uq').on(t.organizationId, t.id),
    unique('financial_accounts_org_branch_id_uq').on(t.organizationId, t.branchId, t.id),
    unique('financial_accounts_student_uq').on(
      t.organizationId,
      t.studentId,
      t.branchId,
      t.currency,
    ),
    foreignKey({
      name: 'financial_accounts_branch_fk',
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      name: 'financial_accounts_student_fk',
      columns: [t.organizationId, t.studentId],
      foreignColumns: [students.organizationId, students.id],
    }),
    currencyCheck('financial_accounts_currency_ck'),
    enumCheck('financial_accounts_status_ck', 'status', ['active', 'closed']),
  ],
);

export const tuitionAgreements = pgTable(
  'tuition_agreements',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    accountId: uuid().notNull(),
    studentId: uuid().notNull(),
    academicYearId: uuid(),
    enrollmentId: uuid(),
    responsibleGuardianId: uuid(),
    title: text().notNull(),
    currency: currencyCode().notNull(),
    grossAmountMinor: minor().notNull(),
    discountTotalMinor: minor().notNull().default(0),
    netAmountMinor: minor().notNull(),
    status: text()
      .$type<(typeof agreementStatusSchema.options)[number]>()
      .notNull()
      .default('active'),
    signedOn: date({ mode: 'string' }),
    notes: text(),
    createdByMembershipId: uuid(),
    cancelledAt: timestamptz(),
    cancelReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tuition_agreements_org_id_uq').on(t.organizationId, t.id),
    unique('tuition_agreements_org_branch_id_uq').on(t.organizationId, t.branchId, t.id),
    foreignKey({
      name: 'tuition_agreements_account_fk',
      columns: [t.organizationId, t.branchId, t.accountId],
      foreignColumns: [
        financialAccounts.organizationId,
        financialAccounts.branchId,
        financialAccounts.id,
      ],
    }),
    foreignKey({
      name: 'tuition_agreements_student_fk',
      columns: [t.organizationId, t.studentId],
      foreignColumns: [students.organizationId, students.id],
    }),
    foreignKey({
      name: 'tuition_agreements_year_fk',
      columns: [t.organizationId, t.academicYearId],
      foreignColumns: [academicYears.organizationId, academicYears.id],
    }),
    foreignKey({
      name: 'tuition_agreements_enrollment_fk',
      columns: [t.organizationId, t.enrollmentId],
      foreignColumns: [enrollments.organizationId, enrollments.id],
    }),
    foreignKey({
      name: 'tuition_agreements_guardian_fk',
      columns: [t.organizationId, t.responsibleGuardianId],
      foreignColumns: [guardians.organizationId, guardians.id],
    }),
    index('tuition_agreements_student_idx').on(t.organizationId, t.studentId),
    check('tuition_agreements_gross_ck', sql`gross_amount_minor > 0`),
    check('tuition_agreements_discount_ck', sql`discount_total_minor >= 0`),
    check(
      'tuition_agreements_net_ck',
      sql`net_amount_minor >= 0 AND net_amount_minor = gross_amount_minor - discount_total_minor`,
    ),
    currencyCheck('tuition_agreements_currency_ck'),
    enumCheck('tuition_agreements_status_ck', 'status', agreementStatusSchema.options),
  ],
);

export const agreementDiscounts = pgTable(
  'agreement_discounts',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    agreementId: uuid().notNull(),
    sortOrder: integer().notNull(),
    category: text().$type<(typeof discountCategorySchema.options)[number]>().notNull(),
    label: text().notNull(),
    kind: text().$type<'percentage' | 'fixed'>().notNull(),
    percentageBps: integer(),
    fixedAmountMinor: minor(),
    amountMinor: minor().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'agreement_discounts_agreement_fk',
      columns: [t.organizationId, t.branchId, t.agreementId],
      foreignColumns: [
        tuitionAgreements.organizationId,
        tuitionAgreements.branchId,
        tuitionAgreements.id,
      ],
    }),
    index('agreement_discounts_agreement_idx').on(t.organizationId, t.agreementId),
    check(
      'agreement_discounts_kind_ck',
      sql`(kind = 'percentage' AND percentage_bps BETWEEN 1 AND 10000 AND fixed_amount_minor IS NULL)
       OR (kind = 'fixed' AND fixed_amount_minor > 0 AND percentage_bps IS NULL)`,
    ),
    check('agreement_discounts_amount_ck', sql`amount_minor >= 0`),
    enumCheck('agreement_discounts_category_ck', 'category', discountCategorySchema.options),
  ],
);

export const paymentPlans = pgTable(
  'payment_plans',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    agreementId: uuid().notNull(),
    accountId: uuid().notNull(),
    status: text().$type<(typeof PAYMENT_PLAN_STATUSES)[number]>().notNull().default('active'),
    installmentCount: integer().notNull(),
    firstDueDate: date({ mode: 'string' }).notNull(),
    frequency: text().$type<'monthly'>().notNull().default('monthly'),
    downPaymentMinor: minor().notNull().default(0),
    totalMinor: minor().notNull(),
    roundingUnitMinor: integer().notNull().default(100),
    remainderPlacement: text().$type<'first' | 'last'>().notNull().default('last'),
    createdByMembershipId: uuid(),
    createdAt: createdAt(),
    supersededAt: timestamptz(),
  },
  (t) => [
    unique('payment_plans_org_id_uq').on(t.organizationId, t.id),
    unique('payment_plans_org_branch_id_uq').on(t.organizationId, t.branchId, t.id),
    uniqueIndex('payment_plans_active_uq')
      .on(t.organizationId, t.agreementId)
      .where(sql`status = 'active'`),
    foreignKey({
      name: 'payment_plans_agreement_fk',
      columns: [t.organizationId, t.branchId, t.agreementId],
      foreignColumns: [
        tuitionAgreements.organizationId,
        tuitionAgreements.branchId,
        tuitionAgreements.id,
      ],
    }),
    foreignKey({
      name: 'payment_plans_account_fk',
      columns: [t.organizationId, t.branchId, t.accountId],
      foreignColumns: [
        financialAccounts.organizationId,
        financialAccounts.branchId,
        financialAccounts.id,
      ],
    }),
    check('payment_plans_count_ck', sql`installment_count BETWEEN 1 AND 36`),
    check('payment_plans_amounts_ck', sql`down_payment_minor >= 0 AND total_minor >= 0`),
    enumCheck('payment_plans_status_ck', 'status', PAYMENT_PLAN_STATUSES),
    enumCheck('payment_plans_frequency_ck', 'frequency', ['monthly']),
    enumCheck('payment_plans_remainder_ck', 'remainder_placement', ['first', 'last']),
  ],
);

/** Installments and additional charges — everything a family owes (ADR-0009). */
export const receivables = pgTable(
  'receivables',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    accountId: uuid().notNull(),
    studentId: uuid().notNull(),
    agreementId: uuid(),
    paymentPlanId: uuid(),
    kind: text().$type<ReceivableKind>().notNull(),
    sequenceNo: integer(),
    category: text().$type<ReceivableCategory>().notNull(),
    description: text().notNull(),
    currency: currencyCode().notNull(),
    amountMinor: minor().notNull(),
    /** Sum of active allocations; maintained by a trigger on payment_allocations. */
    allocatedMinor: minor().notNull().default(0),
    dueDate: date({ mode: 'string' }).notNull(),
    status: text().$type<ReceivableStatus>().notNull().default('open'),
    overdueMarkedAt: timestamptz(),
    cancelledAt: timestamptz(),
    cancelReason: text(),
    createdByMembershipId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('receivables_org_id_uq').on(t.organizationId, t.id),
    unique('receivables_org_branch_id_uq').on(t.organizationId, t.branchId, t.id),
    uniqueIndex('receivables_plan_sequence_uq')
      .on(t.organizationId, t.paymentPlanId, t.sequenceNo)
      .where(sql`kind = 'installment'`),
    foreignKey({
      name: 'receivables_account_fk',
      columns: [t.organizationId, t.branchId, t.accountId],
      foreignColumns: [
        financialAccounts.organizationId,
        financialAccounts.branchId,
        financialAccounts.id,
      ],
    }),
    foreignKey({
      name: 'receivables_student_fk',
      columns: [t.organizationId, t.studentId],
      foreignColumns: [students.organizationId, students.id],
    }),
    foreignKey({
      name: 'receivables_agreement_fk',
      columns: [t.organizationId, t.branchId, t.agreementId],
      foreignColumns: [
        tuitionAgreements.organizationId,
        tuitionAgreements.branchId,
        tuitionAgreements.id,
      ],
    }),
    foreignKey({
      name: 'receivables_plan_fk',
      columns: [t.organizationId, t.branchId, t.paymentPlanId],
      foreignColumns: [paymentPlans.organizationId, paymentPlans.branchId, paymentPlans.id],
    }),
    index('receivables_account_due_idx').on(t.organizationId, t.accountId, t.dueDate),
    index('receivables_open_due_idx')
      .on(t.organizationId, t.dueDate)
      .where(sql`status = 'open'`),
    index('receivables_student_idx').on(t.organizationId, t.studentId),
    check('receivables_amount_ck', sql`amount_minor > 0`),
    check('receivables_allocated_ck', sql`allocated_minor >= 0 AND allocated_minor <= amount_minor`),
    check(
      'receivables_installment_ck',
      sql`kind <> 'installment' OR (payment_plan_id IS NOT NULL AND sequence_no IS NOT NULL)`,
    ),
    check(
      'receivables_status_consistency_ck',
      sql`(status = 'cancelled' AND allocated_minor = 0)
       OR (status = 'paid' AND allocated_minor = amount_minor)
       OR (status = 'open' AND allocated_minor < amount_minor)`,
    ),
    currencyCheck('receivables_currency_ck'),
    enumCheck('receivables_kind_ck', 'kind', receivableKindSchema.options),
    enumCheck('receivables_status_ck', 'status', receivableStatusSchema.options),
    enumCheck('receivables_category_ck', 'category', receivableCategorySchema.options),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    accountId: uuid().notNull(),
    studentId: uuid().notNull(),
    payerGuardianId: uuid(),
    payerName: text(),
    currency: currencyCode().notNull(),
    amountMinor: minor().notNull(),
    /** Sum of active allocations; maintained by a trigger on payment_allocations. */
    allocatedMinor: minor().notNull().default(0),
    refundedMinor: minor().notNull().default(0),
    method: text().$type<PaymentMethod>().notNull(),
    status: text()
      .$type<(typeof paymentStatusSchema.options)[number]>()
      .notNull()
      .default('completed'),
    receivedAt: timestamptz().notNull(),
    receiptNumber: text().notNull(),
    reference: text(),
    notes: text(),
    idempotencyKey: text(),
    requestHash: text(),
    provider: text(),
    providerReference: text(),
    paymentIntentId: uuid(),
    recordedByMembershipId: uuid(),
    reversedAt: timestamptz(),
    reversedByMembershipId: uuid(),
    reversalReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payments_org_id_uq').on(t.organizationId, t.id),
    unique('payments_org_branch_id_uq').on(t.organizationId, t.branchId, t.id),
    unique('payments_org_receipt_uq').on(t.organizationId, t.receiptNumber),
    uniqueIndex('payments_idempotency_uq')
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    uniqueIndex('payments_provider_reference_uq')
      .on(t.organizationId, t.provider, t.providerReference)
      .where(sql`provider_reference IS NOT NULL`),
    foreignKey({
      name: 'payments_account_fk',
      columns: [t.organizationId, t.branchId, t.accountId],
      foreignColumns: [
        financialAccounts.organizationId,
        financialAccounts.branchId,
        financialAccounts.id,
      ],
    }),
    foreignKey({
      name: 'payments_student_fk',
      columns: [t.organizationId, t.studentId],
      foreignColumns: [students.organizationId, students.id],
    }),
    foreignKey({
      name: 'payments_payer_fk',
      columns: [t.organizationId, t.payerGuardianId],
      foreignColumns: [guardians.organizationId, guardians.id],
    }),
    index('payments_org_received_idx').on(t.organizationId, t.receivedAt.desc()),
    index('payments_account_idx').on(t.organizationId, t.accountId, t.receivedAt),
    index('payments_student_idx').on(t.organizationId, t.studentId),
    check('payments_amount_ck', sql`amount_minor > 0`),
    check(
      'payments_allocation_ck',
      sql`allocated_minor >= 0 AND refunded_minor >= 0 AND allocated_minor + refunded_minor <= amount_minor`,
    ),
    check(
      'payments_reversal_ck',
      sql`(status = 'completed' AND reversed_at IS NULL)
       OR (status = 'reversed' AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL AND allocated_minor = 0)`,
    ),
    currencyCheck('payments_currency_ck'),
    enumCheck('payments_method_ck', 'method', paymentMethodSchema.options),
    enumCheck('payments_status_ck', 'status', paymentStatusSchema.options),
  ],
);

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    accountId: uuid().notNull(),
    paymentId: uuid().notNull(),
    receivableId: uuid().notNull(),
    amountMinor: minor().notNull(),
    createdByMembershipId: uuid(),
    createdAt: createdAt(),
    reversedAt: timestamptz(),
    reversedByMembershipId: uuid(),
    reversalReason: text(),
  },
  (t) => [
    foreignKey({
      name: 'payment_allocations_payment_fk',
      columns: [t.organizationId, t.branchId, t.paymentId],
      foreignColumns: [payments.organizationId, payments.branchId, payments.id],
    }),
    foreignKey({
      name: 'payment_allocations_receivable_fk',
      columns: [t.organizationId, t.branchId, t.receivableId],
      foreignColumns: [receivables.organizationId, receivables.branchId, receivables.id],
    }),
    foreignKey({
      name: 'payment_allocations_account_fk',
      columns: [t.organizationId, t.branchId, t.accountId],
      foreignColumns: [
        financialAccounts.organizationId,
        financialAccounts.branchId,
        financialAccounts.id,
      ],
    }),
    index('payment_allocations_payment_idx').on(t.organizationId, t.paymentId),
    index('payment_allocations_receivable_idx').on(t.organizationId, t.receivableId),
    check('payment_allocations_amount_ck', sql`amount_minor > 0`),
  ],
);

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    accountId: uuid().notNull(),
    studentId: uuid().notNull(),
    provider: text().notNull(),
    providerReference: text().notNull(),
    description: text().notNull(),
    currency: currencyCode().notNull(),
    amountMinor: minor().notNull(),
    status: text().$type<(typeof PAYMENT_INTENT_STATUSES)[number]>().notNull().default('created'),
    checkoutUrl: text().notNull(),
    expiresAt: timestamptz().notNull(),
    paymentId: uuid(),
    createdByMembershipId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('payment_intents_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('payment_intents_provider_reference_uq').on(t.provider, t.providerReference),
    foreignKey({
      name: 'payment_intents_account_fk',
      columns: [t.organizationId, t.branchId, t.accountId],
      foreignColumns: [
        financialAccounts.organizationId,
        financialAccounts.branchId,
        financialAccounts.id,
      ],
    }),
    foreignKey({
      name: 'payment_intents_payment_fk',
      columns: [t.organizationId, t.branchId, t.paymentId],
      foreignColumns: [payments.organizationId, payments.branchId, payments.id],
    }),
    check('payment_intents_amount_ck', sql`amount_minor > 0`),
    currencyCheck('payment_intents_currency_ck'),
    enumCheck('payment_intents_status_ck', 'status', PAYMENT_INTENT_STATUSES),
  ],
);

/** Webhook inbox: one row per provider event id; replays are no-ops. */
export const paymentProviderEvents = pgTable(
  'payment_provider_events',
  {
    id: primaryId(),
    provider: text().notNull(),
    providerEventId: text().notNull(),
    eventType: text().notNull(),
    organizationId: uuid().references(() => organizations.id),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    signatureValid: boolean().notNull(),
    status: text().$type<(typeof PROVIDER_EVENT_STATUSES)[number]>().notNull().default('received'),
    error: text(),
    receivedAt: timestamptz().notNull().defaultNow(),
    processedAt: timestamptz(),
  },
  (t) => [
    uniqueIndex('payment_provider_events_uq').on(t.provider, t.providerEventId),
    enumCheck('payment_provider_events_status_ck', 'status', PROVIDER_EVENT_STATUSES),
  ],
);
