import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-full-stack",
  timeout: 60_000,
  // Every spec here shares one live backend + SQLite DB (a single container,
  // started once by scripts/test-e2e-full.sh) - run serially so tests don't
  // race each other's mutations.
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
