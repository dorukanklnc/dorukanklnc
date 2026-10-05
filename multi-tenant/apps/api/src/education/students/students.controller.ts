import { Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreateStudentRequest,
  type StudentListQuery,
  type UpdateStudentRequest,
  createStudentRequestSchema,
  paginatedSchema,
  studentDetailSchema,
  studentListItemSchema,
  studentListQuerySchema,
  updateStudentRequestSchema,
} from '@repo/contracts';
import { UuidParam } from '../../platform/http/params.js';
import { ApiZodBody, ApiZodQuery, ApiZodResponse, ValidBody, ValidQuery } from '../../platform/http/zod.js';
import type { Actor } from '../../core/authorization/actor.js';
import { CurrentActor, RequirePermission } from '../../core/authorization/decorators.js';
import { StudentsService } from './students.service.js';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @RequirePermission('students.read')
  @Get()
  @ApiZodQuery(studentListQuerySchema)
  @ApiZodResponse(200, paginatedSchema(studentListItemSchema))
  list(@CurrentActor() actor: Actor, @ValidQuery(studentListQuerySchema) query: StudentListQuery) {
    return this.students.list(actor, query);
  }

  @RequirePermission('students.read')
  @Get(':id')
  @ApiZodResponse(200, studentDetailSchema)
  get(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.students.get(actor, id);
  }

  @RequirePermission('students.create')
  @Post()
  @ApiZodBody(createStudentRequestSchema)
  @ApiZodResponse(201, studentDetailSchema)
  create(@CurrentActor() actor: Actor, @ValidBody(createStudentRequestSchema) body: CreateStudentRequest) {
    return this.students.create(actor, body);
  }

  @RequirePermission('students.update')
  @Patch(':id')
  @ApiZodBody(updateStudentRequestSchema)
  @ApiZodResponse(200, studentDetailSchema)
  update(
    @CurrentActor() actor: Actor,
    @UuidParam('id') id: string,
    @ValidBody(updateStudentRequestSchema) body: UpdateStudentRequest,
  ) {
    return this.students.update(actor, id, body);
  }

  @RequirePermission('students.archive')
  @Delete(':id')
  @HttpCode(204)
  async archive(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    await this.students.archive(actor, id);
  }

  /** Returns the unmasked national ID and records the access in the audit log. */
  @RequirePermission('students.sensitive.read')
  @Post(':id/national-id/reveal')
  @HttpCode(200)
  revealNationalId(@CurrentActor() actor: Actor, @UuidParam('id') id: string) {
    return this.students.revealNationalId(actor, id);
  }
}
