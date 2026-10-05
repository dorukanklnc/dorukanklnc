import { Body, type PipeTransform, Query, applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { FieldError } from '@repo/contracts';
import { z } from 'zod';
import { Errors } from '../errors/app-error.js';

export function zodIssuesToFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: issue.code,
    message: issue.message,
  }));
}

/** Validates and transforms a request part with a Zod schema; failures become 400 problems. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) throw Errors.validation(zodIssuesToFieldErrors(result.error));
    return result.data;
  }
}

/** JSON Schema (OpenAPI 3.0 flavour) for documentation purposes. */
export function toOpenApiSchema(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' });
}

/** `@ValidBody(schema)` — validated, typed request body. */
export const ValidBody = (schema: z.ZodType) => Body(new ZodValidationPipe(schema));

/** `@ValidQuery(schema)` — validated, typed query string. */
export const ValidQuery = (schema: z.ZodType) => Query(new ZodValidationPipe(schema));

/** Documents a Zod request body in OpenAPI. */
export function ApiZodBody(schema: z.ZodType) {
  return applyDecorators(ApiBody({ schema: toOpenApiSchema(schema, 'input') }));
}

/** Documents Zod-described query parameters in OpenAPI (object schemas only). */
export function ApiZodQuery(schema: z.ZodObject) {
  const json = toOpenApiSchema(schema, 'input') as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  const decorators = Object.entries(json.properties ?? {}).map(([name, property]) =>
    ApiQuery({ name, required: json.required?.includes(name) ?? false, schema: property }),
  );
  return applyDecorators(...decorators);
}

/** Documents a Zod response body in OpenAPI. */
export function ApiZodResponse(status: number, schema: z.ZodType, description?: string) {
  return applyDecorators(
    ApiResponse({ status, description: description ?? 'OK', schema: toOpenApiSchema(schema, 'output') }),
  );
}
