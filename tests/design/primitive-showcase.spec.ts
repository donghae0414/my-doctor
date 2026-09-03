// allow: SIZE_OK — one transactional showcase publisher must atomically verify and replace its full capture manifest.
import { execFile } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import {
  assertAttachmentStatusGeometry,
  assertKoreanSemanticWrapping,
  assertSourceTitleWrapping,
} from "./primitive-showcase-layout"
import {
  type PrimitiveShowcaseCaptureCase,
  primitiveShowcaseSourcePaths,
  primitiveShowcaseThemes,
  primitiveShowcaseViewports,
  primitiveShowcaseZoomLevels,
} from "./primitive-showcase-sources"

const execFileAsync = promisify(execFile)
const evidenceRoot = resolve(".omo/evidence/task-7-postpartum-medical-chat")
const acceptedRoot = resolve(evidenceRoot, "accepted")
test.setTimeout(120_000)

async function hashFile(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
}

async function hashSources(): Promise<string> {
  const hash = createHash("sha256")
  for (const path of primitiveShowcaseSourcePaths) hash.update(path).update(await readFile(path))
  return hash.digest("hex")
}

async function configureViewport(
  page: import("@playwright/test").Page,
  capture: PrimitiveShowcaseCaptureCase,
) {
  const scale = capture.zoomPercent / 100
  const cssWidth = Math.ceil(capture.width / scale)
  await page.setViewportSize({ height: Math.ceil(900 / scale), width: cssWidth })
  const viewportWidths = await page.evaluate(() => [
    window.innerWidth,
    document.documentElement.clientWidth,
  ])
  expect(viewportWidths).toEqual([cssWidth, cssWidth])
}

async function assertPhraseIntegrity(page: import("@playwright/test").Page) {
  const phrases = page.locator("[data-keep-phrase]")
  expect(await phrases.count()).toBe(6)
  const fragmented = await phrases.evaluateAll((elements) =>
    elements.flatMap((element, index) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
      return lines.size > 1 ? [{ index, lines: lines.size }] : []
    }),
  )
  expect(fragmented).toEqual([])
}

async function assertControlGeometry(page: import("@playwright/test").Page) {
  const controls = page.locator("button, a[href], textarea")
  const defects = await controls.evaluateAll((elements) => {
    const visible = elements.filter((element) => {
      const style = getComputedStyle(element)
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getClientRects().length > 0
      )
    })
    const geometry = visible.map((element, index) => {
      const rect = element.getBoundingClientRect()
      return {
        bottom: rect.bottom,
        height: element instanceof HTMLElement ? element.offsetHeight : rect.height,
        index,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: element instanceof HTMLElement ? element.offsetWidth : rect.width,
      }
    })
    const documentWidth = document.documentElement.clientWidth
    const invalid = geometry.filter(
      ({ height, left, right, width }) =>
        height < 44 || width < 44 || left < 0 || right > documentWidth + 1,
    )
    const overlaps: Array<readonly [number, number]> = []
    for (const current of geometry) {
      for (const candidate of geometry.slice(current.index + 1)) {
        const overlapWidth =
          Math.min(current.right, candidate.right) - Math.max(current.left, candidate.left)
        const overlapHeight =
          Math.min(current.bottom, candidate.bottom) - Math.max(current.top, candidate.top)
        if (overlapWidth > 1 && overlapHeight > 1) overlaps.push([current.index, candidate.index])
      }
    }
    return { invalid, overlaps }
  })
  expect(defects).toEqual({ invalid: [], overlaps: [] })
}

async function assertTextAndDocumentGeometry(page: import("@playwright/test").Page) {
  const defects = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-testid='primitive-showcase']")
    if (root === null) return [{ kind: "missing-root" }]
    const documentWidth = document.documentElement.clientWidth
    const documentOverflow = document.documentElement.scrollWidth > documentWidth
    const detached = [...root.querySelectorAll<HTMLElement>("h1,h2,p,figcaption,[role='status']")]
      .filter((element) => element.getClientRects().length > 0)
      .flatMap((element, index) => {
        const rect = element.getBoundingClientRect()
        return rect.left < 0 || rect.right > documentWidth + 1
          ? [{ index, kind: "detached-label" }]
          : []
      })
    return documentOverflow ? [{ kind: "document-overflow" }, ...detached] : detached
  })
  expect(defects).toEqual([])
}

async function assertKeyboardOrder(page: import("@playwright/test").Page) {
  const controls = page.locator("button:not(:disabled), a[href], textarea:not(:disabled)")
  const count = await controls.evaluateAll((elements) => {
    let index = 0
    for (const element of elements) {
      if (element.getClientRects().length === 0) continue
      element.setAttribute("data-tab-order", String(index))
      index += 1
    }
    return index
  })
  await page.getByTestId("primitive-showcase").click({ position: { x: 1, y: 1 } })
  const visited: string[] = []
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Tab")
    visited.push(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-tab-order") ?? "missing",
      ),
    )
  }
  expect(visited).toEqual(Array.from({ length: count }, (_, index) => String(index)))
}

async function assertAttachmentColumns(
  page: import("@playwright/test").Page,
  capture: PrimitiveShowcaseCaptureCase,
) {
  const topRowCount = await page
    .getByTestId("attachment-grid")
    .locator("figure")
    .evaluateAll((figures) => {
      const firstTop = figures[0]?.getBoundingClientRect().top
      return figures.filter(
        (figure) => Math.abs(figure.getBoundingClientRect().top - (firstTop ?? 0)) < 1,
      ).length
    })
  const cssWidth = Math.ceil(capture.width / (capture.zoomPercent / 100))
  const expected = cssWidth < 320 ? 1 : cssWidth >= 1280 ? 4 : 2
  expect(topRowCount, JSON.stringify(capture)).toBe(expected)
}

async function assertHarnessPreventsSystemSleep() {
  if (process.platform !== "darwin") return
  const { stdout } = await execFileAsync("pmset", ["-g", "assertions"])
  expect(stdout).toMatch(/caffeinate.*PreventUserIdleSystemSleep/u)
}

async function exerciseInteractiveStates(page: import("@playwright/test").Page) {
  await page.goto("/primitive-showcase-dev?theme=light")
  const trigger = page.getByRole("button", { name: "출처 2개 보기" })
  await trigger.click()
  await expect(page.getByRole("link")).toHaveCount(0)
  await trigger.click()
  await expect(page.getByRole("link")).toHaveCount(2)
  await expect(page.locator("button:disabled")).toHaveCount(3)
  await expect(page.locator("svg.animate-spin")).toHaveCount(2)
  await page.getByRole("button", { name: /산후회복기록-1\.jpg 제거/u }).click()
  await expect(page.getByTestId("attachment-grid").locator("figure")).toHaveCount(3)
}

async function verifyReducedMotion(page: import("@playwright/test").Page) {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/primitive-showcase-dev?theme=light")
  const animationNames = await page
    .locator("article, figure, svg.animate-spin")
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName))
  expect(new Set(animationNames)).toEqual(new Set(["none"]))
}

test("publishes one manifest-bound normal and 200 percent capture matrix", async ({ page }) => {
  const stagingRoot = resolve(evidenceRoot, `.accepted-${randomUUID()}`)
  const stagingScreenshots = resolve(stagingRoot, "screenshots")
  const backupRoot = resolve(evidenceRoot, `.accepted-backup-${randomUUID()}`)
  const sourceHashBefore = await hashSources()
  await mkdir(stagingScreenshots, { recursive: true })
  const captures: Array<Record<string, string | number>> = []

  try {
    await assertHarnessPreventsSystemSleep()
    await exerciseInteractiveStates(page)
    await verifyReducedMotion(page)

    for (const theme of primitiveShowcaseThemes) {
      for (const width of primitiveShowcaseViewports) {
        for (const zoomPercent of primitiveShowcaseZoomLevels) {
          const capture = { theme, width, zoomPercent } satisfies PrimitiveShowcaseCaptureCase
          const surface = await page.context().newPage()
          await configureViewport(surface, capture)
          await surface.goto(`/primitive-showcase-dev?theme=${theme}`)
          await expect(surface.getByTestId("primitive-showcase")).toBeVisible()
          await expect(surface.getByTestId("attachment-grid").locator("figure")).toHaveCount(4)
          await assertPhraseIntegrity(surface)
          await assertKoreanSemanticWrapping(surface)
          await assertAttachmentStatusGeometry(surface)
          await assertSourceTitleWrapping(surface)
          await assertControlGeometry(surface)
          await assertTextAndDocumentGeometry(surface)
          await assertAttachmentColumns(surface, capture)
          await assertKeyboardOrder(surface)
          await surface.evaluate(() => window.scrollTo(0, 0))
          await assertControlGeometry(surface)
          await assertTextAndDocumentGeometry(surface)
          const accessibility = await new AxeBuilder({ page: surface }).analyze()
          expect(accessibility.violations).toEqual([])

          const name = `${theme}-${width}-zoom-${zoomPercent}.png`
          const screenshotPath = resolve(stagingScreenshots, name)
          await surface.screenshot({ fullPage: true, path: screenshotPath })
          if (zoomPercent === 200)
            await execFileAsync("sips", ["--resampleWidth", String(width), screenshotPath])
          expect((await stat(screenshotPath)).size).toBeGreaterThan(10_000)
          captures.push({
            axeViolations: accessibility.violations.length,
            path: `screenshots/${name}`,
            theme,
            width,
            zoomPercent,
          })
        }
      }
    }

    await rm("app/primitive-showcase-dev", { force: true, recursive: true })
    expect(await hashSources()).toBe(sourceHashBefore)
    const reportPath = resolve(stagingRoot, "report.json")
    await writeFile(
      reportPath,
      `${JSON.stringify({ captures, generatedAt: new Date().toISOString() }, null, 2)}\n`,
    )
    const screenshotHashes = Object.fromEntries(
      await Promise.all(
        captures.map(async ({ path }) => {
          const screenshotPath = String(path)
          return [screenshotPath, await hashFile(resolve(stagingRoot, screenshotPath))] as const
        }),
      ),
    )
    const manifest = {
      algorithm: "sha256",
      report: { hash: await hashFile(reportPath), path: "report.json" },
      screenshots: screenshotHashes,
      source: {
        files: primitiveShowcaseSourcePaths,
        hash: sourceHashBefore,
        requiredAbsentPaths: ["app/__primitive-showcase", "app/primitive-showcase-dev"],
      },
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
