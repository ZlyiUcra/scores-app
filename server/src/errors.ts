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
