/**
 * Wire-level errors and the ERROR payload codes.
 */

export const ERROR_CODES = Object.freeze([
  "AUTH_FAILED",
  "CHANNEL_TAKEN",
  "VERSION_MISMATCH",
  "RATE_LIMIT",
  "TRACK_LIMIT",
  "MALFORMED",
] as const);

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

/** Thrown by decoders when the input violates the wire contract. */
export class ProtocolError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BAD_MAGIC"
      | "BAD_LENGTH"
      | "BAD_TRACK"
      | "BAD_TYPE"
      | "BAD_PAYLOAD"
      | "TOO_LARGE",
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}
