import { ERROR_HTTP, ERROR_MESSAGE } from '@nboard/shared';
import type { ErrorCode } from '@nboard/shared';

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    message?: string,
  ) {
    super(message ?? ERROR_MESSAGE[code]);
    this.status = ERROR_HTTP[code];
  }
}

export const notFound = (what = 'Record') => new ApiError('NOT_FOUND', undefined, `${what} not found.`);
export const forbidden = (message?: string) => new ApiError('FORBIDDEN', undefined, message);
export const conflict = (message: string, details?: Record<string, unknown>) => new ApiError('CONFLICT', details, message);
