import { createHash } from "node:crypto"
import { readdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test } from "@playwright/test"
import { z } from "zod"

import {
  applyTheme,
  assertSurface,
  CAPTURE_ROOT,
  capture,
  MOTION_MODES,
  prepareCaptureRoot,
  send,
  THEMES,
  unlock,
  WIDTHS,
} from "./task14-helpers"

const SOURCE_HASH = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .parse(process.env["TASK14_SOURCE_HASH"])
const jpegPath = resolve("tests/fixtures/images/task13-valid.jpg")
const LONG_KOREAN =
  "산후 회복 중인 보호자가 신생아의 수유 간격과 체온 변화를 함께 살펴보면서 언제 의료기관에 연락해야 하는지 자세한 기준을 확인하고 싶습니다."
const UNBROKEN_URL = `https://example.com/${"very-long-unbroken-source-segment-".repeat(12)}`

test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  await rm(CAPTURE_ROOT, { force: true, recursive: true })
  await prepareCaptureRoot()
})

test("captures the complete responsive theme and motion matrix", async ({ browser }) => {
  for (const motion of MOTION_MODES) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({
          reducedMotion: motion === "reduced" ? "reduce" : "no-preference",
          viewport: { height: 900, width },
        })
        const page = await context.newPage()
        await page.goto("/")
        await applyTheme(page, theme)
        await expect(page.locator("[data-auth-state='locked']")).toBeVisible()
        await assertSurface(page)
        await capture(page, `${width}-${theme}-${motion}-locked.png`)
        await unlock(page)
        await expect(page.getByTestId("chat-composer-region")).toHaveAttribute(
          "data-placement",
          "center",
        )
        await expect(page.getByRole("log", { name: "상담 대화" })).toContainText(
          "무엇을 함께 살펴볼까요?",
        )
        await assertSurface(page)
        await capture(page, `${width}-${theme}-${motion}-empty.png`)
        await send(page, "TASK13_STREAM_medium")
        await expect(page.getByText("[effort:medium]", { exact: true })).toBeVisible()
        await assertSurface(page)
        await capture(page, `${width}-${theme}-${motion}-active.png`)
        await context.close()
      }
    }
  }
})

test("captures long source image stream error offline and zoom stress states", async ({
  browser,
}) => {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { height: 900, width: 375 },
    })
    const page = await context.newPage()
    await page.goto("/")
    await applyTheme(page, theme)
    await unlock(page)

    await page
      .getByLabel("사진 보관함에서 선택")
      .setInputFiles([jpegPath, jpegPath, jpegPath, jpegPath])
    await expect(page.getByText("첨부 완료", { exact: true })).toHaveCount(4)
    await page
      .getByTestId("image-preview-grid")
      .locator("img")
      .evaluateAll(async (images: readonly HTMLImageElement[]) => {
        await Promise.all(images.map((image) => image.decode()))
      })
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await assertSurface(page)
    await capture(page, `375-${theme}-four-images.png`)

    await send(page, `TASK14_LONG_SOURCE ${LONG_KOREAN} ${UNBROKEN_URL}`)
    await expect(page.getByText("[effort:medium]", { exact: true })).toBeVisible()
    const sourceTrigger = page.getByRole("button", { name: "출처 1개 보기" })
    await sourceTrigger.click()
    await expect(page.getByRole("link", { name: /LONG-SOURCE-TITLE/u })).toBeVisible()
    await sourceTrigger.evaluate((element) => element.scrollIntoView({ block: "start" }))
    await assertSurface(page)
    await capture(page, `375-${theme}-long-image-source.png`)

    await send(page, "TASK13_HOLD")
    await expect(page.getByRole("button", { name: "응답 중지" })).toBeVisible()
    await assertSurface(page)
    await capture(page, `375-${theme}-slow-stream.png`)
    await page.getByRole("button", { name: "응답 중지" }).click()

    const providerResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/chat") && response.status() === 502,
    )
    await page.getByRole("textbox", { name: "의료 질문" }).fill("TASK13_PROVIDER_ERROR")
    await page.getByRole("button", { name: "질문 보내기" }).click()
    await providerResponse
    await expect(page.locator("[data-chat-error-code='provider']")).toBeInViewport()
    await assertSurface(page)
    await capture(page, `375-${theme}-provider-error.png`)

    await page.context().setOffline(true)
    const failed = page.waitForEvent("requestfailed", (request) =>
      request.url().endsWith("/api/chat"),
    )
    await page.getByRole("textbox", { name: "의료 질문" }).fill("TASK13_OFFLINE")
    await page.getByRole("button", { name: "질문 보내기" }).click()
    await failed
    await expect(page.locator("[data-chat-error-code='offline']")).toBeInViewport()
    await assertSurface(page)
    await capture(page, `375-${theme}-offline.png`)
    await page.context().setOffline(false)
    await context.close()

    const zoomContext = await browser.newContext({
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      viewport: { height: 450, width: 188 },
    })
    const zoomPage = await zoomContext.newPage()
    await zoomPage.goto("/")
    await applyTheme(zoomPage, theme)
    await unlock(zoomPage)
    await send(zoomPage, "TASK13_STREAM_medium")
    await expect(zoomPage.getByText("[effort:medium]", { exact: true })).toBeVisible()
    await zoomPage.locator("[data-scroll-owner='conversation']").evaluate((element) => {
      element.scrollTop = 0
    })
    await assertSurface(zoomPage)
    await capture(zoomPage, `375-${theme}-zoom-200.png`)
    await zoomContext.close()
  }
  const names = (await readdir(CAPTURE_ROOT)).filter((name) => name.endsWith(".png")).sort()
  expect(names).toHaveLength(48)
  const captures = await Promise.all(
    names.map(async (name) => ({
      name,
      sha256: createHash("sha256")
        .update(await readFile(resolve(CAPTURE_ROOT, name)))
        .digest("hex"),
    })),
  )
  await writeFile(
    resolve(CAPTURE_ROOT, "manifest.json"),
    `${JSON.stringify({ captures, count: captures.length, sourceHash: SOURCE_HASH }, null, 2)}\n`,
  )
})
