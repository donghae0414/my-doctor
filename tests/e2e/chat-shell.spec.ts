import { createHash } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

import {
  assertActiveCjkGeometry,
  assertChatGeometry,
  nextAnimationFrame,
} from "./chat-shell-layout"

const evidenceRoot = resolve(".omo/evidence/task-10-postpartum-medical-chat")
const stagingRoot = resolve(evidenceRoot, "staging")
const acceptedRoot = resolve(evidenceRoot, "accepted")
const viewports = [375, 768, 1280] as const
const themes = ["light", "dark"] as const
const emptyPrompt = "산후 회복·아기 돌봄, 무엇이 궁금하세요?"
const medicalDisclaimer = "AI는 틀릴 수 있어요. 의료 판단은 의료진과 확인하세요."

test.describe.configure({ mode: "serial" })

async function openFixture(page: import("@playwright/test").Page, theme = "light") {
  await page.goto(`/chat-shell-task-10?theme=${theme}`)
  await expect(page.getByRole("textbox", { name: "의료 질문" })).toBeVisible()
}

async function sendAndFinish(page: import("@playwright/test").Page, question: string) {
  await page.getByRole("textbox", { name: "의료 질문" }).fill(question)
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(page.getByText("응답을 준비하고 있습니다.")).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-continue")))
  await expect(page.getByRole("heading", { name: "아기 상태 확인" })).toBeVisible()
  await page
    .locator("article[data-from='assistant']")
    .last()
    .evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    )
}

test.beforeAll(async () => {
  await rm(stagingRoot, { force: true, recursive: true })
  await mkdir(stagingRoot, { recursive: true })
})

test("streams the exact chat journey without persistence or unsafe sources", async ({ page }) => {
  await page.setViewportSize({ height: 812, width: 375 })
  await openFixture(page)

  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
  await expect(page.getByRole("combobox")).toHaveCount(0)
  const modelMenu = page.locator("button[aria-haspopup='menu']")
  await expect(modelMenu).toBeVisible()
  await expect(page.getByText(emptyPrompt, { exact: true })).toBeVisible()
  await expect(page.getByText(medicalDisclaimer, { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "질문 보내기" })).toBeDisabled()
  await modelMenu.click()
  const modelItems = page.getByRole("menuitemradio")
  await expect(modelItems).toHaveCount(3)
  await expect(page.getByRole("menuitemradio", { name: "GPT-5.6 Sol" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await page.getByRole("menuitemradio", { name: "GPT-5.6 Luna" }).click()
  await expect(modelMenu).toHaveAttribute("aria-label", "모델 GPT-5.6 Luna, 추론 강도 보통")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(modelMenu).toHaveAccessibleName("모델 GPT-5.6 Luna, 추론 강도 보통")
  await expect(modelMenu).toBeFocused()
  await modelMenu.focus()
  await page.keyboard.press("ArrowDown")
  const effortSubmenu = page.getByRole("menuitem", { exact: true, name: "추론 강도" })
  await effortSubmenu.focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("menuitemradio")).toHaveCount(9)
  await page.getByRole("menuitemradio", { name: "매우 높음" }).click()
  await expect(modelMenu).toHaveAccessibleName("모델 GPT-5.6 Luna, 추론 강도 매우 높음")
  await assertChatGeometry(page)

  await page.getByRole("textbox", { name: "의료 질문" }).fill("빈 응답 확인")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(
    page.getByText("답변 내용이 비어 있습니다. 질문을 조금 더 구체적으로 보내 주세요."),
  ).toBeVisible()
  await page.getByRole("button", { name: "새 대화" }).click()

  await page
    .getByRole("textbox", { name: "의료 질문" })
    .fill("생후 3주 아기가 수유 뒤에 자주 토해요")
  await expect(page.getByRole("button", { name: "질문 보내기" })).toBeEnabled()
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(page.getByText("응답을 준비하고 있습니다.")).toBeVisible()
  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "bottom")
  await expect(page.locator("article[data-from='user']")).toContainText("생후 3주")
  await expect(page.getByRole("button", { name: "응답 중지" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "의료 질문" })).not.toBeDisabled()
  await expect(page.locator("html")).toHaveAttribute("data-last-effort", "xhigh")
  const streamingAssistant = page.locator("article[data-from='assistant']").last()
  const streamingAssistantBody = streamingAssistant.locator(":scope > div")
  await expect(streamingAssistant.locator("[data-assistant-marker]")).toBeVisible()
  const streamingBodyLeft = await streamingAssistantBody.evaluate(
    (element) => element.getBoundingClientRect().left,
  )
  // The marker floats in the gutter: fully visible, and entirely before the text edge.
  const markerRect = await streamingAssistant
    .locator("[data-assistant-marker]")
    .evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return { left: rect.left, right: rect.right, visible: hit === element }
    })
  expect(markerRect.left).toBeGreaterThanOrEqual(0)
  expect(markerRect.right).toBeLessThanOrEqual(streamingBodyLeft)
  expect(markerRect.visible).toBe(true)
  const markerAnimation = await streamingAssistant
    .locator("[data-assistant-marker]")
    .evaluate((element) => {
      const animation = element.getAnimations().at(0)
      const effect = animation?.effect
      if (!(effect instanceof KeyframeEffect)) return undefined
      return {
        keyframes: effect.getKeyframes().map((keyframe) => keyframe["opacity"]),
        repeat: effect.getTiming().iterations,
      }
    })
  expect(markerAnimation).toEqual({
    keyframes: ["1", "0.96", "1"],
    repeat: Number.POSITIVE_INFINITY,
  })

  await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-continue")))
  await expect(page.getByRole("heading", { name: "아기 상태 확인" })).toBeVisible()
  await expect(streamingAssistant.locator("[data-assistant-marker]")).toHaveCount(0)
  const completedBodyLeft = await streamingAssistantBody.evaluate(
    (element) => element.getBoundingClientRect().left,
  )
  expect(Math.abs(completedBodyLeft - streamingBodyLeft)).toBeLessThanOrEqual(1)
  await page.getByRole("button", { name: "출처 1개 보기" }).click()
  const safeSource = page.getByRole("link", { name: /신생아 수유와 게워냄/u })
  await expect(safeSource).toHaveAttribute("href", /^https:/u)
  await expect(safeSource).toHaveAttribute("target", "_blank")
  const sourceHref = await safeSource.getAttribute("href")
  if (sourceHref === null) throw new TypeError("safe source is missing its URL")
  await page.context().route("https://example.com/**", async (route) => {
    await route.fulfill({
      body: "<!doctype html><title>근거 자료</title>",
      contentType: "text/html",
    })
  })
  const sourcePage = await page.context().newPage()
  const sourceRequest = sourcePage.waitForRequest(/^https:\/\/example\.com/u)
  await sourcePage.goto(sourceHref)
  await sourceRequest
  await expect(sourcePage).toHaveURL(/^https:\/\//u)
  await sourcePage.close()
  await expect(page.getByText("표시되면 안 되는 출처")).toHaveCount(0)
  await expect(page.getByText(/reasoning|재생성|다시 생성|다운로드|음성/u)).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
  await expect(page.getByText("생후 3주 아기가 수유 뒤에 자주 토해요")).toHaveCount(0)
  await sendAndFinish(page, "새로고침 뒤 긴 대화 복원 없이 새 질문을 보냅니다")

  await page.getByRole("textbox", { name: "의료 질문" }).fill("자동 스크롤 확인")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(page.getByRole("button", { name: "응답 중지" })).toBeVisible()
  const scrollBody = page.locator("[role='log'] > div")
  await scrollBody.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const sentinel = element.lastElementChild
        if (sentinel === null) throw new TypeError("missing scroll sentinel")
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry?.isIntersecting === false) {
              observer.disconnect()
              resolve()
            }
          },
          { root: element },
        )
        observer.observe(sentinel)
        element.scrollTop = 0
      }),
  )
  const awayPosition = await scrollBody.evaluate((element) => element.scrollTop)
  await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-continue")))
  await expect(page.getByRole("button", { name: "응답 중지" })).toHaveCount(0)
  expect(await scrollBody.evaluate((element) => element.scrollTop)).toBe(awayPosition)

  await page.getByRole("textbox", { name: "의료 질문" }).fill("중지 확인")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(page.getByRole("button", { name: "응답 중지" })).toBeEnabled()
  await expect(page.getByText("응답을 준비하고 있습니다.").last()).toBeVisible()
  await page.getByRole("button", { name: "응답 중지" }).click()
  await expect(page.locator("[data-chat-state]")).toHaveAttribute("data-stream-stopped", "true")
  await expect(page.getByRole("button", { name: "응답 중지" })).toHaveCount(0)
  await expect(page.getByText("응답을 준비하고 있습니다.").last()).toBeVisible()

  await page.getByRole("textbox", { name: "의료 질문" }).fill("오류 응답")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(
    page.getByText("네트워크 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도해 주세요."),
  ).toBeVisible()
  await page.getByRole("button", { name: "새 대화" }).click()
  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
})

test("keeps the light and dark chat responsive at every required width", async ({ page }) => {
  const artifacts: Array<{ readonly path: string; readonly sha256: string }> = []
  for (const theme of themes) {
    for (const width of viewports) {
      await page.setViewportSize({ height: 900, width })
      await openFixture(page, theme)
      await sendAndFinish(page, "아기가 수유 뒤에 토하고 긴 한국어 문장을 확인하고 싶어요")
      await assertChatGeometry(page)
      const violations = await new AxeBuilder({ page }).analyze()
      expect(violations.violations).toEqual([])
      const name = `chat-${width}-${theme}.png`
      const path = resolve(stagingRoot, name)
      await page.screenshot({ fullPage: true, path })
      artifacts.push({
        path: name,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      })
    }
  }

  await page.setViewportSize({ height: 812, width: 319 })
  await openFixture(page)
  await page.getByRole("button", { name: "모델 GPT-5.6 Sol, 추론 강도 보통" }).click()
  await assertChatGeometry(page)
  await page.keyboard.press("Escape")
  const narrowCopyLines = await page.evaluate(
    ({ emptyPrompt, medicalDisclaimer }) => {
      const lineCount = (text: string) => {
        const element = [...document.querySelectorAll<HTMLElement>("*")].find(
          (candidate) => candidate.textContent === text,
        )
        if (element === undefined) throw new TypeError(`missing copy: ${text}`)
        const range = document.createRange()
        range.selectNodeContents(element)
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
      }
      return {
        emptyPrompt: lineCount(emptyPrompt),
        medicalDisclaimer: lineCount(medicalDisclaimer),
      }
    },
    { emptyPrompt, medicalDisclaimer },
  )
  expect(narrowCopyLines.emptyPrompt).toBeGreaterThan(1)
  expect(narrowCopyLines.medicalDisclaimer).toBeGreaterThan(1)

  await page.setViewportSize({ height: 812, width: 375 })
  await openFixture(page)
  await page.getByRole("button", { name: "모델 GPT-5.6 Sol, 추론 강도 보통" }).click()
  await assertChatGeometry(page)
  await page.keyboard.press("Escape")
  const oneLineCopy = await page.getByText(emptyPrompt, { exact: true }).evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
  })
  expect(oneLineCopy).toBe(1)

  await page.setViewportSize({ height: 406, width: 188 })
  await openFixture(page)
  const zoomEmptyCopyLines = await page
    .getByText(emptyPrompt, { exact: true })
    .evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
    })
  expect(zoomEmptyCopyLines).toBeGreaterThan(1)
  await sendAndFinish(
    page,
    "200퍼센트 확대에서도 아기가 수유 뒤에 토하는 긴 한국어 상담 내용을 확인합니다",
  )
  await nextAnimationFrame(page)
  await expect(page.locator("[data-chat-state]")).toHaveAttribute("data-chat-state", "active")
  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "bottom")
  await assertChatGeometry(page)
  await assertActiveCjkGeometry(page, { allowWrappedDisclaimer: true })
  const zoomCaptureName = "chat-375-light-zoom-200-active.png"
  const zoomCapturePath = resolve(stagingRoot, zoomCaptureName)
  await page.screenshot({ fullPage: true, path: zoomCapturePath })
  artifacts.push({
    path: zoomCaptureName,
    sha256: createHash("sha256")
      .update(await readFile(zoomCapturePath))
      .digest("hex"),
  })

  const manifest = { artifacts, generatedAt: new Date().toISOString(), task: 10 }
  await writeFile(resolve(stagingRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  await rm(acceptedRoot, { force: true, recursive: true })
  await rename(stagingRoot, acceptedRoot)
})
