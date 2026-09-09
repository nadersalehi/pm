import { expect, test } from "@playwright/test";
import { mockLogin, mockUnauthenticated } from "./support/auth";
import { mockBoard } from "./support/board";

test.beforeEach(async ({ page }) => {
  await mockUnauthenticated(page);
  await mockLogin(page, { username: "user", password: "password" });
  await mockBoard(page);
  await page.route("**/api/logout", (route) =>
    route.fulfill({ status: 200, json: { message: "logged out" } })
  );
});

test("shows the login form when not authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).not.toBeVisible();
});

test("rejects wrong credentials with a visible error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).not.toBeVisible();
});

test("logs in and out", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
