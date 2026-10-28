import type { ValidateFunction } from 'ajv';
import { validationError } from '../../utils/errors';
import { validateData } from './schemaValidator';

/** Validate a JSON request body; throws a structured 400 on failure. */
export function assertValidBody(validate: ValidateFunction, body: unknown): void {
  const issues = validateData(validate, body === undefined ? {} : body);
  if (body === undefined && issues.length === 0) return;
  if (issues.length) throw validationError(issues);
}
