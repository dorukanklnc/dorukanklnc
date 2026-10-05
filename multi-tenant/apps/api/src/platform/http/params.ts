import { Param, type PipeTransform } from '@nestjs/common';
import { Errors } from '../errors/app-error.js';
import { isUuid } from '../ids.js';

/** Malformed ids are indistinguishable from unknown ids: both are "not found". */
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUuid(value)) throw Errors.notFound();
    return value.toLowerCase();
  }
}

/** `@UuidParam('id')` — a path parameter that must be a UUID. */
export const UuidParam = (name: string) => Param(name, new UuidPipe());
