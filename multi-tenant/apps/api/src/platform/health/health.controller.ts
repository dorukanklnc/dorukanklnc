import {
  Controller,
  Get,
  HttpCode,
  Inject,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { Public } from '../../core/authorization/decorators.js';
import { RUNTIME_DB, SYSTEM_DB, type Database } from '../database/types.js';

@ApiTags('health')
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @Inject(RUNTIME_DB) private readonly runtimeDb: Database,
    @Inject(SYSTEM_DB) private readonly systemDb: Database,
  ) {}

  /** Liveness: the process is up. */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: both database pools answer. */
  @Public()
  @Get('ready')
  @HttpCode(200)
  async ready() {
    try {
      await Promise.all([
        this.runtimeDb.execute(sql`SELECT 1`),
        this.systemDb.execute(sql`SELECT 1`),
      ]);
      return { status: 'ok', checks: { database: 'ok' } };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks: { database: 'error' },
      });
    }
  }
}
