import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { normalizeApiError } from "./errors";

export function apiSuccess<T>(
  data: T,
  options: { status?: number; requestId?: string } = {},
) {
  const requestId = options.requestId ?? crypto.randomUUID();
  return NextResponse.json(
    { data, requestId },
    {
      status: options.status ?? 200,
      headers: { "x-request-id": requestId },
    },
  );
}

export function apiFailure(error: unknown, requestId = crypto.randomUUID()) {
  const normalized = normalizeApiError(error);
  if (normalized.status >= 500) {
    const cause = error as { code?: unknown; message?: unknown; name?: unknown };
    console.error("[api_failure]", {
      requestId,
      code: normalized.code,
      causeCode: typeof cause?.code === "string" ? cause.code : undefined,
      causeName: typeof cause?.name === "string" ? cause.name : undefined,
      causeMessage:
        typeof cause?.message === "string" ? cause.message : "Unknown error",
    });
    const sentryError = error instanceof Error
      ? error
      : Object.assign(new Error(typeof cause?.message === "string" ? cause.message : "Unknown API failure"), {
          name: typeof cause?.name === "string" ? cause.name : "ApiFailure",
        });
    const causeCode = typeof cause?.code === "string" ? cause.code : "unknown";
    const causeName = typeof cause?.name === "string" ? cause.name : sentryError.name;
    Sentry.captureException(sentryError, {
      tags: { requestId, errorCode: normalized.code, causeCode, causeName },
      fingerprint: ["api-route-failure", normalized.code, causeCode, causeName],
      extra: { requestId, originalCause: error },
    });
  }
  return NextResponse.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        fieldErrors: normalized.fieldErrors,
        requestId,
      },
    },
    {
      status: normalized.status,
      headers: { "x-request-id": requestId },
    },
  );
}
