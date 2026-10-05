import { Module } from '@nestjs/common';
import { AcademicsController } from './academics/academics.controller.js';
import { AcademicsService } from './academics/academics.service.js';
import { GuardiansController } from './guardians/guardians.controller.js';
import { GuardiansService } from './guardians/guardians.service.js';
import { StudentsController } from './students/students.controller.js';
import { StudentsService } from './students/students.service.js';

@Module({
  controllers: [StudentsController, GuardiansController, AcademicsController],
  providers: [StudentsService, GuardiansService, AcademicsService],
  exports: [StudentsService],
})
export class EducationModule {}
