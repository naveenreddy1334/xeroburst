// Error codes and their HTTP statuses (section 19.1).

export const ERROR_HTTP = {
  AUTH_REQUIRED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  FORBIDDEN: 403,
  ROLE_RANK: 403,
  OUT_OF_SCOPE: 403,
  GAME_LOCKED: 403,
  /** Added: a temporary password must be changed before anything else is reachable (11.2 step 5). */
  PASSWORD_CHANGE_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BOARD_BUSY: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP;

export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  AUTH_REQUIRED: 'Please sign in.',
  TOKEN_EXPIRED: 'Your session expired. Refreshing.',
  INVALID_CREDENTIALS: 'Invalid ID or secret.',
  ACCOUNT_LOCKED: 'Too many attempts. Try again later.',
  FORBIDDEN: 'You do not have permission to do that.',
  ROLE_RANK: 'You cannot manage an account of equal or higher rank.',
  OUT_OF_SCOPE: 'That record belongs to someone else.',
  GAME_LOCKED: 'This game is not unlocked for you.',
  PASSWORD_CHANGE_REQUIRED: 'Change your password before continuing.',
  NOT_FOUND: 'Not found.',
  CONFLICT: 'That conflicts with existing data.',
  BOARD_BUSY: 'The board is being used by someone else.',
  VALIDATION: 'Some fields are not valid.',
  RATE_LIMITED: 'Too many requests. Slow down.',
  SERVER_ERROR: 'Unexpected server error.',
};

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
