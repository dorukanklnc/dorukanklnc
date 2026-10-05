import { Global, Module } from '@nestjs/common';
import { OutboxService } from '../outbox/outbox.service.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogService } from './audit-log.service.js';
import { AuditService } from './audit.service.js';

/** Audit trail and outbox writers are used by every module. */
@Global()
@Module({
  controllers: [AuditLogController],
  providers: [AuditService, OutboxService, AuditLogService],
  exports: [AuditService, OutboxService],
})
export class AuditModule {}
