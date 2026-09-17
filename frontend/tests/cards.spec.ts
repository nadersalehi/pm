import { expect, test, type Page } from "@playwright/test";
import { MockApi } from "./support/mockApi";

test.beforeEach(async ({ page }) => {
  await MockApi.install(page, { signedInAs: "user" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product Roadmap" })).toBeVisible();
});

const openCard = async (page: Page, title: string) => {
  await page.getByText(title).click();
  return page.getByRole("dialog", { name: "Edit card" });
};

test("labels a card and filters the board by label", async ({ page }) => {
  const dialog = await openCard(page, "Gather customer signals");
  await dialog.getByRole("button", { name: "Research" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("card-card-2").getByText("Research")).toBeVisible();

  await page.getByRole("button", { name: "Filter cards" }).click();
  await page.getByRole("group", { name: "Card filters" }).getByRole("checkbox", { name: "Research" }).check();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Filter cards (1 active)" })).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(6);

  await page.reload();
  await expect(page.getByTestId("card-card-2").getByText("Research")).toBeVisible();
});

test("manages board labels", async ({ page }) => {
  await page.getByRole("button", { name: "Manage labels" }).click();
  const dialog = page.getByRole("dialog", { name: "Labels" });
  await dialog.getByLabel("New label name").fill("Blocked");
  await dialog.getByLabel("New label color").selectOption("navy");
  await dialog.getByRole("button", { name: "Add label" }).click();
  await expect(dialog.getByLabel("Name for Blocked")).toBeVisible();

  await dialog.getByLabel("New label name").fill("design");
  await dialog.getByRole("button", { name: "Add label" }).click();
  await expect(dialog.getByText(/already exists/)).toBeVisible();

  await dialog.getByRole("button", { name: "Delete label Design" }).click();
  await expect(dialog.getByLabel("Name for Design")).not.toBeVisible();
});

test("tracks checklist progress on the card", async ({ page }) => {
  const dialog = await openCard(page, "Prototype analytics view");
  const input = dialog.getByLabel("New checklist item");
  await input.fill("Sketch layout");
  await input.press("Enter");
  await input.fill("Review with team");
  await input.press("Enter");
  await dialog.getByRole("checkbox", { name: "Sketch layout" }).check();

  const progress = page.getByTestId("card-card-3").getByTestId("checklist-progress");
  await expect(progress).toHaveText("1/2");
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await expect(page.getByTestId("card-card-3").getByTestId("checklist-progress")).toHaveText("1/2");
});

test("opens a card with Enter without saving it", async ({ page }) => {
  await page.getByTestId("card-card-1").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Edit card" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("moves a card to the next column with the keyboard", async ({ page }) => {
  const discovery = page.getByTestId("column-col-discovery");
  const announcer = page.locator("[aria-live]").filter({ hasText: "Align roadmap themes" });
  await page.getByTestId("card-card-1").focus();
  await page.keyboard.press("Space");
  await expect(announcer).toContainText("is over the Backlog column");
  await page.keyboard.press("ArrowRight");
  await expect(announcer).toContainText("is over the Discovery column");
  await page.keyboard.press("Space");
  await expect(announcer).toContainText("was dropped in the Discovery column");
  await expect(discovery.getByTestId("card-card-1")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("column-col-discovery").getByTestId("card-card-1")).toBeVisible();
});
