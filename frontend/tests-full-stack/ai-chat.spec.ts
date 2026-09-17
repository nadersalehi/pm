import { expect, test } from "@playwright/test";

// The backend allows up to two 45s attempts per model call (see backend/app/ai.py).
const ASSISTANT_TIMEOUT = 100_000;

test("AI chat updates the board live against the real backend", async ({ page }) => {
  test.setTimeout(2 * ASSISTANT_TIMEOUT + 30_000);

  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  // Read the first column's current title rather than assuming "Backlog" -
  // this suite shares a live backend/DB with the other full-stack specs.
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const columnTitle = await firstColumn.getByLabel("Column title").inputValue();
  const card = firstColumn.getByText("Test AI Card");
  const input = page.getByLabel("Chat message");

  // Live, unmocked model: a reply occasionally proposes an operation the backend
  // rejects (it says so in the reply), so allow one retry before failing.
  for (let attempt = 0; attempt < 2 && !(await card.isVisible()); attempt += 1) {
    await input.fill(`Add a card called 'Test AI Card' to the ${columnTitle} column.`);
    await page.getByRole("button", { name: /send/i }).click();
    await expect(input).toBeEnabled({ timeout: ASSISTANT_TIMEOUT });
  }

  await expect(card).toBeVisible();
});
