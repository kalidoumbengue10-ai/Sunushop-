import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingRoot: process.cwd(),
  async headers() {
    const isDevelopment = process.env.NODE_ENV === "development";
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const isLoopbackSite = (() => {
      if (!configuredSiteUrl) return false;
      const hostname = new URL(configuredSiteUrl).hostname;
      return ["127.0.0.1", "localhost", "::1"].includes(hostname);
    })();
    const configuredSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const localSupabaseSources = (() => {
      if (!configuredSupabase) return [];
      const url = new URL(configuredSupabase);
      if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) return [];
      const websocket = new URL(url);
      websocket.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return [url.origin, websocket.origin];
    })();
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      // Cloudflare Turnstile nécessite 'unsafe-eval' pour son défi anti-robot,
      // y compris en production — sans cela le widget ne s'active jamais.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${localSupabaseSources.join(" ")} https://challenges.cloudflare.com https://tiles.openfreemap.org https://*.ingest.de.sentry.io https://*.i.posthog.com`,
      "worker-src 'self' blob:",
      "frame-src https://challenges.cloudflare.com",
      ...(isDevelopment || isLoopbackSite ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          ...(isDevelopment
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]),
        ],
      },
      {
        source: "/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Source map upload auth token
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload wider set of client source files for better stack trace resolution
  widenClientFileUpload: true,

  // Create a proxy API route to bypass ad-blockers
  tunnelRoute: "/monitoring",

  // Suppress non-CI output
  silent: !process.env.CI,
});
