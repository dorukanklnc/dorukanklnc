import {
  AlarmClock,
  Building2,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  School,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { type AccessContext, type RouteKey, ROUTE_ACCESS, canAccess } from './access';

export type NavGroupKey = 'overview' | 'students' | 'finance' | 'administration' | 'platform';

export type NavItemKey =
  | 'dashboard'
  | 'students'
  | 'guardians'
  | 'classes'
  | 'collections'
  | 'installments'
  | 'payments'
  | 'overdue'
  | 'users'
  | 'roles'
  | 'branches'
  | 'organization'
  | 'audit'
  | 'organizations';

export interface NavItem {
  readonly key: NavItemKey;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly route: RouteKey;
}

export interface NavGroup {
  readonly key: NavGroupKey;
  readonly items: readonly NavItem[];
}

/**
 * The application map. Items the member may not use are removed (not disabled), and a group
 * without visible items disappears entirely.
 */
export const NAVIGATION: readonly NavGroup[] = [
  {
    key: 'overview',
    items: [{ key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, route: 'dashboard' }],
  },
  {
    key: 'students',
    items: [
      { key: 'students', href: '/students', icon: GraduationCap, route: 'students' },
      { key: 'guardians', href: '/guardians', icon: Users, route: 'guardians' },
      { key: 'classes', href: '/classes', icon: School, route: 'classes' },
    ],
  },
  {
    key: 'finance',
    items: [
      { key: 'collections', href: '/finance', icon: Landmark, route: 'collections' },
      {
        key: 'installments',
        href: '/finance/receivables',
        icon: ReceiptText,
        route: 'receivables',
      },
      { key: 'payments', href: '/finance/payments', icon: Wallet, route: 'payments' },
      { key: 'overdue', href: '/finance/overdue', icon: AlarmClock, route: 'receivables' },
    ],
  },
  {
    key: 'administration',
    items: [
      { key: 'users', href: '/admin/users', icon: UserCog, route: 'users' },
      { key: 'roles', href: '/admin/roles', icon: ShieldCheck, route: 'roles' },
      { key: 'branches', href: '/admin/branches', icon: Building2, route: 'branches' },
      { key: 'organization', href: '/admin/organization', icon: Settings2, route: 'organization' },
      { key: 'audit', href: '/admin/audit', icon: ScrollText, route: 'audit' },
    ],
  },
  {
    key: 'platform',
    items: [
      {
        key: 'organizations',
        href: '/platform/organizations',
        icon: Building2,
        route: 'platformOrganizations',
      },
    ],
  },
];

export function visibleNavigation(access: AccessContext): NavGroup[] {
  return NAVIGATION.map((group) => ({
    key: group.key,
    items: group.items.filter((item) => canAccess(ROUTE_ACCESS[item.route], access)),
  })).filter((group) => group.items.length > 0);
}

/** The nav entry for a path: the longest matching prefix wins (`/finance/payments/x` → payments). */
export function activeNavHref(pathname: string, groups: readonly NavGroup[]): string | null {
  let best: string | null = null;
  for (const item of groups.flatMap((group) => group.items)) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

/** Where a member lands after signing in: the first screen they can use. */
export function homePath(access: AccessContext): string {
  if (access.hasOrganization) return '/dashboard';
  if (canAccess(ROUTE_ACCESS.platformOrganizations, access)) return '/platform/organizations';
  return '/select-organization';
}
