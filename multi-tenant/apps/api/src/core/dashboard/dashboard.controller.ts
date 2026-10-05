import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { dashboardSchema } from '@repo/contracts';
import { ApiZodResponse } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor } from '../authorization/decorators.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiZodResponse(200, dashboardSchema)
  get(@CurrentActor() actor: Actor) {
    return this.dashboard.get(actor);
  }
}
