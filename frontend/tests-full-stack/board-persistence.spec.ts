import { expect, test } from "@playwright/test";

test("board changes persist across a reload against the real backend", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();

  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const titleInput = firstColumn.getByLabel("Column title");
  await titleInput.fill("Persisted Column");
  await titleInput.blur();

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Persisted card");
  await firstColumn.getByRole("button", { name: /^add card$/i }).click();
  await expect(firstColumn.getByText("Persisted card")).toBeVisible();

  const cardToDelete = firstColumn.getByTestId("card-card-2");
  const cardTitle = await cardToDelete.locator("h4").innerText();
  await cardToDelete.getByRole("button", { name: /^delete/i }).click();
  await expect(firstColumn.getByText(cardTitle)).not.toBeVisible();

  await page.reload();

  const reloadedColumn = page.locator('[data-testid^="column-"]').first();
  await expect(reloadedColumn.getByLabel("Column title")).toHaveValue(
    "Persisted Column"
  );
  await expect(reloadedColumn.getByText("Persisted card")).toBeVisible();
  await expect(reloadedColumn.getByText(cardTitle)).not.toBeVisible();
});
