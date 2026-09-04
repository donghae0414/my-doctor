import { resolve } from "node:path"
import { expect, type Page, test } from "@playwright/test"

import { expectObserved, subscribeToDomCount, subscribeToDomState } from "./task13-events"

const jpegPath = resolve("tests/fixtures/images/task13-valid.jpg")
const heicPath = resolve("tests/fixtures/images/task13-valid.heic")

async function tap(page: Page, name: string): Promise<void> {
  const target = page.getByRole("button", { name, exact: true })
  const box = await target.boundingBox()
  if (box === null) throw new TypeError(`keypad target ${name} is unavailable`)
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}

async function selectHighEffort(page: Page): Promise<void> {
  const trigger = page.locator("button[aria-haspopup='menu']")
  await expect(trigger).toHaveText("GPT-5.6 Sol · 보통")
  await trigger.click()
  const submenu = page.getByRole("menuitem", { name: "추론 강도", exact: true })
  await submenu.focus()
  await submenu.press("ArrowRight")
  await page.getByRole("menuitemradio", { name: "높음", exact: true }).click()
  await expect(trigger).toHaveAccessibleName("모델 GPT-5.6 Sol, 추론 강도 높음")
}

test("completes one mobile pointer and touch lock-to-image-source-new-chat journey", async ({
  browser,
}) => {
  // Given: a fresh touch-capable mobile browser session starts at the real production lock.
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { height: 812, width: 375 },
  })
  const page = await context.newPage()
  await page.goto("/")
  await expect(page.locator("[data-auth-state='locked']")).toBeVisible()

  // When: pointer and touch input share one keypad submission.
  await page.getByRole("button", { name: "1", exact: true }).click()
  await tap(page, "2")
  await tap(page, "3")
  await tap(page, "4")
  const unlockResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/unlock") && response.status() === 204,
  )
  await tap(page, "접근 코드 제출")
  await unlockResponse
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()

  // When: camera-equivalent images are selected, one is removed, and the remaining image is sent.
  const gallery = page.getByLabel("사진 보관함에서 선택")
  await gallery.setInputFiles([jpegPath, heicPath])
  await expect(page.getByText("첨부 완료", { exact: true })).toHaveCount(2)
  let observed = await subscribeToDomCount(page, {
    count: 0,
    selector: "button[aria-label='task13-valid.jpg 제거']",
  })
  await page.getByRole("button", { name: "task13-valid.jpg 제거" }).click()
  await expectObserved(page, observed)
  await selectHighEffort(page)
  await page.getByRole("textbox", { name: "의료 질문" }).fill("TASK13_STREAM_high")
  const chatResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.status() === 200,
  )
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await chatResponse

  // Then: the image, deterministic source, and transient new-chat outcome are all observable.
  await expect(page.locator("article[data-from='user'] img")).toHaveCount(1)
  await expect(page.getByText("[effort:high]", { exact: true })).toBeVisible()
  observed = await subscribeToDomState(page, {
    attribute: "href",
    selector: "a[href='https://example.com/task13']",
    value: "https://example.com/task13",
  })
  await page.getByRole("button", { name: "출처 1개 보기" }).click()
  await expectObserved(page, observed)

  // When: the SDK sends the prior OpenAI provider metadata with a follow-up turn.
  await page.getByRole("textbox", { name: "의료 질문" }).fill("TASK13_SECOND_TURN")
  const followUpResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.status() === 200,
  )
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await followUpResponse

  // Then: provider metadata from the first answer does not invalidate the second request.
  await expect(page.getByText("[effort:high]", { exact: true })).toHaveCount(2)

  observed = await subscribeToDomCount(page, { count: 0, selector: "article" })
  await page.getByRole("button", { name: "새 대화" }).click()
  await expectObserved(page, observed)
  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
  await context.close()
})
