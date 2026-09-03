// allow: SIZE_OK — one transactional live-reference state machine must publish or roll back its six-capture set atomically.
import { createHash, randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"
import { expect, test } from "@playwright/test"
import contract from "./theme-contract.json"

type Mode = "light" | "dark"

const SOURCE_URL = contract.source.url
const EVIDENCE_ROOT = resolve(".omo/evidence/task-2-postpartum-medical-chat")
const SCREENSHOT_ROOT = resolve(EVIDENCE_ROOT, "screenshots")
const representativeButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Share", exact: true }).first()
const STYLE_PROPERTIES = [
  "color",
  "backgroundColor",
  "borderColor",
  "borderRadius",
  "boxShadow",
  "outlineColor",
  "outlineStyle",
  "outlineWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "padding",
  "gap",
  "minWidth",
  "minHeight",
  "transitionProperty",
  "transitionDuration",
  "transitionTimingFunction",
  "transform",
  "opacity",
] as const

function parseExportBlock(css: string, selector: ":root" | ".dark") {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const block = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!block?.[1]) throw new Error(`Missing ${selector} block in live export`)
  return Object.fromEntries(
    [...block[1].matchAll(/^\s*(--[\w-]+):\s*(.+);$/gmu)].map((match) => [match[1], match[2]]),
  )
}

async function waitForReference(page: import("@playwright/test").Page) {
  await page.getByText(contract.source.name, { exact: true }).first().waitFor()
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
  })
}

type ChartGeometry = {
  pathLength: number
  drawnLength: number
  hiddenLength: number
}

async function waitForChartsSettled(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      new Promise<ChartGeometry[]>((resolveSettled, rejectSettled) => {
        const inspect = () => {
          const paths = [...document.querySelectorAll<SVGPathElement>("path.recharts-line-curve")]
          const geometry = paths.map((path) => {
            const values = (path.getAttribute("stroke-dasharray") ?? "")
              .match(/[\d.]+/gu)
              ?.map(Number) ?? [Number.POSITIVE_INFINITY, 0]
            return {
              pathLength: path.getTotalLength(),
              drawnLength: values[0] ?? Number.POSITIVE_INFINITY,
              hiddenLength: values[1] ?? 0,
            }
          })
          return {
            geometry,
            settled:
              geometry.length > 0 &&
              geometry.every(
                ({ pathLength, drawnLength, hiddenLength }) =>
                  drawnLength >= pathLength - 0.5 && hiddenLength <= 0.5,
              ),
          }
        }
        const finishIfSettled = () => {
          const result = inspect()
          if (!result.settled) return
          observer.disconnect()
          clearTimeout(watchdog)
          resolveSettled(result.geometry)
        }
        const observer = new MutationObserver(finishIfSettled)
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["d", "stroke-dasharray"],
          childList: true,
          subtree: true,
        })
        const watchdog = setTimeout(() => {
          observer.disconnect()
          rejectSettled(
            new Error(`Charts did not reach settled reveal geometry: ${JSON.stringify(inspect())}`),
          )
        }, 5_000)
        finishIfSettled()
      }),
  )
}

async function dismissPromotion(page: import("@playwright/test").Page) {
  const promotion = page.getByRole("dialog").filter({ hasText: "Apply your theme to a premium" })
  if (await promotion.isVisible()) {
    await promotion.getByRole("button", { name: "Close" }).click()
    await promotion.waitFor({ state: "hidden" })
  }
}

async function computedVariables(page: import("@playwright/test").Page, names: string[]) {
  return page.evaluate((variableNames) => {
    const style = getComputedStyle(document.documentElement)
    return Object.fromEntries(
      variableNames.map((name) => [name, style.getPropertyValue(name).trim()]),
    )
  }, names)
}

async function computedButtonStyle(button: import("@playwright/test").Locator) {
  return button.evaluate((element, properties) => {
    const style = getComputedStyle(element)
    const normalizeSubpixelNoise = (value: string) =>
      value.replace(/-?\d+\.\d+px/gu, (pixelValue) => {
        const numeric = Number.parseFloat(pixelValue)
        const integer = Math.round(numeric)
        return Math.abs(numeric - integer) < 0.001 ? `${integer}px` : pixelValue
      })
    return Object.fromEntries(
      properties.map((property) => [property, normalizeSubpixelNoise(style[property])]),
    )
  }, STYLE_PROPERTIES)
}

function withoutTransitionFields(style: Record<string, string>) {
  const copy = { ...style }
  delete copy["transitionProperty"]
  delete copy["transitionDuration"]
  delete copy["transitionTimingFunction"]
  return copy
}

async function armDocumentMouseSignal(
  page: import("@playwright/test").Page,
  button: import("@playwright/test").Locator,
  eventName: "mouseover" | "mousedown",
) {
  const signalKey = `${eventName}-${randomUUID()}`
  await button.evaluate(
    (element, { key, name }) => {
      type SignalStore = Map<string, Promise<void>>
      const root = globalThis as typeof globalThis & {
        __task2MouseSignals?: SignalStore
      }
      const store = root.__task2MouseSignals ?? new Map<string, Promise<void>>()
      root.__task2MouseSignals = store
      store.set(
        key,
        new Promise<void>((resolveSignal, rejectSignal) => {
          const onMouseEvent = (event: MouseEvent) => {
            if (
              (name === "mousedown" && event.button !== 0) ||
              !event.composedPath().includes(element)
            ) {
              return
            }
            document.removeEventListener(name, onMouseEvent, true)
            requestAnimationFrame(() => {
              clearTimeout(watchdog)
              resolveSignal()
            })
          }
          const watchdog = setTimeout(() => {
            document.removeEventListener(name, onMouseEvent, true)
            rejectSignal(new Error(`Timed out awaiting captured target ${name}`))
          }, 2_000)
          document.addEventListener(name, onMouseEvent, true)
        }),
      )
    },
    { key: signalKey, name: eventName },
  )

  return async () => {
    await page.evaluate(async (key) => {
      type SignalStore = Map<string, Promise<void>>
      const root = globalThis as typeof globalThis & {
        __task2MouseSignals?: SignalStore
      }
      const signal = root.__task2MouseSignals?.get(key)
      if (!signal) throw new Error(`Missing armed document mouse signal: ${key}`)
      try {
        await signal
      } finally {
        root.__task2MouseSignals?.delete(key)
      }
    }, signalKey)
  }
}

async function armDialogSignal(page: import("@playwright/test").Page, dialogText: string) {
  const signalKey = `dialog-${randomUUID()}`
  await page.evaluate(
    ({ key, text }) => {
      type SignalStore = Map<string, Promise<void>>
      const root = globalThis as typeof globalThis & {
        __task2DialogSignals?: SignalStore
      }
      const store = root.__task2DialogSignals ?? new Map<string, Promise<void>>()
      root.__task2DialogSignals = store
      store.set(
        key,
        new Promise<void>((resolveSignal, rejectSignal) => {
          const matches = () =>
            [...document.querySelectorAll('[role="dialog"]')].some((dialog) =>
              dialog.textContent?.includes(text),
            )
          const observer = new MutationObserver(() => {
            if (!matches()) return
            observer.disconnect()
            clearTimeout(watchdog)
            resolveSignal()
          })
          const watchdog = setTimeout(() => {
            observer.disconnect()
            rejectSignal(new Error(`Timed out awaiting dialog: ${text}`))
          }, 5_000)
          observer.observe(document.documentElement, { childList: true, subtree: true })
          if (matches()) {
            observer.disconnect()
            clearTimeout(watchdog)
            resolveSignal()
          }
        }),
      )
    },
    { key: signalKey, text: dialogText },
  )

  return async () => {
    await page.evaluate(async (key) => {
      type SignalStore = Map<string, Promise<void>>
      const root = globalThis as typeof globalThis & {
        __task2DialogSignals?: SignalStore
      }
      const signal = root.__task2DialogSignals?.get(key)
      if (!signal) throw new Error(`Missing armed dialog signal: ${key}`)
      try {
        await signal
      } finally {
        root.__task2DialogSignals?.delete(key)
      }
    }, signalKey)
  }
}

function publishCaptureSet(stagingRoot: string) {
  const artifactNames = [
    "screenshots",
    "playwright-capture-receipt.json",
    "accepted-hashes-green-concurrent-final.txt",
    "concurrent-summary-final.txt",
  ] as const
  const backupRoot = resolve(EVIDENCE_ROOT, `.capture-backup-${randomUUID()}`)
  mkdirSync(backupRoot, { recursive: true })

  try {
    for (const name of artifactNames) {
      const publicPath = resolve(EVIDENCE_ROOT, name)
      if (existsSync(publicPath)) renameSync(publicPath, resolve(backupRoot, name))
    }
    for (const name of artifactNames) {
      renameSync(resolve(stagingRoot, name), resolve(EVIDENCE_ROOT, name))
    }
    rmSync(backupRoot, { force: true, recursive: true })
  } catch (error) {
    for (const name of artifactNames) {
      rmSync(resolve(EVIDENCE_ROOT, name), { force: true, recursive: true })
      const backupPath = resolve(backupRoot, name)
      if (existsSync(backupPath)) renameSync(backupPath, resolve(EVIDENCE_ROOT, name))
    }
    rmSync(backupRoot, { force: true, recursive: true })
    throw error
  }
}

function assertPng(buffer: Buffer, width: number, height: number) {
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(buffer.readUInt32BE(16)).toBe(width)
  expect(buffer.readUInt32BE(20)).toBe(height)
}

test("live tweakcn export and computed theme match the recorded contract at every width and mode", async ({
  page,
}) => {
  test.setTimeout(180_000)

  await page.addInitScript(() => {
    const removePromotion = () => {
      for (const dialog of document.querySelectorAll('[role="dialog"]')) {
        if (dialog.textContent?.includes("Apply your theme to a premium")) dialog.remove()
      }
    }
    const observe = () => {
      removePromotion()
      const observer = new MutationObserver(removePromotion)
      observer.observe(document.documentElement, { childList: true, subtree: true })
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", observe, { once: true })
    } else {
      observe()
    }
  })

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" })
  await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded" })
  await waitForReference(page)
  await dismissPromotion(page)

  const awaitCodeDialog = await armDialogSignal(page, "Theme Code")
  const codeButton = page.getByRole("button", { name: "Code", exact: true })
  await codeButton.focus()
  await codeButton.press("Enter")
  await awaitCodeDialog()
  const codeDialog = page.getByRole("dialog").filter({ hasText: "Theme Code" })
  const exportedCss = await codeDialog.locator("pre").innerText()
  expect(parseExportBlock(exportedCss, ":root")).toEqual(contract.exported.light)
  expect(parseExportBlock(exportedCss, ".dark")).toEqual(contract.exported.dark)
  await codeDialog.getByRole("button", { name: "Close" }).click()
  await codeDialog.waitFor({ state: "hidden" })

  const runId = process.env["PLAYWRIGHT_RUN_ID"] ?? `task-2-${Date.now()}-${process.pid}`
  const stagingRoot = resolve(EVIDENCE_ROOT, "capture-staging", runId)
  const stagingScreenshots = resolve(stagingRoot, "screenshots")
  rmSync(stagingRoot, { force: true, recursive: true })
  mkdirSync(stagingScreenshots, { recursive: true })

  try {
    const captureReceipt: Array<{
      mode: Mode
      width: number
      path: string
      sha256: string
      capturedAt: string
      horizontalOverflow: boolean
      chartGeometry: ChartGeometry[]
    }> = []
    const designModifiedAt = statSync(resolve("DESIGN.md")).mtimeMs

    for (const mode of ["light", "dark"] as const) {
      for (const { width, height } of contract.viewports) {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ colorScheme: mode, reducedMotion: "no-preference" })
        await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded" })
        await waitForReference(page)

        const html = page.locator("html")
        const currentlyDark = (await html.getAttribute("class")) === "dark"
        if (currentlyDark !== (mode === "dark")) {
          const representative = representativeButton(page)
          const settled = representative.evaluate(
            (element) =>
              new Promise<void>((resolveTransition) => {
                element.addEventListener("transitionend", () => resolveTransition(), { once: true })
              }),
          )
          await page.locator('button[data-size="icon"]:visible').first().click()
          await settled
        }
        expect(await html.getAttribute("class")).toBe(mode === "dark" ? "dark" : null)
        expect(await computedVariables(page, Object.keys(contract.computed[mode]))).toEqual(
          contract.computed[mode],
        )

        const button = representativeButton(page)
        await button.scrollIntoViewIfNeeded()
        await page.mouse.move(0, 0)
        const nativeRest = await computedButtonStyle(button)
        expect(nativeRest["transitionDuration"]).toBe("0.15s")
        expect(nativeRest["transitionTimingFunction"]).toBe("cubic-bezier(0.4, 0, 0.2, 1)")

        const stateProbeStyle = await page.addStyleTag({
          content: "* { transition: none !important; animation: none !important; }",
        })
        expect(withoutTransitionFields(await computedButtonStyle(button))).toEqual(
          withoutTransitionFields(contract.representativeButton[mode].rest),
        )
        const initialBox = await button.boundingBox()
        expect(initialBox).not.toBeNull()
        if (!initialBox) throw new Error("Representative button lost its initial layout box")
        const awaitInitialHover = await armDocumentMouseSignal(page, button, "mouseover")
        await page.mouse.move(
          initialBox.x + initialBox.width / 2,
          initialBox.y + initialBox.height / 2,
        )
        await awaitInitialHover()
        expect(withoutTransitionFields(await computedButtonStyle(button))).toEqual(
          withoutTransitionFields(contract.representativeButton[mode].hover),
        )
        await page.mouse.move(0, 0)
        await page.keyboard.press("Tab")
        await button.focus()
        expect(withoutTransitionFields(await computedButtonStyle(button))).toEqual(
          withoutTransitionFields(contract.representativeButton[mode].focus),
        )
        await button.evaluate((element) => {
          element.blur()
          element.setAttribute("data-task-2-active-probe", "true")
        })
        if (process.env["TASK_2_MUTATE_ACTIVE"] === "1") {
          await page.addStyleTag({
            content:
              'button[data-task-2-active-probe="true"]:active { background-color: var(--background) !important; color: var(--foreground) !important; }',
          })
        }
        await page.mouse.move(0, 0)
        const hoverBox = await button.boundingBox()
        expect(hoverBox).not.toBeNull()
        if (!hoverBox) throw new Error("Representative button lost its hover layout box")
        const awaitActiveHover = await armDocumentMouseSignal(page, button, "mouseover")
        await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2)
        await awaitActiveHover()
        expect(withoutTransitionFields(await computedButtonStyle(button))).toEqual(
          withoutTransitionFields(contract.representativeButton[mode].hover),
        )
        const box = await button.boundingBox()
        expect(box).not.toBeNull()
        if (!box) throw new Error("Representative button lost its settled layout box")
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        expect(
          await button.evaluate((element, point) => {
            const hit = document.elementFromPoint(point.x, point.y)
            return hit !== null && (hit === element || element.contains(hit))
          }, center),
        ).toBe(true)
        const awaitMouseDown = await armDocumentMouseSignal(page, button, "mousedown")
        await page.mouse.move(center.x, center.y)
        await page.mouse.down()
        await awaitMouseDown()
        try {
          expect(withoutTransitionFields(await computedButtonStyle(button))).toEqual(
            withoutTransitionFields(contract.representativeButton[mode].active),
          )
        } finally {
          await page.mouse.move(0, 0)
          await page.mouse.up()
        }
        await stateProbeStyle.evaluate((element) => element.parentNode?.removeChild(element))
        await page.evaluate(async () => {
          await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()))
          const finiteAnimations = document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
            )
          await Promise.all(
            finiteAnimations.map((animation) => animation.finished.catch(() => undefined)),
          )
        })
        const chartGeometry = await waitForChartsSettled(page)
        if (process.env["TASK_2_MUTATE_CHART_UNSETTLED"] === "1") {
          await page
            .locator("path.recharts-line-curve")
            .first()
            .evaluate((path) => {
              const forceUnsettled = () => {
                if (path.getAttribute("stroke-dasharray") !== "1px 9999px") {
                  path.setAttribute("stroke-dasharray", "1px 9999px")
                }
              }
              const observer = new MutationObserver(forceUnsettled)
              observer.observe(path, {
                attributes: true,
                attributeFilter: ["stroke-dasharray"],
              })
              forceUnsettled()
            })
          await waitForChartsSettled(page)
        }

        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
        expect(horizontalOverflow).toBe(false)
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          scrollTo(0, 0)
        })
        await page.mouse.move(0, 0)
        await dismissPromotion(page)

        const fileName = `tweakcn-${width}-${mode}.png`
        const screenshotPath = resolve(stagingScreenshots, fileName)
        const publicPath = resolve(SCREENSHOT_ROOT, fileName)
        const screenshot = await page.screenshot({ path: screenshotPath })
        assertPng(screenshot, width, height)
        expect(statSync(screenshotPath).mtimeMs).toBeGreaterThanOrEqual(designModifiedAt)
        captureReceipt.push({
          mode,
          width,
          path: publicPath.replace(`${resolve(".")}/`, ""),
          sha256: createHash("sha256").update(screenshot).digest("hex"),
          capturedAt: new Date().toISOString(),
          horizontalOverflow,
          chartGeometry,
        })
        if (process.env["TASK_2_FAIL_AFTER_CAPTURE"] === "4" && captureReceipt.length === 4) {
          throw new Error("Intentional transaction failure after four staged captures")
        }
      }
    }

    expect(captureReceipt).toHaveLength(6)
    for (const { width } of contract.viewports) {
      const light = captureReceipt.find(
        (capture) => capture.width === width && capture.mode === "light",
      )
      const dark = captureReceipt.find(
        (capture) => capture.width === width && capture.mode === "dark",
      )
      expect(light).toBeDefined()
      expect(dark).toBeDefined()
      if (!light || !dark) throw new Error(`Missing paired chart geometry at ${width}px`)
      expect(dark.chartGeometry).toHaveLength(light.chartGeometry.length)
      for (const [index, lightPath] of light.chartGeometry.entries()) {
        const darkPath = dark.chartGeometry[index]
        expect(darkPath).toBeDefined()
        if (!darkPath) throw new Error(`Missing dark chart path ${index} at ${width}px`)
        expect(darkPath.pathLength).toBeCloseTo(lightPath.pathLength, 3)
      }
    }
    const rootRunId = process.env["TASK_2_CONCURRENT_ROOT_RUN_ID"] ?? "unpaired"
    const designReport = `.omo/evidence/task-2-postpartum-medical-chat/playwright-runs/${runId}/report.json`
    const rootReport = `.omo/evidence/task-1-postpartum-medical-chat/playwright-runs/${rootRunId}/report.json`
    const receipt = `${JSON.stringify(
      {
        source: SOURCE_URL,
        runId,
        reports: { root: rootReport, design: designReport },
        captures: captureReceipt,
        exportParity: "pass",
        computedParity: "pass",
        staleCaptureGuard: "pass",
        deterministicWaits: [
          "theme-visible",
          "document-fonts-ready",
          "animation-frame",
          "chart-stroke-geometry-settled",
        ],
        cleanup: "Playwright test fixture closes page/context/browser",
      },
      null,
      2,
    )}\n`
    writeFileSync(resolve(stagingRoot, "playwright-capture-receipt.json"), receipt)
    const receiptPath =
      ".omo/evidence/task-2-postpartum-medical-chat/playwright-capture-receipt.json"
    const manifest = [
      ...captureReceipt.map(({ sha256, path }) => `${sha256}  ${path}`),
      `${createHash("sha256").update(receipt).digest("hex")}  ${receiptPath}`,
    ]
      .sort()
      .join("\n")
    writeFileSync(
      resolve(stagingRoot, "accepted-hashes-green-concurrent-final.txt"),
      `${manifest}\n`,
    )
    writeFileSync(
      resolve(stagingRoot, "concurrent-summary-final.txt"),
      `${[
        `ROOT_RUN=${rootRunId} ROOT_REPORT=${rootReport}`,
        `DESIGN_RUN=${runId} DESIGN_REPORT=${designReport}`,
      ].join("\n")}\n`,
    )

    publishCaptureSet(stagingRoot)
    for (const capture of captureReceipt) {
      const accepted = readFileSync(resolve(capture.path))
      expect(accepted.byteLength).toBeGreaterThan(0)
      expect(createHash("sha256").update(accepted).digest("hex")).toBe(capture.sha256)
    }
  } finally {
    rmSync(stagingRoot, { force: true, recursive: true })
  }
})
