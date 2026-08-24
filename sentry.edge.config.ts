import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.VERCEL_ENV === "production",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  tracesSampleRate: 0.1,

  enableLogs: true,
});
