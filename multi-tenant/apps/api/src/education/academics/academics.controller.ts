import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ClassListQuery,
  academicYearSchema,
  classListQuerySchema,
  classSummarySchema,
  gradeLevelSchema,
} from '@repo/contracts';
import { z } from 'zod';
import { ApiZodQuery, ApiZodResponse, ValidQuery } from '../../platform/http/zod.js';
import type { Actor } from '../../core/authorization/actor.js';
import { CurrentActor, RequirePermission } from '../../core/authorization/decorators.js';
import { AcademicsService } from './academics.service.js';

@ApiTags('academics')
@Controller('academics')
export class AcademicsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get('years')
  @ApiZodResponse(200, z.array(academicYearSchema))
  years(@CurrentActor() actor: Actor) {
    return this.academics.years(actor);
  }

  @Get('grade-levels')
  @ApiZodResponse(200, z.array(gradeLevelSchema))
  gradeLevels(@CurrentActor() actor: Actor) {
    return this.academics.gradeLevels(actor);
  }

  @RequirePermission('academics.read')
  @Get('classes')
  @ApiZodQuery(classListQuerySchema)
  @ApiZodResponse(200, z.array(classSummarySchema))
  classes(@CurrentActor() actor: Actor, @ValidQuery(classListQuerySchema) query: ClassListQuery) {
    return this.academics.classes(actor, query);
  }
}
