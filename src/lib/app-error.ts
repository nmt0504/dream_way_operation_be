// Every error the API returns: { error: { code, message, field?, ...extra } }
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFoundError = (code: string, message: string) => new AppError(404, code, message);
