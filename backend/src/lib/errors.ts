/** An error with an HTTP status and a message safe to show to the user. */
export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string) => new HttpError(400, message, "bad_request");
export const unauthorized = (message = "Please log in to continue.") => new HttpError(401, message, "unauthorized");
export const forbidden = (message = "You don't have access to this.") => new HttpError(403, message, "forbidden");
export const notFound = (message = "Not found.") => new HttpError(404, message, "not_found");
export const conflict = (message: string) => new HttpError(409, message, "conflict");
export const tooMany = (message: string) => new HttpError(429, message, "rate_limited");
