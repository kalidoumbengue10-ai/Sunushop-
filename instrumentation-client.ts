import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NEXT_PUBLIC_VERCEL_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

  // 100% in dev, 10% in production
  tracesSampleRate: 0.1,

  enableLogs: true,
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (error instanceof DOMException && error.name === "AbortError") return null;
    if (error instanceof Error && /aborted|failed to fetch/i.test(error.message)) return null;
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
