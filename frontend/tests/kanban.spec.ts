import { expect, test } from "@playwright/test";
import { MockApi } from "./support/mockApi";

test.beforeEach(async ({ page }) => {
  await MockApi.install(page, { signedInAs: "user" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product Roadmap" })).toBeVisible();
});

const column = (page: import("@playwright/test").Page, index = 0) =>
  page.locator('[data-testid^="column-"]').nth(index);

test("loads the kanban board", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await column(page).getByRole("button", { name: /add a card/i }).click();
  await column(page).getByPlaceholder("Card title").fill("Playwright card");
  await column(page).getByPlaceholder("Details").fill("Added via e2e.");
  await column(page).getByRole("button", { name: /^add card$/i }).click();
  await expect(column(page).getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, { steps: 12 });
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("edits a card's priority and due date", async ({ page }) => {
  await page.getByText("Gather customer signals").click();
  const dialog = page.getByRole("dialog", { name: "Edit card" });
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByLabel("Due date").fill("2030-06-15");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();

  const card = page.getByTestId("card-card-2");
  await expect(card.getByTestId("priority-badge")).toHaveText("high");
  await expect(card.getByTestId("due-badge")).toContainText("2030-06-15");

  await page.reload();
  await expect(page.getByTestId("card-card-2").getByTestId("priority-badge")).toHaveText("high");
});

test("filters cards with search", async ({ page }) => {
  await page.getByRole("searchbox", { name: /search cards/i }).fill("analytics");
  await expect(page.getByText("Prototype analytics view")).toBeVisible();
  await expect(page.getByText("Align roadmap themes")).not.toBeVisible();
  await expect(column(page).getByText(/no matching cards/i)).toBeVisible();
});

test("adds, reorders and deletes columns", async ({ page }) => {
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Column name").fill("Blocked");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(6);

  await column(page, 5).getByRole("button", { name: "Column actions" }).click();
  await page.getByRole("menuitem", { name: /move left/i }).click();
  await expect(column(page, 4).getByLabel("Column title")).toHaveValue("Blocked");

  await column(page, 0).getByRole("button", { name: "Column actions" }).click();
  await page.getByRole("menuitem", { name: /delete column/i }).click();
  await page
    .getByRole("dialog", { name: "Delete column" })
    .getByRole("button", { name: "Delete column" })
    .click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByText("Align roadmap themes")).not.toBeVisible();

  await page.reload();
  await expect(column(page, 0).getByLabel("Column title")).toHaveValue("Discovery");
});

test("chats with the assistant about the current board", async ({ page }) => {
  await page.getByLabel("Chat message").fill("summarize this board");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText("Mock reply to: summarize this board")).toBeVisible();
});
