/** Every failure crossing the worker boundary is one of these codes, with a human message. */
export type ErrorCode =
  | 'damaged'
  | 'encrypted'
  | 'wrong_password'
  | 'too_large'
  | 'too_many_pages'
  | 'timeout'
  | 'cancelled'
  | 'invalid_input'
  | 'unsupported'
  | 'internal';

export interface OpError {
  code: ErrorCode;
  message: string;
}

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  damaged: 'This PDF is damaged or is not a PDF, so it could not be read.',
  encrypted: 'This PDF is password-protected. Remove the password first with the Unlock tool.',
  wrong_password: 'That password is not correct for this PDF.',
  too_large: 'This file is too large to process in the browser.',
  too_many_pages: 'This PDF has too many pages to process in the browser.',
  timeout: 'This took too long and was stopped. The file may be unusually complex or damaged.',
  cancelled: 'Cancelled.',
  invalid_input: 'Those settings are not valid for this file.',
  unsupported: 'This file uses a feature that is not supported yet.',
  internal: 'Something went wrong while processing this file.',
};

export class PdfToolsError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'PdfToolsError';
    this.code = code;
  }
}

export function defaultMessage(code: ErrorCode): string {
  return DEFAULT_MESSAGES[code];
}

/** Normalise anything thrown into a typed, serialisable error. Never leaks stack traces to the UI. */
export function toOpError(err: unknown): OpError {
  if (err instanceof PdfToolsError) return { code: err.code, message: err.message };
  if (err instanceof RangeError) return { code: 'too_large', message: DEFAULT_MESSAGES.too_large };
  return { code: 'internal', message: DEFAULT_MESSAGES.internal };
}
