import { ApiError } from "./errors";
import { constantTimeEqual } from "./constant-time";

export function requireCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "CRON_UNAUTHORIZED", "Accès refusé.");
  }
  const received = authorization.slice("Bearer ".length);
  if (!constantTimeEqual(Buffer.from(secret), Buffer.from(received))) {
    throw new ApiError(401, "CRON_UNAUTHORIZED", "Accès refusé.");
  }
}
