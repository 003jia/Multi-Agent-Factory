export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "TASK_BUSY"
  | "INVALID_STAGE"
  | "APPLY_BLOCKED"
  | "HASH_MISMATCH"
  | "PROJECT_DIRTY"
  | "PROJECT_SCAN_DISABLED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
  }
}

export function validationError(message: string, details?: unknown) {
  return new AppError("VALIDATION_ERROR", message, 400, details);
}

