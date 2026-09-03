import { expect, test } from "@playwright/test"

test("renders a semantic Korean root shell when visiting the application", async ({
  page,
}, testInfo) => {
  // Given: the application server is available through Playwright's web server.

  // When: a visitor opens the root route.
  const response = await page.goto("/")

  // Then: the document exposes Korean semantics and one primary application landmark.
  expect(response?.ok()).toBe(true)
  await expect(page.locator("html")).toHaveAttribute("lang", "ko")
  await expect(page.getByRole("main")).toHaveCount(1)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  const screenshotPath = testInfo.outputPath("root-shell.png")
  await page.screenshot({ fullPage: true, path: screenshotPath })
  await testInfo.attach("root-shell", { contentType: "image/png", path: screenshotPath })
})
