import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import AxeBuilder from "@axe-core/playwright"
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"

import { expectObserved, subscribeToDomCount, subscribeToDomState } from "./task13-events"

const PASSWORD = "1234"
const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const
const jpegPath = resolve("tests/fixtures/images/task13-valid.jpg")
const heicPath = resolve("tests/fixtures/images/task13-valid.heic")
const corruptHeicPath = resolve("tests/fixtures/images/corrupt.heic")
const unsupportedPath = resolve("tests/fixtures/images/unsupported.txt")

async function openLocked(page: Page): Promise<void> {
  await page.goto("/")
  await expect(page.locator("[data-auth-state='locked']")).toBeVisible()
}

async function unlock(page: Page, code = PASSWORD): Promise<number> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/auth/unlock") && candidate.request().method() === "POST",
  )
  await page.getByRole("textbox", { name: "접근 코드" }).fill(code)
  await page.getByRole("button", { name: "접근 코드 제출" }).click()
  return (await response).status()
}

async function openAuthenticated(
  browser: Browser,
): Promise<{ readonly context: BrowserContext; readonly page: Page }> {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  await openLocked(page)
  expect(await unlock(page)).toBe(204)
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
  return { context, page }
}

async function send(page: Page, text: string): Promise<void> {
  const response = page.waitForResponse(
    (candidate) => candidate.url().endsWith("/api/chat") && candidate.request().method() === "POST",
  )
  await page.getByRole("textbox", { name: "의료 질문" }).fill(text)
  await page.getByRole("button", { name: "질문 보내기" }).click()
  expect((await response).status()).toBe(200)
}

async function expectReadyImages(page: Page, count: number): Promise<void> {
  await expect(
    page.getByTestId("image-preview-grid").getByText("첨부 완료", { exact: true }),
  ).toHaveCount(count, { timeout: 30_000 })
}

test("locks first entry and enforces browser-session authentication semantics", async ({
  browser,
  request,
}) => {
  const unauthorized = await request.post("/api/chat", {
    data: { messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "x" }] }] },
  })
  expect(unauthorized.status()).toBe(401)

  const { context, page } = await openAuthenticated(browser)
  await page.reload()
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
  const sibling = await context.newPage()
  await sibling.goto("/")
  await expect(sibling.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
  await context.close()

  const restarted = await browser.newContext()
  const restartedPage = await restarted.newPage()
  await openLocked(restartedPage)
  expect(await unlock(restartedPage, "9999")).toBe(401)
  await expect(restartedPage.locator("#door-lock-message[role='alert']")).toBeVisible()
  await restartedPage.getByRole("textbox", { name: "접근 코드" }).fill("12345")
  await restartedPage.getByRole("textbox", { name: "접근 코드" }).press("Backspace")
  const response = restartedPage.waitForResponse(/\/api\/auth\/unlock$/u)
  await restartedPage.getByRole("textbox", { name: "접근 코드" }).press("Enter")
  expect((await response).status()).toBe(204)
  await restarted.close()
})

test("streams text and safe sources for every effort and clears transient conversation", async ({
  browser,
}) => {
  const { context, page } = await openAuthenticated(browser)
  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
  const effort = page.getByRole("combobox", { name: "추론 강도" })
  await expect(effort.getByRole("option")).toHaveCount(6)
  await expect(effort).toHaveValue("medium")

  for (const value of EFFORTS) {
    await effort.selectOption(value)
    await send(page, `TASK13_STREAM_${value}`)
    await expect(page.getByText(`[effort:${value}]`, { exact: true })).toBeVisible()
  }
  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "bottom")
  let observed = await subscribeToDomState(page, {
    attribute: "href",
    selector: "a[href='https://example.com/task13']",
    value: "https://example.com/task13",
  })
  await page
    .getByRole("button", { name: /출처 1개 보기/u })
    .last()
    .click()
  await expectObserved(page, observed)
  await expect(page.getByRole("link", { name: "TASK13_SOURCE" }).last()).toHaveAttribute(
    "href",
    "https://example.com/task13",
  )
  await expect(page.getByText("TASK13_UNSAFE_SOURCE")).toHaveCount(0)
  observed = await subscribeToDomCount(page, { count: 0, selector: "article" })
  await page.getByRole("button", { name: "새 대화" }).click()
  await expectObserved(page, observed)
  await send(page, "TASK13_STREAM_medium")
  await page.reload()
  await expect(page.locator("article")).toHaveCount(0)
  await context.close()
})

test("normalizes current-turn JPEG and HEIC while rejecting malformed and excessive input", async ({
  browser,
}) => {
  const { context, page } = await openAuthenticated(browser)
  const camera = page.getByLabel("후면 카메라로 촬영")
  const gallery = page.getByLabel("사진 보관함에서 선택")
  await expect(camera).toHaveAttribute("capture", "environment")
  await expect(gallery).not.toHaveAttribute("capture")

  await gallery.setInputFiles([jpegPath, heicPath])
  await expectReadyImages(page, 2)
  await send(page, "TASK13_IMAGE_FIRST")
  await expect(page.locator("article[data-from='user'] img")).toHaveCount(2)
  await camera.setInputFiles(jpegPath)
  await expectReadyImages(page, 1)
  await send(page, "TASK13_IMAGE_SECOND")
  await expect(page.locator("article[data-from='user'] img")).toHaveCount(3)

  const imageErrorSelector = "[data-image-error-code]"
  let observed = await subscribeToDomState(page, {
    attribute: "data-image-error-code",
    selector: imageErrorSelector,
    value: "unsupported",
  })
  await gallery.setInputFiles(unsupportedPath)
  await expectObserved(page, observed)

  observed = await subscribeToDomState(page, {
    attribute: "data-image-error-code",
    selector: imageErrorSelector,
    value: "corrupt",
  })
  await gallery.setInputFiles(corruptHeicPath)
  await expectObserved(page, observed)

  const jpeg = await readFile(jpegPath)
  observed = await subscribeToDomState(page, {
    attribute: "data-image-error-code",
    selector: imageErrorSelector,
    value: "too_large",
  })
  await gallery.setInputFiles({
    buffer: Buffer.concat([jpeg, Buffer.alloc(10 * 1024 * 1024 + 1 - jpeg.byteLength)]),
    mimeType: "image/jpeg",
    name: "oversize.jpg",
  })
  await expectObserved(page, observed)

  await gallery.setInputFiles([jpegPath, jpegPath, jpegPath, jpegPath])
  await expectReadyImages(page, 4)
  observed = await subscribeToDomState(page, {
    attribute: "data-image-error-code",
    selector: imageErrorSelector,
    value: "too_many",
  })
  await camera.setInputFiles(jpegPath)
  await expectObserved(page, observed)

  await page.getByRole("textbox", { name: "의료 질문" }).evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new TypeError("textarea unavailable")
    element.value = "가".repeat(1_400_000)
  })
  observed = await subscribeToDomState(page, {
    attribute: "data-send-error-code",
    selector: "[data-send-error-code]",
    value: "request-budget",
  })
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expectObserved(page, observed)
  await context.close()
})

test("provides deterministic stop, provider failure, and offline outcomes", async ({ browser }) => {
  const { context, page } = await openAuthenticated(browser)
  await send(page, "TASK13_HOLD")
  await expect(page.getByRole("button", { name: "응답 중지" })).toBeVisible()
  let observed = await subscribeToDomState(page, {
    attribute: "data-stream-stopped",
    selector: "[data-stream-stopped]",
    value: "true",
  })
  await page.getByRole("button", { name: "응답 중지" }).click()
  await expectObserved(page, observed)

  await page.getByRole("textbox", { name: "의료 질문" }).fill("TASK13_PROVIDER_ERROR")
  observed = await subscribeToDomState(page, {
    attribute: "data-chat-error-code",
    selector: "[data-chat-error-code]",
    value: "provider",
  })
  const providerResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.status() === 502,
  )
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await providerResponse
  await expectObserved(page, observed)
  await expect(
    page.locator("[data-chat-error-code='provider']"),
  ).toHaveText("현재 의료 답변과 검색 근거를 제공할 수 없습니다. 잠시 후 다시 시도해 주세요.")
  await expect(page.locator("[data-tone='loading']")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "질문 보내기" })).toBeVisible()

  await page.context().setOffline(true)
  await page.getByRole("textbox", { name: "의료 질문" }).fill("TASK13_OFFLINE")
  observed = await subscribeToDomState(page, {
    attribute: "data-chat-error-code",
    selector: "[data-chat-error-code]",
    value: "offline",
  })
  const failedRequest = page.waitForEvent("requestfailed", (request) =>
    request.url().endsWith("/api/chat"),
  )
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await failedRequest
  await expectObserved(page, observed)
  await expect(page.locator("[data-chat-error-code='offline']")).toHaveText(
    "네트워크 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
  )
  await expect(page.locator("[data-tone='loading']")).toHaveCount(0)
  await page.context().setOffline(false)
  await send(page, "TASK13_STREAM_medium")
  await expect(page.getByText("[effort:medium]", { exact: true }).last()).toBeVisible()
  await context.close()
})

test("keeps accessible outcomes at all widths and under reduced motion", async ({ browser }) => {
  for (const width of [375, 768, 1280] as const) {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width, height: 900 },
    })
    const page = await context.newPage()
    await openLocked(page)
    await page.getByRole("textbox", { name: "접근 코드" }).pressSequentially(PASSWORD)
    const response = page.waitForResponse(/\/api\/auth\/unlock$/u)
    await page.getByRole("textbox", { name: "접근 코드" }).press("Enter")
    expect((await response).status()).toBe(204)
    await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
    await page.locator("main").evaluate(async (element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    )
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    const fitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(fitsViewport).toBe(true)
    await context.close()
  }
})
