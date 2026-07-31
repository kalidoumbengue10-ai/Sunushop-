import { timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors";

export function requireCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "CRON_UNAUTHORIZED", "Accès refusé.");
  }
  const received = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(secret);
  const receivedBuffer = Buffer.from(received);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new ApiError(401, "CRON_UNAUTHORIZED", "Accès refusé.");
  }
}
