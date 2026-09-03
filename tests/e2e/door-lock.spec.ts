import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const evidenceRoot = resolve(".omo/evidence/task-9-postpartum-medical-chat")
const acceptedRoot = resolve(evidenceRoot, "accepted")
const genericError = "접근 코드를 확인해 주세요."

async function openLocked(page: import("@playwright/test").Page) {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "접근 코드를 입력해 주세요" })).toBeVisible()
}

async function enterWithKeypad(page: import("@playwright/test").Page, code: string) {
  for (const digit of code) await page.getByRole("button", { name: digit, exact: true }).click()
}

async function assertLockGeometry(page: import("@playwright/test").Page) {
  const geometry = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    targets: [...document.querySelectorAll("button, input")].map((element) => {
      const rectangle = element.getBoundingClientRect()
      return { height: rectangle.height, width: rectangle.width }
    }),
  }))
  expect(geometry.horizontalOverflow).toBe(false)
  for (const target of geometry.targets) {
    expect(target.height).toBeGreaterThanOrEqual(44)
    expect(target.width).toBeGreaterThanOrEqual(44)
  }
  const heading = page.getByRole("heading", { name: "접근 코드를 입력해 주세요" })
  await expect(heading).toBeInViewport()
  expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
}

async function sha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

test.describe.configure({ mode: "serial" })

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies()
  await page.setViewportSize({ height: 812, width: 375 })
})

test("unlocks by touch and keyboard, then retains the session across refresh", async ({ context, page }) => {
  await openLocked(page)
  await enterWithKeypad(page, "1234")
  await page.getByRole("button", { name: "접근 코드 제출" }).click()
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()

  await context.clearCookies()
  await page.reload()
  const input = page.getByRole("textbox", { name: "접근 코드" })
  await input.pressSequentially("12345")
  await input.press("Backspace")
  await input.press("Enter")
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
})

test("keeps empty, wrong, overlong, and twenty consecutive failures generic without lockout", async ({ page }) => {
  const statuses: number[] = []
  page.on("response", (response) => {
    if (response.url().endsWith("/api/auth/unlock")) statuses.push(response.status())
  })
  await openLocked(page)
  const input = page.getByRole("textbox", { name: "접근 코드" })
  const errorMessage = page.locator("#door-lock-message[role='alert']")

  await input.press("Enter")
  await expect(errorMessage).toHaveText(genericError)

  await input.pressSequentially("9999")
  await input.press("Enter")
  await expect(errorMessage).toHaveText(genericError)
  const animation = await page.getByTestId("masked-slots").evaluate((element) => {
    const errorAnimations = element
      .getAnimations()
      .filter(
        (candidate) =>
          candidate instanceof CSSAnimation && candidate.animationName === "door-lock-error",
      )
    const timing = errorAnimations[0]?.effect?.getComputedTiming()
    return {
      count: errorAnimations.length,
      duration: typeof timing?.duration === "number" ? timing.duration : null,
      iterations: timing?.iterations ?? null,
    }
  })
  expect(animation).toEqual({ count: 1, duration: 450, iterations: 1 })

  await input.fill("1234567890123")
  await input.press("Enter")
  await expect(errorMessage).toHaveText(genericError)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await input.fill("9999")
    await input.press("Enter")
    await expect(errorMessage).toHaveText(genericError)
  }
  expect(statuses).not.toContain(429)
  expect(statuses.filter((status) => status === 401)).toHaveLength(22)

  await input.fill("1234")
  await input.press("#")
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
  expect(statuses.at(-1)).toBe(204)
})

test("publishes transactional mobile light-dark CJK and accessibility evidence", async ({ browser }) => {
  const stagingRoot = resolve(evidenceRoot, `.accepted-${randomUUID()}`)
  const backupRoot = resolve(evidenceRoot, `.accepted-backup-${randomUUID()}`)
  const screenshotsRoot = resolve(stagingRoot, "screenshots")
  await mkdir(screenshotsRoot, { recursive: true })
  const artifacts: Array<{ readonly axeViolations: number; readonly path: string; readonly sha256: string; readonly theme: string }> = []

  try {
    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport: { height: 812, width: 375 } })
      const surface = await context.newPage()
      await openLocked(surface)
      if (theme === "dark") await surface.locator("html").evaluate((element) => element.classList.add("dark"))
      await assertLockGeometry(surface)
      const accessibility = await new AxeBuilder({ page: surface }).analyze()
      expect(accessibility.violations).toEqual([])
      const relativePath = `screenshots/door-lock-375-${theme}.png`
      const path = resolve(stagingRoot, relativePath)
      await surface.screenshot({ path })
      artifacts.push({
        axeViolations: accessibility.violations.length,
        path: relativePath,
        sha256: await sha256(path),
        theme,
      })
      await context.close()
    }

    const reducedContext = await browser.newContext({ reducedMotion: "reduce", viewport: { height: 812, width: 375 } })
    const reducedPage = await reducedContext.newPage()
    await openLocked(reducedPage)
    await reducedPage.getByRole("textbox", { name: "접근 코드" }).press("Enter")
    expect(
      await reducedPage.getByTestId("masked-slots").evaluate((element) =>
        element
          .getAnimations()
          .filter(
            (candidate) =>
              candidate instanceof CSSAnimation && candidate.animationName === "door-lock-error",
          ).length,
      ),
    ).toBe(0)
    await reducedContext.close()

    const doneClaim = {
      claim: "Todo 9 door lock is complete",
      evidence: {
        accessibility: "axe clean in light and dark at 375x812",
        authentication: "touch and keyboard unlock; refresh retains session",
        failures: "empty, wrong, overlong, and 20 consecutive failures remain generic with no 429 or lockout",
        motion: "one 450ms iteration; reduced motion removes shake",
      },
      status: "PASS",
      task: 9,
    }
    const doneClaimPath = resolve(stagingRoot, "DoneClaim.json")
    await writeFile(doneClaimPath, `${JSON.stringify(doneClaim, null, 2)}\n`)
    const manifest = {
      algorithm: "sha256",
      artifacts,
      cleanup: "isolated browser contexts closed; staging removed on failure",
      doneClaim: { path: "DoneClaim.json", sha256: await sha256(doneClaimPath) },
      generatedAt: new Date().toISOString(),
      task: 9,
    }
    await writeFile(resolve(stagingRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)

    await rm(backupRoot, { force: true, recursive: true })
    try {
      await rename(acceptedRoot, backupRoot)
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
    }
    await rename(stagingRoot, acceptedRoot)
    await rm(backupRoot, { force: true, recursive: true })
  } catch (error) {
    await rm(stagingRoot, { force: true, recursive: true })
    throw error
  }
})
