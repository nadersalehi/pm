import { expect, test } from "@playwright/test";

test("labels and checklists persist against the real backend", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(`details_${suffix}`);
  await page.getByLabel("Password").fill("details-password");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByRole("heading", { name: "My First Board" })).toBeVisible();

  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Launch checklist");
  await firstColumn.getByRole("button", { name: /^add card$/i }).click();
  await expect(firstColumn.getByText("Launch checklist")).toBeVisible();

  await page.getByRole("button", { name: "Manage labels" }).click();
  const labels = page.getByRole("dialog", { name: "Labels" });
  await labels.getByLabel("New label name").fill("Release");
  await labels.getByLabel("New label color").selectOption("purple");
  await labels.getByRole("button", { name: "Add label" }).click();
  await expect(labels.getByLabel("Name for Release")).toBeVisible();
  await labels.getByRole("button", { name: "Close" }).click();

  await firstColumn.getByText("Launch checklist").click();
  const dialog = page.getByRole("dialog", { name: "Edit card" });
  const item = dialog.getByLabel("New checklist item");
  await item.fill("Write release notes");
  await item.press("Enter");
  await expect(dialog.getByText("Write release notes")).toBeVisible();
  await item.fill("Tag the build");
  await item.press("Enter");
  await expect(dialog.getByText("Tag the build")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Write release notes" }).check();
  await dialog.getByRole("button", { name: "Release", exact: true }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();

  await page.reload();
  const card = page.locator('[data-testid^="card-"]').filter({ hasText: "Launch checklist" });
  await expect(card.getByText("Release")).toBeVisible();
  await expect(card.getByTestId("checklist-progress")).toHaveText("1/2");

  await page.getByRole("button", { name: "Filter cards" }).click();
  await page.getByRole("group", { name: "Card filters" }).getByRole("checkbox", { name: "Release" }).check();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(1);
});
