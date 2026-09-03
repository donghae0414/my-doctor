import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

import { auditTask14Surface } from "./task14-surface-audit"

export const CAPTURE_ROOT = resolve(".omo/evidence/task-14-postpartum-medical-chat/visual-captures")
export const WIDTHS = [375, 768, 1280] as const
export const THEMES = ["light", "dark"] as const
export const MOTION_MODES = ["normal", "reduced"] as const

export type Theme = (typeof THEMES)[number]
export type MotionMode = (typeof MOTION_MODES)[number]

export async function prepareCaptureRoot(): Promise<void> {
  await mkdir(CAPTURE_ROOT, { recursive: true })
}

export async function applyTheme(page: Page, theme: Theme): Promise<void> {
  const setTheme = (selectedTheme: Theme) => {
    document.documentElement.classList.toggle("dark", selectedTheme === "dark")
  }
  await page.addInitScript(setTheme, theme)
  await page.evaluate(setTheme, theme)
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/u : /^(?!.*dark)/u)
}

export async function unlock(page: Page): Promise<void> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/auth/unlock") && candidate.request().method() === "POST",
  )
  await page.getByRole("textbox", { name: "접근 코드" }).fill("1234")
  await page.getByRole("button", { name: "접근 코드 제출" }).click()
  expect((await response).status()).toBe(204)
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
}

export async function send(page: Page, text: string): Promise<void> {
  const response = page.waitForResponse(
    (candidate) => candidate.url().endsWith("/api/chat") && candidate.request().method() === "POST",
  )
  await page.getByRole("textbox", { name: "의료 질문" }).fill(text)
  await page.getByRole("button", { name: "질문 보내기" }).click()
  expect((await response).status()).toBe(200)
}

export async function assertSurface(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.allSettled(
      document.documentElement
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    )
  })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  const geometry = await page.evaluate(auditTask14Surface)
  expect(geometry.composerGeometry?.top ?? 0).toBeGreaterThanOrEqual(-1)
  expect(
    geometry.composerGeometry?.bottom ?? 0,
    JSON.stringify(geometry.composerGeometry),
  ).toBeLessThanOrEqual((geometry.composerGeometry?.viewportHeight ?? 0) + 1)
  expect(geometry.documentFits).toBe(true)
  expect(geometry.footerVisibilityFailures).toEqual([])
  expect(geometry.headerVisibilityFailures).toEqual([])
  expect(geometry.statusVisibilityFailures).toEqual([])
  expect(geometry.phraseFragments).toEqual([])
  expect(geometry.undersizedTargets).toEqual([])
  expect(geometry.scrollOwners).toBe((await page.locator("[data-chat-state]").count()) > 0 ? 1 : 0)
}

export async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: resolve(CAPTURE_ROOT, name) })
}
