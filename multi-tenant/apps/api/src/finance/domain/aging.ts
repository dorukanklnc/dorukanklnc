import type { AgingBucket } from '@repo/contracts';
import { daysBetween } from './dates.js';

/** Days a due date is overdue as of `today` (0 when not yet overdue; due today is not overdue). */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.max(0, daysBetween(dueDate, today));
}

export function agingBucket(overdueDays: number): AgingBucket {
  if (overdueDays <= 0) return 'not_due';
  if (overdueDays <= 30) return 'd1_30';
  if (overdueDays <= 60) return 'd31_60';
  if (overdueDays <= 90) return 'd61_90';
  return 'd90_plus';
}

export const AGING_BUCKETS: readonly AgingBucket[] = ['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];
