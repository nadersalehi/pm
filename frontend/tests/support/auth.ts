import type { Page } from "@playwright/test";

export const mockAuthenticated = async (page: Page, username = "user") => {
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 200, json: { username } })
  );
  await page.route("**/api/logout", (route) =>
    route.fulfill({ status: 200, json: { message: "logged out" } })
  );
};

export const mockUnauthenticated = async (page: Page) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { detail: "Not authenticated" } })
  );
};

export const mockLogin = async (
  page: Page,
  credentials: { username: string; password: string }
) => {
  await page.route("**/api/login", async (route) => {
    const body = route.request().postDataJSON() as {
      username: string;
      password: string;
    };
    if (
      body.username === credentials.username &&
      body.password === credentials.password
    ) {
      await route.fulfill({ status: 200, json: { username: body.username } });
    } else {
      await route.fulfill({
        status: 401,
        json: { detail: "Invalid credentials" },
      });
    }
  });
};
