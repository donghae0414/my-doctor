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
  await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-finish")))
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

test.describe("coarse-pointer composer", () => {
  test.use({ hasTouch: true, viewport: { height: 812, width: 375 } })

  test("keeps the compact footer, native picker, multiline entry and pending feedback usable", async ({
    page,
  }) => {
    await openFixture(page)
    const attachment = page.getByRole("button", { name: "사진 첨부" })
    const model = page.getByRole("button", { name: /^모델 /u })
    const send = page.getByRole("button", { name: "질문 보내기" })
    const controls = await Promise.all(
      [attachment, model, send].map((control) => control.boundingBox()),
    )
    const [left, middle, right] = controls
    if (!left || !middle || !right)
      throw new Error("Missing footer control")
    expect(Math.abs(left.y - middle.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(middle.y - right.y)).toBeLessThanOrEqual(1)
    expect(left.x + left.width).toBeLessThan(middle.x)
    expect(middle.x + middle.width).toBeLessThanOrEqual(right.x)
    expect(await model.evaluate((element) => getComputedStyle(element).fontSize)).toBe("14px")
    await assertChatGeometry(page)

    await model.click()
    await expect(page.getByRole("menu")).toHaveAttribute("data-side", "bottom")
    await page.keyboard.press("Escape")
    await attachment.click()
    await expect(page.getByRole("menu")).toHaveAttribute("data-side", "bottom")
    const fileChooser = page.waitForEvent("filechooser")
    await page.getByRole("menuitem", { name: "사진 선택" }).click()
    await (await fileChooser).setFiles("tests/fixtures/images/task13-valid.jpg")
    await expect(page.getByTestId("image-preview-grid")).toBeVisible()
    await expect(send).toBeEnabled()
    const preview = await page.getByTestId("image-preview-grid").boundingBox()
    const textarea = page.getByRole("textbox", { name: "의료 질문" })
    const inputBox = await textarea.boundingBox()
    if (preview === null || inputBox === null) throw new Error("Missing preview/input geometry")
    expect(preview.y + preview.height).toBeLessThanOrEqual(inputBox.y)
    await page.getByRole("button", { name: "task13-valid.jpg 제거" }).click()

    await textarea.fill("[pending]")
    await textarea.press("Enter")
    await expect(textarea).toHaveValue("[pending]\n")
    await expect(page.locator("article[data-from='user']")).toHaveCount(0)
    await textarea.press("x")
    await page.clock.install()
    await send.click()
    const pending = page.locator("[data-pending-response]")
    await expect(pending).toBeVisible()
    const pendingHeight = await pending.evaluate(
      (element) => element.getBoundingClientRect().height,
    )
    for (const phase of [1, 2, 0]) {
      await page.clock.fastForward(4000)
      await expect(pending.locator(`[data-pending-phrase='${phase}']`)).toHaveAttribute(
        "data-active",
        "true",
      )
      expect(await pending.evaluate((element) => element.getBoundingClientRect().height)).toBe(
        pendingHeight,
      )
    }
    const marker = page.locator("[data-assistant-marker]")
    const markerBox = await marker.boundingBox()
    expect(markerBox?.width).toBe(10)
    expect(markerBox?.height).toBe(10)
    for (const theme of ["light", "dark"]) {
      await page
        .locator("[data-chat-state]")
        .evaluate((element, value) => element.classList.toggle("dark", value === "dark"), theme)
      const contrasts = await marker.evaluate((element) => {
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = 1
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (context === null) throw new Error("No color conversion context")
        const rgb = (color: string) => {
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
        }
        const luminance = (channels: number[]) =>
          channels.reduce((sum, channel, index) => {
            const c = channel / 255
            return (
              sum +
              (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) *
                ([0.2126, 0.7152, 0.0722][index] ?? 0)
            )
          }, 0)
        const style = getComputedStyle(element)
        const markerColor = rgb(style.backgroundColor)
        return {
          markerColor,
          primaryColor: rgb(style.getPropertyValue("--primary")),
          // The decorative pulse trough may fall below 3:1; full opacity must not.
          fullOpacity: ["--background", "--muted"].map((token) => {
            const background = rgb(style.getPropertyValue(token))
            const a = luminance(markerColor)
            const b = luminance(background)
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          }),
        }
      })
      expect(contrasts.markerColor, `${theme} primary marker`).toEqual(contrasts.primaryColor)
      for (const contrast of contrasts.fullOpacity) expect(contrast).toBeGreaterThanOrEqual(3)
    }
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openFixture(page)
    await textarea.fill("[pending]")
    await send.click()
    await expect(marker).toHaveCSS("opacity", "1")
    expect(
      await marker.evaluate(
        (element) =>
          element
            .getAnimations()
            .filter(
              (animation) => animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
            ).length,
      ),
    ).toBe(0)
    await page.getByRole("button", { name: "응답 중지" }).click()
    await expect(pending).toHaveCount(0)
    await expect(marker).toHaveCount(0)
    for (const control of [attachment, model]) {
      await control.click()
      await expect(page.getByRole("menu")).toHaveAttribute("data-side", "top")
      await page.keyboard.press("Escape")
    }
  })
})

test("streams the exact chat journey without persistence or unsafe sources", async ({ page }) => {
  await page.setViewportSize({ height: 812, width: 375 })
  await openFixture(page)

  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
  await expect(page.getByRole("combobox")).toHaveCount(0)
  const modelMenu = page.locator("button[aria-haspopup='menu'][aria-label^='모델 ']")
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
        duration: effect.getTiming().duration,
        keyframes: effect.getKeyframes().map((keyframe) => keyframe["opacity"]),
        repeat: effect.getTiming().iterations,
      }
    })
  expect(markerAnimation).toEqual({
    duration: 1400,
    keyframes: ["1", "0.6", "1"],
    repeat: Number.POSITIVE_INFINITY,
  })

  await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-continue")))
  await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-finish")))
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
  const scrollBody = page.locator("[data-scroll-owner='conversation']")
  const growAnswer = () =>
    scrollBody.evaluate(
      (element) =>
        new Promise<{ gap: number; top: number }>((resolve, reject) => {
          const content = element.querySelector("[data-conversation-content]")
          if (content === null) throw new Error("Missing growing content")
          const initialHeight = content.getBoundingClientRect().height
          const timeout = setTimeout(() => {
            observer.disconnect()
            reject(new Error("No streamed content growth"))
          }, 5000)
          const observer = new ResizeObserver(() => {
            if (content.getBoundingClientRect().height < initialHeight + 96) return
            clearTimeout(timeout)
            observer.disconnect()
            resolve({
              gap: element.scrollHeight - element.clientHeight - element.scrollTop,
              top: element.scrollTop,
            })
          })
          observer.observe(content)
          window.dispatchEvent(new Event("chat-shell-continue"))
        }),
    )
  const followingGrowth = await growAnswer()
  expect(followingGrowth.gap).toBeLessThanOrEqual(2)
  await expect(page.locator("article[data-streaming='true']")).toHaveCount(1)
  await scrollBody.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("No upward scroll event")), 5000)
        element.addEventListener(
          "scroll",
          () => {
            clearTimeout(timeout)
            resolve()
          },
          { once: true },
        )
        element.scrollTop = 0
      }),
  )
  await expect(page.getByRole("button", { name: "최신 메시지로 이동" })).toBeVisible()
  const awayPosition = await scrollBody.evaluate((element) => element.scrollTop)
  const detachedGrowth = await growAnswer()
  expect(detachedGrowth.top).toBe(awayPosition)
  await scrollBody.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Latest scroll did not finish")), 5000)
        element.addEventListener(
          "scrollend",
          () => {
            clearTimeout(timeout)
            resolve()
          },
          { once: true },
        )
        document
          .querySelector<HTMLButtonElement>("button[aria-label='최신 메시지로 이동']")
          ?.click()
      }),
  )
  await expect(page.getByRole("button", { name: "최신 메시지로 이동" })).toHaveCount(0)
  expect((await growAnswer()).gap).toBeLessThanOrEqual(2)
  await scrollBody.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("No manual bottom return")), 5000)
        element.addEventListener(
          "scroll",
          () => {
            element.addEventListener(
              "scroll",
              () => {
                clearTimeout(timeout)
                resolve()
              },
              { once: true },
            )
            element.scrollTop = element.scrollHeight
          },
          { once: true },
        )
        element.scrollTop = 0
      }),
  )
  expect((await growAnswer()).gap).toBeLessThanOrEqual(2)
  await scrollBody.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("No final upward scroll")), 5000)
        element.addEventListener(
          "scroll",
          () => {
            clearTimeout(timeout)
            resolve()
          },
          { once: true },
        )
        element.scrollTop = 0
      }),
  )
  await expect(page.getByRole("button", { name: "최신 메시지로 이동" })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-finish")))
  await expect(page.getByRole("button", { name: "응답 중지" })).toHaveCount(0)
  await nextAnimationFrame(page)
  expect(await scrollBody.evaluate((element) => element.scrollTop)).toBe(awayPosition)

  await page.getByRole("textbox", { name: "의료 질문" }).fill("중지 확인")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(page.getByRole("button", { name: "응답 중지" })).toBeEnabled()
  await expect(page.getByText("응답을 준비하고 있습니다.").last()).toBeVisible()
  expect(
    await scrollBody.evaluate(
      (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
    ),
  ).toBeLessThanOrEqual(2)
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
