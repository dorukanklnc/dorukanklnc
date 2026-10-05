import { PERMISSION_KEYS, broadestAllowedScope, type PermissionKey } from './permissions.js';
import type { Scope } from './scopes.js';

export interface RoleGrant {
  readonly permission: PermissionKey;
  readonly scope: Scope;
}

export interface RoleTemplate {
  readonly key: string;
  /** Localized display names. The organization's default locale is used at provisioning time. */
  readonly name: { readonly tr: string; readonly en: string };
  readonly description: { readonly tr: string; readonly en: string };
  readonly grants: readonly RoleGrant[];
}

function grant(permission: PermissionKey, scope: Scope): RoleGrant {
  return { permission, scope };
}

function grants(scope: Scope, permissions: readonly PermissionKey[]): RoleGrant[] {
  return permissions.map((permission) => grant(permission, scope));
}

/**
 * Built-in role templates. Every new organization receives a copy of each template as a
 * read-only "system" role. Tenants customize access by cloning a system role into a custom role.
 *
 * Templates encode product decisions that are covered by tests, e.g. teachers never receive
 * finance permissions and accounting never receives attendance or academic permissions.
 */
export const ROLE_TEMPLATES = {
  owner: {
    key: 'owner',
    name: { tr: 'Kurum Yöneticisi', en: 'Organization owner' },
    description: {
      tr: 'Kurumun tüm modüllerine ve ayarlarına tam erişim.',
      en: 'Full access to every module and setting of the organization.',
    },
    grants: PERMISSION_KEYS.map((permission) => grant(permission, broadestAllowedScope(permission))),
  },
  principal: {
    key: 'principal',
    name: { tr: 'Okul Müdürü', en: 'Principal' },
    description: {
      tr: 'Kurum genelinde akademik ve operasyonel görünüm; finans yalnızca özet göstergeler.',
      en: 'Organization-wide academic and operational overview; finance as aggregate KPIs only.',
    },
    grants: grants('organization', [
      'students.read',
      'students.create',
      'students.update',
      'students.sensitive.read',
      'students.export',
      'guardians.read',
      'guardians.write',
      'admissions.read',
      'academics.read',
      'academics.manage',
      'attendance.read',
      'personnel.read',
      'finance.kpis.read',
      'reports.operational.read',
      'settings.users.read',
      'audit.read',
    ]),
  },
  branch_manager: {
    key: 'branch_manager',
    name: { tr: 'Şube Müdürü', en: 'Branch manager' },
    description: {
      tr: 'Yalnızca atandığı şubelerde müdür yetkileri ve kullanıcı yönetimi.',
      en: 'Principal-level access and user management limited to assigned branches.',
    },
    grants: grants('branch', [
      'students.read',
      'students.create',
      'students.update',
      'students.sensitive.read',
      'students.export',
      'guardians.read',
      'guardians.write',
      'admissions.read',
      'academics.read',
      'academics.manage',
      'attendance.read',
      'attendance.write',
      'personnel.read',
      'finance.kpis.read',
      'reports.operational.read',
      'settings.users.read',
      'settings.users.manage',
      'audit.read',
    ]),
  },
  accountant: {
    key: 'accountant',
    name: { tr: 'Muhasebe', en: 'Accountant' },
    description: {
      tr: 'Atandığı şubelerde tahsilat, ödeme planları ve finans raporları. Akademik ve rehberlik verilerine erişemez.',
      en: 'Collections, payment plans and finance reports in assigned branches. No academic or guidance data.',
    },
    grants: grants('branch', [
      'students.read',
      'guardians.read',
      'finance.collections.read',
      'finance.collections.write',
      'finance.payments.read',
      'finance.payments.create',
      'finance.payments.reverse',
      'finance.refunds.create',
      'finance.reports.read',
      'finance.kpis.read',
    ]),
  },
  teacher: {
    key: 'teacher',
    name: { tr: 'Öğretmen', en: 'Teacher' },
    description: {
      tr: 'Yalnızca derslerine atanmış öğrenciler, sınıf bilgileri ve yoklama. Finans verisi yoktur.',
      en: 'Only assigned students, class information and attendance. No finance data.',
    },
    grants: grants('assigned', [
      'students.read',
      'guardians.read',
      'academics.read',
      'attendance.read',
      'attendance.write',
    ]),
  },
  student_affairs: {
    key: 'student_affairs',
    name: { tr: 'Öğrenci İşleri', en: 'Student affairs' },
    description: {
      tr: 'Öğrenci ve veli kayıtları, ön kayıt dönüşümü, sınıf listeleri ve devamsızlık takibi.',
      en: 'Student and guardian records, admissions conversion, class rosters and absence follow-up.',
    },
    grants: grants('branch', [
      'students.read',
      'students.create',
      'students.update',
      'students.archive',
      'students.sensitive.read',
      'students.export',
      'guardians.read',
      'guardians.write',
      'admissions.read',
      'admissions.write',
      'admissions.convert',
      'academics.read',
      'academics.manage',
      'attendance.read',
      'reports.operational.read',
    ]),
  },
  admissions_officer: {
    key: 'admissions_officer',
    name: { tr: 'Kayıt Danışmanı', en: 'Admissions officer' },
    description: {
      tr: 'Kendisine atanan ön kayıt adaylarını yönetir.',
      en: 'Manages the pre-registration leads assigned to them.',
    },
    grants: grants('own', ['admissions.read', 'admissions.write']),
  },
} as const satisfies Record<string, RoleTemplate>;

export type RoleTemplateKey = keyof typeof ROLE_TEMPLATES;

export const ROLE_TEMPLATE_KEYS = Object.keys(ROLE_TEMPLATES) as RoleTemplateKey[];

export function isRoleTemplateKey(value: unknown): value is RoleTemplateKey {
  return typeof value === 'string' && Object.hasOwn(ROLE_TEMPLATES, value);
}
