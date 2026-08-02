export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_ERROR";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message: string, details?: unknown): HttpError {
    return new HttpError(401, "UNAUTHORIZED", message, details);
  }

  static forbidden(message: string, details?: unknown): HttpError {
    return new HttpError(403, "FORBIDDEN", message, details);
  }

  static notFound(message: string, details?: unknown): HttpError {
    return new HttpError(404, "NOT_FOUND", message, details);
  }

  static conflict(message: string, details?: unknown): HttpError {
    return new HttpError(409, "CONFLICT", message, details);
  }
}
