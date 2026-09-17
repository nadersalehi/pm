import { expect, test } from "@playwright/test";
import { MockApi } from "./support/mockApi";

const signIn = async (page: import("@playwright/test").Page, password = "password") => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
};

test("shows the login form when not authenticated", async ({ page }) => {
  await MockApi.install(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).not.toBeVisible();
});

test("rejects wrong credentials with a visible error", async ({ page }) => {
  await MockApi.install(page);
  await page.goto("/");
  await signIn(page, "wrong-password");
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("logs in and out", async ({ page }) => {
  await MockApi.install(page);
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Product Roadmap" })).toBeVisible();
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("registers a new account and lands on a starter board", async ({ page }) => {
  await MockApi.install(page);
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill("grace");
  await page.getByLabel("Password").fill("long-password");
  await page.getByRole("button", { name: /^create account$/i }).click();

  await expect(page.getByRole("heading", { name: "My First Board" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByText("grace")).toBeVisible();
});

test("explains a taken username", async ({ page }) => {
  await MockApi.install(page);
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("long-password");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText(/already taken/)).toBeVisible();
});

test("returns to sign in when the session expires", async ({ page }) => {
  const api = await MockApi.install(page, { signedInAs: "user" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product Roadmap" })).toBeVisible();

  api.expireSessionOnNextRequest = true;
  await page
    .getByRole("button", { name: "Delete Align roadmap themes", exact: true })
    .click({ force: true });
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
