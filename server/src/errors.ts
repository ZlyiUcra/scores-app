/**
 * Single typed error contract shared across services and routes.
 * The Express error middleware maps any AppError to { error: { code, message } }.
 */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Unwrap an id-addressed repository read, throwing a uniform NOT_FOUND (404)
 * when it came back empty. Collapses the `const x = await ...; if (!x) throw`
 * boilerplate repeated across the service reads; the message stays caller-specific.
 */
export function requireFound<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new AppError('NOT_FOUND', message, 404);
  return value;
}
