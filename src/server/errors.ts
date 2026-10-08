/** Error the server layer returns to clients. `code` is stable and safe to show or switch on. */
export class ServerError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = "ServerError";
    this.code = code;
    this.detail = detail;
  }
}
