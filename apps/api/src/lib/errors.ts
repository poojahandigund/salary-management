/**
 * An error whose message is safe to show to the API caller.
 *
 * Throw this for expected failures ("employee not found", "salary date before hire date").
 * Anything else that gets thrown is treated as a bug and reported as a generic 500.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
