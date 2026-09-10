import { expect, test } from "@playwright/test";

test("AI chat updates the board live against the real backend", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();

  // Read the first column's current title rather than assuming "Backlog" -
  // this suite shares a live backend/DB with board-persistence.spec.ts,
  // which may have already renamed it.
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const columnTitle = await firstColumn.getByLabel("Column title").inputValue();

  await page
    .getByLabel("Chat message")
    .fill(`Add a card called 'Test AI Card' to the ${columnTitle} column.`);
  await page.getByRole("button", { name: /send/i }).click();

  // Live call against OpenRouter - not mocked, requires network.
  await expect(firstColumn.getByText("Test AI Card")).toBeVisible({
    timeout: 30_000,
  });
});
