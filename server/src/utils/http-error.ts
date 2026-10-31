/** Error carrying the HTTP status a controller should respond with. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
