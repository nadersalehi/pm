import { expect, test } from "@playwright/test";
import { MockApi } from "./support/mockApi";

test.beforeEach(async ({ page }) => {
  await MockApi.install(page, { signedInAs: "user" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product Roadmap" })).toBeVisible();
});

test("creates a board, switches between boards, and remembers the last one", async ({ page }) => {
  await page.getByRole("button", { name: "Switch board" }).click();
  await page.getByRole("menuitem", { name: /new board/i }).click();
  const dialog = page.getByRole("dialog", { name: "New board" });
  await dialog.getByLabel("Board name").fill("Hiring");
  await dialog.getByLabel("Description").fill("Q4 hiring pipeline");
  await dialog.getByRole("button", { name: "Create board" }).click();

  await expect(page.getByRole("heading", { name: "Hiring" })).toBeVisible();
  await expect(page.getByText(/Q4 hiring pipeline/)).toBeVisible();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Hiring" })).toBeVisible();

  await page.getByRole("button", { name: "Switch board" }).click();
  await page.getByRole("menuitemradio", { name: /product roadmap/i }).click();
  await expect(page.getByRole("heading", { name: "Product Roadmap" })).toBeVisible();
  await expect(page.getByText("Align roadmap themes")).toBeVisible();
});

test("renames and deletes a board", async ({ page }) => {
  await page.getByRole("button", { name: "Board settings" }).click();
  await page.getByLabel("Board name").fill("Roadmap 2027");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Roadmap 2027" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch board" })).toHaveText(/Roadmap 2027/);

  await page.getByRole("button", { name: "Board settings" }).click();
  await page.getByRole("button", { name: "Delete board" }).click();
  await page
    .getByRole("dialog", { name: "Delete board" })
    .getByRole("button", { name: "Delete board" })
    .click();
  await expect(page.getByRole("heading", { name: /no boards yet/i })).toBeVisible();

  await page.getByRole("button", { name: /create a board/i }).click();
  await page.getByLabel("Board name").fill("Fresh start");
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByRole("heading", { name: "Fresh start" })).toBeVisible();
});
