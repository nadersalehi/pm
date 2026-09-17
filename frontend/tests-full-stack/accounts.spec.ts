import { expect, test, type Page } from "@playwright/test";

const register = async (page: Page, username: string, password: string) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByRole("heading", { name: "My First Board" })).toBeVisible();
};

const signIn = async (page: Page, username: string, password: string) => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
};

test("accounts keep their boards private and can be managed end to end", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const alice = `alice_${suffix}`;
  const bob = `bob_${suffix}`;

  await register(page, alice, "alice-password");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Alice private card");
  await firstColumn.getByRole("button", { name: /^add card$/i }).click();
  await expect(firstColumn.getByText("Alice private card")).toBeVisible();

  await page.getByRole("button", { name: "Switch board" }).click();
  await page.getByRole("menuitem", { name: /new board/i }).click();
  await page.getByLabel("Board name").fill("Alice side project");
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByRole("heading", { name: "Alice side project" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await register(page, bob, "bob-password");
  await expect(page.getByText("Alice private card")).not.toBeVisible();
  await page.getByRole("button", { name: "Switch board" }).click();
  await expect(page.getByRole("menuitemradio")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByLabel("Current password").fill("bob-password");
  await page.getByLabel("New password").fill("bob-new-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, bob, "bob-password");
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  await signIn(page, bob, "bob-new-password");
  await expect(page.getByRole("heading", { name: "My First Board" })).toBeVisible();

  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByLabel("Confirm with your password").fill("bob-new-password");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await signIn(page, bob, "bob-new-password");
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();

  await signIn(page, alice, "alice-password");
  await expect(page.getByRole("button", { name: "Switch board" })).toHaveText(/Alice side project/);
  await page.getByRole("button", { name: "Switch board" }).click();
  await page.getByRole("menuitemradio", { name: /my first board/i }).click();
  await expect(page.getByText("Alice private card")).toBeVisible();
});
