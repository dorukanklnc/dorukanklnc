/**
 * Domain event catalog. Event names are part of the integration contract (outbox → future CDC
 * stream): never rename an event; introduce a new version instead.
 */
export const DomainEvents = {
  organizationCreated: 'organization.created',
  memberInvited: 'member.invited',
  memberJoined: 'member.joined',
  studentCreated: 'student.created',
  studentUpdated: 'student.updated',
  studentEnrolled: 'student.enrolled',
  agreementCreated: 'agreement.created',
  paymentPlanCreated: 'payment_plan.created',
  installmentCreated: 'installment.created',
  chargeCreated: 'charge.created',
  installmentOverdue: 'installment.overdue',
  paymentReceived: 'payment.received',
  paymentReversed: 'payment.reversed',
} as const;

export type DomainEventType = (typeof DomainEvents)[keyof typeof DomainEvents];
