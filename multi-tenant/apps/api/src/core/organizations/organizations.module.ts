import { Global, Module } from '@nestjs/common';
import { InvitationMailer } from './invitation-mailer.js';
import { OrganizationController } from './organization.controller.js';
import { OrganizationService } from './organization.service.js';
import { PlatformOrganizationsController } from './platform-organizations.controller.js';
import { PlatformOrganizationsService } from './platform-organizations.service.js';

@Global()
@Module({
  controllers: [PlatformOrganizationsController, OrganizationController],
  providers: [PlatformOrganizationsService, OrganizationService, InvitationMailer],
  exports: [InvitationMailer],
})
export class OrganizationsModule {}
