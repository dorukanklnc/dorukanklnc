import { hash } from '@node-rs/argon2';
import { isRoleTemplateKey } from '@repo/authorization';
import type { DiscountInput } from '@repo/contracts';
import { eq } from 'drizzle-orm';
import { inviteMember, provisionOrganization } from '../../../core/organizations/provisioning.js';
import { allocateOldestFirst, type OpenReceivable } from '../../../finance/domain/allocation.js';
import { applyDiscounts, buildSchedule } from '../../../finance/domain/agreement-calculator.js';
import { addDays, formatIsoDate, parseIsoDate, todayIn } from '../../../finance/domain/dates.js';
import type { AppConfig } from '../../config/env.js';
import { FieldEncryptionService } from '../../crypto/field-encryption.service.js';
import { createDatabase, createPool } from '../connection.js';
import {
  academicYears,
  agreementDiscounts,
  auditLogs,
  branches,
  classEnrollments,
  classes,
  enrollments,
  financialAccounts,
  gradeLevels,
  guardians,
  membershipBranches,
  membershipRoles,
  memberships,
  organizations,
  paymentAllocations,
  paymentPlans,
  payments,
  personnel,
  receivables,
  studentGuardians,
  students,
  teacherAssignments,
  tuitionAgreements,
  users,
  type PaymentMethod,
} from '../schema/index.js';
import { formatReceiptNumber, nextSequenceValue } from '../sequences.js';
import type { Transaction } from '../types.js';
import {
  DEMO_ORGANIZATIONS,
  DEMO_PASSWORD,
  type DemoOrganization,
  FEMALE_NAMES,
  MALE_NAMES,
  OCCUPATIONS,
  PLATFORM_ADMIN,
  SURNAMES,
} from './data.js';
import { type Random, createRandom } from './random.js';

const TIMEZONE = 'Europe/Istanbul';
const BOOKS_FEE_MINOR = 450_000;
/** Well-known checksum-valid test numbers — never real identities. */
const TEST_NATIONAL_IDS = ['10000000146', '12345678950'];

type PayerProfile = 'on_time' | 'late_last' | 'chronic' | 'prepaid';

export interface SeedOptions {
  /** Pin "today" (YYYY-MM-DD) for deterministic tests; defaults to the current Istanbul date. */
  today?: string;
  log?: (message: string) => void;
}

export interface SeedSummary {
  organizations: Record<string, { id: string; students: number; payments: number }>;
  today: string;
}

/**
 * Loads fictional demo tenants (Atlas Akademi, Nova Koleji) with users for every role, academic
 * structure, students with guardians and a realistic collections history relative to `today`.
 * Runs as the system role. Refuses to run twice.
 */
export async function seedDemoData(
  config: AppConfig,
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const log = options.log ?? ((message: string) => console.log(message));
  const today = options.today ?? todayIn(TIMEZONE);
  const pool = createPool({
    connectionString: config.DATABASE_SYSTEM_URL,
    max: 2,
    applicationName: 'campusos-seed',
  });
  const db = createDatabase(pool);
  const fieldEncryption = new FieldEncryptionService(config);
  const summary: SeedSummary = { organizations: {}, today };

  try {
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, DEMO_ORGANIZATIONS[0]!.slug))
      .limit(1);
    if (existing) {
      log('Demo data already present — skipping. Use `pnpm db:reset` to start over.');
      return summary;
    }

    const passwordHash = await hash(DEMO_PASSWORD, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await db.insert(users).values({
      email: PLATFORM_ADMIN.email,
      fullName: PLATFORM_ADMIN.fullName,
      passwordHash,
      status: 'active',
      platformRole: 'platform_admin',
      emailVerifiedAt: new Date(),
      passwordChangedAt: new Date(),
    });

    for (const definition of DEMO_ORGANIZATIONS) {
      const result = await db.transaction((tx) =>
        seedOrganization(tx, definition, { today, passwordHash, fieldEncryption }),
      );
      summary.organizations[definition.slug] = result;
      log(`Seeded ${definition.name}: ${result.students} students, ${result.payments} payments.`);
    }
    return summary;
  } finally {
    await pool.end();
  }
}

interface SeedContext {
  today: string;
  passwordHash: string;
  fieldEncryption: FieldEncryptionService;
}

async function seedOrganization(
  tx: Transaction,
  definition: DemoOrganization,
  context: SeedContext,
) {
  const random = createRandom(definition.seed);
  const [firstBranch, ...otherBranches] = definition.branches;
  if (!firstBranch) throw new Error('Demo organization needs a branch');

  const provisioned = await provisionOrganization(tx, {
    name: definition.name,
    slug: definition.slug,
    legalName: definition.legalName,
    timezone: TIMEZONE,
    defaultCurrency: 'TRY',
    planKey: 'standard',
    firstBranch: { code: firstBranch.code, name: firstBranch.name },
  });
  const organizationId = provisioned.organizationId;
  await tx
    .update(branches)
    .set({ city: firstBranch.city, district: firstBranch.district })
    .where(eq(branches.id, provisioned.branchId));

  const branchIds = new Map<string, string>([[firstBranch.code, provisioned.branchId]]);
  for (const branch of otherBranches) {
    const [row] = await tx
      .insert(branches)
      .values({
        organizationId,
        code: branch.code,
        name: branch.name,
        city: branch.city,
        district: branch.district,
      })
      .returning({ id: branches.id });
    branchIds.set(branch.code, row!.id);
  }
  const branchId = (code: string) => {
    const id = branchIds.get(code);
    if (!id) throw new Error(`Unknown branch ${code}`);
    return id;
  };

  // Academic structure: the current academic year starts in September.
  const { year, month } = parseIsoDate(context.today);
  const startYear = month >= 8 ? year : year - 1;
  const yearStart = formatIsoDate(startYear, 9, 14);
  const [academicYear] = await tx
    .insert(academicYears)
    .values({
      organizationId,
      name: `${startYear}-${startYear + 1}`,
      startsOn: yearStart,
      endsOn: formatIsoDate(startYear + 1, 6, 25),
      status: 'active',
      isCurrent: true,
    })
    .returning({ id: academicYears.id });
  const gradeIds = new Map<string, string>();
  for (const [index, grade] of definition.grades.entries()) {
    const [row] = await tx
      .insert(gradeLevels)
      .values({
        organizationId,
        code: grade.code,
        name: grade.name,
        stage: grade.stage,
        sortOrder: index,
      })
      .returning({ id: gradeLevels.id });
    gradeIds.set(grade.code, row!.id);
  }

  // Members with ready-to-use demo passwords.
  const personnelByEmail = new Map<string, string>();
  for (const member of definition.members) {
    const userId = await upsertUser(tx, member.email, member.fullName, context.passwordHash);
    const [membership] = await tx
      .insert(memberships)
      .values({
        organizationId,
        userId,
        status: 'active',
        allBranches: member.allBranches ?? false,
        title: member.title,
        invitedAt: new Date(),
        joinedAt: new Date(),
      })
      .returning({ id: memberships.id });
    const membershipId = membership!.id;
    await tx.insert(membershipRoles).values(
      member.roles.map((key) => {
        if (!isRoleTemplateKey(key)) throw new Error(`Unknown role template ${key}`);
        return { organizationId, membershipId, roleId: provisioned.roleIds[key] };
      }),
    );
    if (!member.allBranches && member.branches.length > 0) {
      await tx.insert(membershipBranches).values(
        member.branches.map((code) => ({
          organizationId,
          membershipId,
          branchId: branchId(code),
        })),
      );
    }
    if (member.personnel) {
      const [firstName, ...rest] = member.fullName.split(' ');
      const [row] = await tx
        .insert(personnel)
        .values({
          organizationId,
          branchId: branchId(member.personnel.branch),
          membershipId,
          firstName: firstName ?? member.fullName,
          lastName: rest.join(' ') || '-',
          position: member.personnel.position,
          department: member.personnel.department,
          employmentType: 'full_time',
          email: member.email,
          hireDate: formatIsoDate(startYear - 3, 9, 1),
        })
        .returning({ id: personnel.id });
      personnelByEmail.set(member.email, row!.id);
    }
  }

  // A pending invitation, so the user list shows the invitation flow.
  await inviteMember(tx, {
    organizationId,
    email: `davetli@${definition.slug}.test`,
    fullName: 'Davetli Kullanıcı',
    title: 'Muhasebe Asistanı',
    roleIds: [provisioned.roleIds.accountant],
    allBranches: false,
    branchIds: [provisioned.branchId],
    invitedByMembershipId: null,
  });

  for (const teacher of definition.teachers) {
    await tx.insert(personnel).values({
      organizationId,
      branchId: branchId(teacher.branch),
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      position: teacher.position,
      employmentType: 'full_time',
      hireDate: formatIsoDate(startYear - random.int(1, 8), 9, 1),
    });
  }

  let studentCount = 0;
  let paymentCount = 0;
  let previousGuardians: { ids: string[]; surname: string } | null = null;
  let nationalIdIndex = 0;

  for (const classDefinition of definition.classes) {
    const classBranchId = branchId(classDefinition.branch);
    const gradeId = gradeIds.get(classDefinition.grade)!;
    const [classRow] = await tx
      .insert(classes)
      .values({
        organizationId,
        branchId: classBranchId,
        academicYearId: academicYear!.id,
        gradeLevelId: gradeId,
        name: classDefinition.name,
        capacity: 24,
      })
      .returning({ id: classes.id });
    const classId = classRow!.id;

    if (classDefinition.homeroomEmail) {
      const personnelId = personnelByEmail.get(classDefinition.homeroomEmail);
      if (personnelId) {
        await tx.insert(teacherAssignments).values({
          organizationId,
          branchId: classBranchId,
          classId,
          personnelId,
          role: 'homeroom',
          startsOn: yearStart,
        });
      }
    }
    for (const assignment of classDefinition.subjectAssignments ?? []) {
      const personnelId = personnelByEmail.get(assignment.email);
      if (!personnelId) continue;
      await tx.insert(teacherAssignments).values({
        organizationId,
        branchId: classBranchId,
        classId,
        personnelId,
        role: 'subject',
        subject: assignment.subject,
        startsOn: yearStart,
      });
    }

    for (let index = 0; index < definition.studentsPerClass; index++) {
      const female = random.chance(0.5);
      const sibling: boolean = previousGuardians !== null && random.chance(0.15);
      const lastName: string =
        sibling && previousGuardians ? previousGuardians.surname : random.pick(SURNAMES);
      const firstName = random.pick(female ? FEMALE_NAMES : MALE_NAMES);
      const grade = Number(classDefinition.grade);
      const birthYear = startYear - (grade + 6) + (random.chance(0.3) ? -1 : 0);
      const studentNumber = await nextSequenceValue(tx, {
        organizationId,
        key: 'student_number',
        start: 1001,
      });
      const nationalId =
        definition.slug === 'atlas' && nationalIdIndex < TEST_NATIONAL_IDS.length && index === 0
          ? TEST_NATIONAL_IDS[nationalIdIndex++]
          : undefined;
      const protectedId = nationalId ? context.fieldEncryption.protect(nationalId) : null;

      const [student] = await tx
        .insert(students)
        .values({
          organizationId,
          branchId: classBranchId,
          studentNumber: String(studentNumber),
          firstName,
          lastName,
          gender: female ? 'female' : 'male',
          birthDate: formatIsoDate(birthYear, random.int(1, 12), random.int(1, 28)),
          nationalIdCiphertext: protectedId?.ciphertext ?? null,
          nationalIdHash: protectedId?.hash ?? null,
          nationalIdLast4: protectedId?.last4 ?? null,
          status: 'active',
          enrolledOn:
            grade > 9 && random.chance(0.6)
              ? formatIsoDate(startYear - (grade - 9), 9, 1)
              : yearStart,
          address: `${random.pick(['Moda', 'Fenerbahçe', 'Göztepe', 'Kozyatağı', 'Bahçelievler', 'Kavaklıdere'])} Mah. Kurgu Sok. No:${random.int(1, 80)}`,
          // Registered during the spring/summer registration season, not "today".
          createdAt: new Date(
            `${formatIsoDate(startYear, random.int(3, 7), random.int(1, 28))}T10:00:00+03:00`,
          ),
        })
        .returning({ id: students.id });
      const studentId = student!.id;
      studentCount++;

      // Guardians: siblings share their parents.
      let guardianIds: string[];
      if (sibling && previousGuardians) {
        guardianIds = previousGuardians.ids;
      } else {
        guardianIds = [];
        const parents = random.chance(0.75)
          ? (['mother', 'father'] as const)
          : ([random.pick(['mother', 'father'] as const)] as const);
        for (const relationship of parents) {
          const guardianFirst = random.pick(relationship === 'mother' ? FEMALE_NAMES : MALE_NAMES);
          const [guardian] = await tx
            .insert(guardians)
            .values({
              organizationId,
              firstName: guardianFirst,
              lastName,
              phone: `0500 000 ${String(random.int(10, 99))} ${String(random.int(10, 99))}`,
              email: `${slugAscii(guardianFirst)}.${slugAscii(lastName)}${random.int(1, 99)}@example.com`,
              occupation: random.pick(OCCUPATIONS),
            })
            .returning({ id: guardians.id });
          guardianIds.push(guardian!.id);
        }
      }
      for (const [guardianIndex, guardianId] of guardianIds.entries()) {
        await tx.insert(studentGuardians).values({
          organizationId,
          studentId,
          guardianId,
          relationship:
            guardianIds.length === 2
              ? guardianIndex === 0
                ? 'mother'
                : 'father'
              : random.pick(['mother', 'father'] as const),
          isPrimaryContact: guardianIndex === 0,
          isFinanciallyResponsible: guardianIndex === 0,
        });
      }
      previousGuardians = { ids: guardianIds, surname: lastName };

      const [enrollment] = await tx
        .insert(enrollments)
        .values({
          organizationId,
          branchId: classBranchId,
          studentId,
          academicYearId: academicYear!.id,
          gradeLevelId: gradeId,
          enrolledOn: yearStart,
        })
        .returning({ id: enrollments.id });
      await tx.insert(classEnrollments).values({
        organizationId,
        branchId: classBranchId,
        classId,
        studentId,
        startsOn: yearStart,
      });

      paymentCount += await seedStudentFinance(tx, random, {
        organizationId,
        branchId: classBranchId,
        studentId,
        enrollmentId: enrollment!.id,
        academicYearId: academicYear!.id,
        academicYearName: `${startYear}-${startYear + 1}`,
        responsibleGuardianId: guardianIds[0] ?? null,
        tuitionMinor: definition.tuitionMinor,
        sibling,
        startYear,
        today: context.today,
      });
    }
  }

  await tx.insert(auditLogs).values({
    organizationId,
    actorType: 'system',
    action: 'organization.created',
    resourceType: 'organization',
    resourceId: organizationId,
    metadata: { source: 'demo-seed' },
  });

  return { id: organizationId, students: studentCount, payments: paymentCount };
}

async function upsertUser(tx: Transaction, email: string, fullName: string, passwordHash: string) {
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(users)
    .values({
      email,
      fullName,
      passwordHash,
      status: 'active',
      emailVerifiedAt: new Date(),
      passwordChangedAt: new Date(),
    })
    .returning({ id: users.id });
  return created!.id;
}

interface StudentFinanceInput {
  organizationId: string;
  branchId: string;
  studentId: string;
  enrollmentId: string;
  academicYearId: string;
  academicYearName: string;
  responsibleGuardianId: string | null;
  tuitionMinor: number;
  sibling: boolean;
  startYear: number;
  today: string;
}

async function seedStudentFinance(
  tx: Transaction,
  random: Random,
  input: StudentFinanceInput,
): Promise<number> {
  const { organizationId, branchId, studentId } = input;
  const profile: PayerProfile = random.pick([
    'on_time',
    'on_time',
    'on_time',
    'on_time',
    'on_time',
    'on_time',
    'late_last',
    'late_last',
    'chronic',
    'prepaid',
  ] as const);

  const [account] = await tx
    .insert(financialAccounts)
    .values({ organizationId, branchId, studentId, currency: 'TRY' })
    .returning({ id: financialAccounts.id });
  const accountId = account!.id;

  const discounts: DiscountInput[] = [];
  if (input.sibling)
    discounts.push({
      kind: 'percentage',
      category: 'sibling',
      label: 'Kardeş indirimi',
      percentageBps: 1000,
    });
  if (random.chance(0.08)) {
    discounts.push({
      kind: 'percentage',
      category: 'scholarship',
      label: 'Başarı bursu',
      percentageBps: random.pick([2500, 5000]),
    });
  }
  if (profile === 'prepaid')
    discounts.push({
      kind: 'percentage',
      category: 'early_payment',
      label: 'Erken ödeme indirimi',
      percentageBps: 500,
    });

  const calculation = applyDiscounts(input.tuitionMinor, discounts);
  const downPaymentMinor = Math.floor((calculation.netAmountMinor * 0.2) / 100) * 100;
  const plan = {
    installmentCount: 9,
    firstDueDate: formatIsoDate(input.startYear, 9, 10),
    downPaymentMinor,
    downPaymentDueDate: formatIsoDate(input.startYear, 8, 15),
    roundingUnitMinor: 100 as const,
    remainderPlacement: 'last' as const,
  };
  const schedule = buildSchedule({ ...plan, netAmountMinor: calculation.netAmountMinor });

  const [agreement] = await tx
    .insert(tuitionAgreements)
    .values({
      organizationId,
      branchId,
      accountId,
      studentId,
      academicYearId: input.academicYearId,
      enrollmentId: input.enrollmentId,
      responsibleGuardianId: input.responsibleGuardianId,
      title: `${input.academicYearName} Eğitim Ücreti`,
      currency: 'TRY',
      grossAmountMinor: input.tuitionMinor,
      discountTotalMinor: calculation.discountTotalMinor,
      netAmountMinor: calculation.netAmountMinor,
      signedOn: formatIsoDate(input.startYear, 6, random.int(1, 28)),
    })
    .returning({ id: tuitionAgreements.id });
  const agreementId = agreement!.id;

  if (calculation.lines.length > 0) {
    await tx.insert(agreementDiscounts).values(
      calculation.lines.map((line, index) => ({
        organizationId,
        branchId,
        agreementId,
        sortOrder: index,
        category: line.category,
        label: line.label,
        kind: line.kind,
        percentageBps: line.percentageBps,
        fixedAmountMinor: line.fixedAmountMinor,
        amountMinor: line.amountMinor,
      })),
    );
  }

  const [paymentPlan] = await tx
    .insert(paymentPlans)
    .values({
      organizationId,
      branchId,
      agreementId,
      accountId,
      installmentCount: plan.installmentCount,
      firstDueDate: plan.firstDueDate,
      downPaymentMinor: plan.downPaymentMinor,
      totalMinor: calculation.netAmountMinor,
      roundingUnitMinor: plan.roundingUnitMinor,
      remainderPlacement: plan.remainderPlacement,
    })
    .returning({ id: paymentPlans.id });

  const open: OpenReceivable[] = [];
  for (const line of schedule) {
    const [row] = await tx
      .insert(receivables)
      .values({
        organizationId,
        branchId,
        accountId,
        studentId,
        agreementId,
        paymentPlanId: paymentPlan!.id,
        kind: 'installment',
        sequenceNo: line.sequenceNo,
        category: line.isDownPayment ? 'down_payment' : 'tuition',
        description: line.isDownPayment ? 'Peşinat' : `${line.sequenceNo}. taksit`,
        currency: 'TRY',
        amountMinor: line.amountMinor,
        dueDate: line.dueDate,
      })
      .returning({ id: receivables.id, createdAt: receivables.createdAt });
    open.push({
      id: row!.id,
      kind: 'installment',
      sequenceNo: line.sequenceNo,
      dueDate: line.dueDate,
      outstandingMinor: line.amountMinor,
      createdAt: row!.createdAt,
    });
  }

  if (random.chance(0.7)) {
    const dueDate = formatIsoDate(input.startYear, 9, 25);
    const [row] = await tx
      .insert(receivables)
      .values({
        organizationId,
        branchId,
        accountId,
        studentId,
        kind: 'charge',
        category: 'books',
        description: 'Ders kitabı seti',
        currency: 'TRY',
        amountMinor: BOOKS_FEE_MINOR,
        dueDate,
      })
      .returning({ id: receivables.id, createdAt: receivables.createdAt });
    open.push({
      id: row!.id,
      kind: 'charge',
      sequenceNo: null,
      dueDate,
      outstandingMinor: BOOKS_FEE_MINOR,
      createdAt: row!.createdAt,
    });
  }

  // Payment history up to yesterday, shaped by the payer profile.
  const dueBeforeToday = open
    .filter((receivable) => receivable.dueDate < input.today)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const plannedPayments: { date: string; amountMinor: number }[] = [];
  switch (profile) {
    case 'on_time':
      for (const receivable of dueBeforeToday) {
        plannedPayments.push({
          date: addDays(receivable.dueDate, -random.int(0, 4)),
          amountMinor: receivable.outstandingMinor,
        });
      }
      break;
    case 'late_last':
      for (const receivable of dueBeforeToday.slice(0, -1)) {
        plannedPayments.push({
          date: addDays(receivable.dueDate, random.int(0, 6)),
          amountMinor: receivable.outstandingMinor,
        });
      }
      break;
    case 'chronic': {
      const first = dueBeforeToday[0];
      if (first)
        plannedPayments.push({
          date: addDays(first.dueDate, random.int(8, 15)),
          amountMinor: Math.floor(first.outstandingMinor / 2 / 100) * 100,
        });
      break;
    }
    case 'prepaid': {
      const first = dueBeforeToday[0];
      if (first) {
        const total = open
          .filter((receivable) => receivable.kind === 'installment')
          .slice(0, 4)
          .reduce((sum, receivable) => sum + receivable.outstandingMinor, 0);
        plannedPayments.push({
          date: addDays(first.dueDate, -random.int(5, 10)),
          amountMinor: total,
        });
      }
      break;
    }
  }

  let created = 0;
  for (const planned of plannedPayments) {
    const date = planned.date < input.today ? planned.date : addDays(input.today, -1);
    if (planned.amountMinor <= 0) continue;
    const allocations = allocateOldestFirst(planned.amountMinor, open);
    const receiptYear = date.slice(0, 4);
    const receiptNumber = formatReceiptNumber(
      receiptYear,
      await nextSequenceValue(tx, { organizationId, key: 'receipt', period: receiptYear }),
    );
    const method: PaymentMethod = random.pick([
      'bank_transfer',
      'bank_transfer',
      'credit_card',
      'pos',
      'cash',
    ]);
    const hour = String(random.int(9, 17)).padStart(2, '0');
    const minute = String(random.int(0, 59)).padStart(2, '0');
    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId,
        branchId,
        accountId,
        studentId,
        payerGuardianId: input.responsibleGuardianId,
        currency: 'TRY',
        amountMinor: planned.amountMinor,
        method,
        receivedAt: new Date(`${date}T${hour}:${minute}:00+03:00`),
        receiptNumber,
        reference: method === 'bank_transfer' ? `EFT-${random.int(100_000, 999_999)}` : null,
      })
      .returning({ id: payments.id });
    if (allocations.length > 0) {
      await tx.insert(paymentAllocations).values(
        allocations.map((allocation) => ({
          organizationId,
          branchId,
          accountId,
          paymentId: payment!.id,
          receivableId: allocation.receivableId,
          amountMinor: allocation.amountMinor,
        })),
      );
      for (const allocation of allocations) {
        const receivable = open.find((item) => item.id === allocation.receivableId);
        if (receivable) receivable.outstandingMinor -= allocation.amountMinor;
      }
    }
    created++;
  }
  return created;
}

function slugAscii(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
