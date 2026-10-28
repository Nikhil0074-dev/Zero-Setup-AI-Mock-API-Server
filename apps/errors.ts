import type { ValidationIssue } from '../types';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ValidationIssue[],
    public readonly headers?: Record<string, string>
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const validationError = (details: ValidationIssue[], message = 'The request body is invalid.') =>
  new HttpError(400, 'VALIDATION_ERROR', message, details);
