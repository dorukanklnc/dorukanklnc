import { Global, Module } from '@nestjs/common';
import { AuthorizationContextService } from '../authorization/authorization-context.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, PasswordService, AuthorizationContextService, AuthGuard],
  exports: [SessionService, PasswordService, AuthorizationContextService, AuthGuard, AuthService],
})
export class AuthModule {}
