import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/editor/e2e",
  outputDir: ".local-writing-editor/playwright-results",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: "list",
});
