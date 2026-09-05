import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { chromium, expect, test } from "@playwright/test"
import { CAPTURE_WIDTHS, runMotionMode } from "./motion-journey"

const evidenceRoot = resolve(".omo/evidence/task-12-postpartum-medical-chat")
const acceptedRoot = resolve(evidenceRoot, "accepted")
const sourcePaths = [
  "DESIGN.md",
  "app/globals.css",
  "next.config.ts",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "scripts/qa/task12-lighthouse.mts",
  "scripts/qa/task12-lighthouse.sh",
  "scripts/qa/task12-react-scan.sh",
  "components/ai-elements/attachments.tsx",
  "components/ai-elements/message.tsx",
  "components/ai-elements/prompt-input.tsx",
  "components/ai-elements/sources.tsx",
  "components/chat/chat-message.tsx",
  "components/chat/chat-shell.tsx",
  "components/door-lock.tsx",
  "components/motion/motion-provider.tsx",
  "components/motion/motion-tokens.ts",
  "tests/e2e/devtools-layout-trace.ts",
  "tests/e2e/motion-attachments-page.tsx",
  "tests/e2e/motion-journey.ts",
  "tests/e2e/motion-runtime-audit.ts",
  "tests/e2e/motion.spec.ts",
  "tests/e2e/react-scan-browser.ts",
  "tests/e2e/react-scan.spec.ts",
  "tests/e2e/run-motion-server.sh",
] as const
const modes = ["normal", "reduced"] as const
const artifactNames = [
  "normal-lock-375.png",
  "normal-lock-768.png",
  "normal-lock-1280.png",
  "normal-runtime.json",
  "normal-chat-375.png",
  "normal-chat-768.png",
  "normal-chat-1280.png",
  "normal-devtools-trace.json.gz",
  "normal-layout-summary.json",
  "normal-video.webm",
  "reduced-lock-375.png",
  "reduced-lock-768.png",
  "reduced-lock-1280.png",
  "reduced-runtime.json",
  "reduced-chat-375.png",
  "reduced-chat-768.png",
  "reduced-chat-1280.png",
  "reduced-devtools-trace.json.gz",
  "reduced-layout-summary.json",
  "reduced-video.webm",
] as const

test.use({ trace: "off", video: "off" })

async function assertAssistantMarkerContrast(browser: import("@playwright/test").Browser) {
  for (const theme of ["light", "dark"] as const) {
    const context = await browser.newContext({
      reducedMotion: "no-preference",
      viewport: { height: 812, width: 375 },
    })
    try {
      const page = await context.newPage()
      await page.goto(`/motion-task-12?theme=${theme}`)
      await page.getByRole("textbox", { name: "의료 질문" }).fill("대비를 확인합니다")
      await page.getByRole("button", { name: "질문 보내기" }).click()
      await expect(page.locator("[data-assistant-marker]")).toBeVisible()
      const contrasts = await page.evaluate(() => {
        type Rgb = readonly [number, number, number]
        const parseColor = (value: string): Rgb => {
          const canvas = document.createElement("canvas")
          canvas.height = 1
          canvas.width = 1
          const context = canvas.getContext("2d", { willReadFrequently: true })
          if (context === null) throw new TypeError("2D color conversion is unavailable")
          context.fillStyle = value
          context.fillRect(0, 0, 1, 1)
          const channels = context.getImageData(0, 0, 1, 1).data
          if (channels.length < 3) throw new TypeError(`color conversion failed: ${value}`)
          const [red = 0, green = 0, blue = 0] = channels
          return [red, green, blue]
        }
        const linearize = (channel: number) => {
          const normalized = channel / 255
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4
        }
        const relativeLuminance = ([red, green, blue]: Rgb) =>
          linearize(red) * 0.2126 + linearize(green) * 0.7152 + linearize(blue) * 0.0722
        const contrast = (foreground: Rgb, background: Rgb) => {
          const foregroundLuminance = relativeLuminance(foreground)
          const backgroundLuminance = relativeLuminance(background)
          return (
            (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
            (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
          )
        }
        const marker = document.querySelector("[data-assistant-marker]")
        if (!(marker instanceof HTMLElement)) throw new TypeError("assistant marker is missing")
        const sample = (className: string) => {
          const element = document.createElement("div")
          element.className = className
          const parent = marker.parentElement
          if (parent === null) throw new TypeError("assistant marker parent is missing")
          parent.append(element)
          const color = parseColor(getComputedStyle(element).backgroundColor)
          element.remove()
          return color
        }
        const markerColor = parseColor(getComputedStyle(marker).backgroundColor)
        const background = sample("bg-background")
        const muted = sample("bg-muted")
        return {
          markerColor,
          primaryColor: sample("bg-primary"),
          // The decorative pulse trough may fall below 3:1; full opacity must not.
          background: contrast(markerColor, background),
          muted: contrast(markerColor, muted),
        }
      })
      expect(contrasts.markerColor, `${theme} primary marker`).toEqual(contrasts.primaryColor)
      expect(contrasts.background, `${theme} full-opacity background`).toBeGreaterThanOrEqual(3)
      expect(contrasts.muted, `${theme} full-opacity muted`).toBeGreaterThanOrEqual(3)
    } finally {
      await context.close()
    }
  }
}

async function hashSources(): Promise<string> {
  const hash = createHash("sha256")
  for (const path of sourcePaths) hash.update(path).update(await readFile(path))
  return hash.digest("hex")
}

test("records the exact normal and reduced Todo12 motion contract", async () => {
  const browser = await chromium.launch({ channel: "chrome" })
  const stagingRoot = resolve(evidenceRoot, `.accepted-${randomUUID()}`)
  const backupRoot = resolve(evidenceRoot, `.accepted-backup-${randomUUID()}`)
  const sourceHashBefore = await hashSources()
  await mkdir(stagingRoot, { recursive: true })
  try {
    for (const mode of modes) await runMotionMode(browser, mode, stagingRoot)
    await assertAssistantMarkerContrast(browser)
    for (const mode of modes) {
      for (const width of CAPTURE_WIDTHS) {
        await rename(
          resolve(evidenceRoot, `staging-${mode}-lock-${width}.png`),
          resolve(stagingRoot, `${mode}-lock-${width}.png`),
        )
        await rename(
          resolve(evidenceRoot, `staging-${mode}-chat-${width}.png`),
          resolve(stagingRoot, `${mode}-chat-${width}.png`),
        )
      }
    }
    const artifacts = Object.fromEntries(
      await Promise.all(
        artifactNames.map(async (name) => [
          name,
          createHash("sha256")
            .update(await readFile(resolve(stagingRoot, name)))
            .digest("hex"),
        ]),
      ),
    )
    const sourceHashAfter = await hashSources()
    expect(sourceHashAfter).toBe(sourceHashBefore)
    const source = {
      files: sourcePaths,
      hash: sourceHashAfter,
      hashedAfterBrowserRun: true,
    }
    const doneClaim = {
      claim: "Todo12 motion contract is complete",
      evidence: {
        artifacts,
        devToolsTraces: ["normal-devtools-trace.json.gz", "reduced-devtools-trace.json.gz"],
        source,
      },
      status: "PASS",
      task: 12,
    }
    await writeFile(
      resolve(stagingRoot, "DoneClaim.json"),
      `${JSON.stringify(doneClaim, null, 2)}\n`,
    )
    await writeFile(
      resolve(stagingRoot, "manifest.json"),
      `${JSON.stringify(
        {
          artifacts,
          cleanup: "contexts, trace sessions, temporary bundles, and temporary routes removed",
          generatedAt: new Date().toISOString(),
          source,
          task: 12,
        },
        null,
        2,
      )}\n`,
    )
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
  } finally {
    await browser.close()
  }
})
