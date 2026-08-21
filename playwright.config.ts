import { defineConfig, devices } from "@playwright/test";
import { assertDisposableLocalE2E } from "./e2e/local-environment";

assertDisposableLocalE2E();

const responsiveSuite = /(?:^|[\\/])(?:access-menu|auth-password-visibility|checkout-delivery-region|courier-access-responsive|marketplace|responsive-no-overflow)\.spec\.ts$/;
const visualResponsiveSuite = /(?:^|[\\/])(?:access-menu|courier-access-responsive|marketplace|responsive-no-overflow)\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  outputDir: `test-results/${process.env.SUNUSHOP_E2E_RUN_ID ?? "local-unscoped"}`,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : [
    {
      command: "node scripts/mock-resend-server.mjs",
      port: 3110,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ELECTRON_RUN_AS_NODE: "", DEBUG: "" },
    },
    {
      command: process.env.SUNUSHOP_E2E_PRODUCTION_SERVER === "1"
        ? "npm run start -- --port 3107"
        : "npm run dev -- --port 3107",
      url: "http://127.0.0.1:3107/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ELECTRON_RUN_AS_NODE: "",
        DEBUG: "",
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        DELIVERY_CODE_SECRET: process.env.DELIVERY_CODE_SECRET ?? "e2e-local-delivery-code-secret-32-chars",
        COURIER_PIN_SECRET: process.env.COURIER_PIN_SECRET ?? "e2e-local-courier-pin-secret-32-chars",
        RATE_LIMIT_HASH_SECRET: process.env.RATE_LIMIT_HASH_SECRET ?? "e2e-local-rate-limit-secret-32-chars",
        SUNUSHOP_E2E_LOCAL_RESET: process.env.SUNUSHOP_E2E_LOCAL_RESET ?? "",
        RESEND_API_KEY: "re_e2e_local",
        SUNUSHOP_EMAIL_API_URL: "http://127.0.0.1:3110/emails",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3107",
        OPENROUTESERVICE_API_KEY: "e2e-local-key",
        OPENROUTESERVICE_API_URL: "http://127.0.0.1:3110",
        NEXT_PUBLIC_POSTHOG_KEY: "",
        NEXT_PUBLIC_SENTRY_DSN: "",
        SENTRY_DSN: "",
      },
    },
  ],
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", testMatch: responsiveSuite, use: { ...devices["Pixel 5"] } },
    { name: "chromium-320", testMatch: visualResponsiveSuite, use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 740 }, hasTouch: true } },
    { name: "chromium-393", testMatch: visualResponsiveSuite, use: { ...devices["Desktop Chrome"], viewport: { width: 393, height: 852 }, hasTouch: true } },
    { name: "chromium-tablet", testMatch: visualResponsiveSuite, use: { ...devices["iPad Mini"], browserName: "chromium" } },
    { name: "chromium-1440", testMatch: visualResponsiveSuite, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
  ],
});
