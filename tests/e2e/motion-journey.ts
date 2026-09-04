import { mkdir, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect } from "@playwright/test"
import { assertActiveCjkGeometry, assertChatGeometry } from "./chat-shell-layout"
import { LAYOUT_TRACE_BUDGET, startDevToolsLayoutTrace } from "./devtools-layout-trace"
import {
  expectCompositedOnly,
  installRuntimeAudit,
  type MotionMode,
  runtimeReport,
} from "./motion-runtime-audit"

const evidenceRoot = resolve(".omo/evidence/task-12-postpartum-medical-chat")
export const CAPTURE_WIDTHS = [375, 768, 1280] as const

async function exerciseKeypad(page: import("@playwright/test").Page, mode: MotionMode) {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "접근 코드를 입력해 주세요" })).toBeVisible()
  const digit = page.getByRole("button", { name: "1", exact: true })
  const press = await digit.evaluate(async (element, currentMode) => {
    const surface = element.parentElement
    if (surface === null) throw new TypeError("missing keypad motion surface")
    const changed = new Promise<string>((resolveChanged) => {
      const observer = new MutationObserver(() => {
        const transform = getComputedStyle(surface).transform
        if (transform === "none") return
        observer.disconnect()
        resolveChanged(transform)
      })
      observer.observe(surface, { attributeFilter: ["style"], attributes: true })
    })
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, buttons: 1, isPrimary: true, pointerId: 1 }),
    )
    const pressedTransform =
      currentMode === "normal" ? await changed : getComputedStyle(surface).transform
    const settled = new Promise<string>((resolveSettled) => {
      if (currentMode === "reduced") {
        resolveSettled(getComputedStyle(surface).transform)
        return
      }
      const observer = new MutationObserver(() => {
        const transform = getComputedStyle(surface).transform
        if (transform !== "none" && new DOMMatrixReadOnly(transform).a < 0.9999) return
        observer.disconnect()
        resolveSettled(transform)
      })
      observer.observe(surface, { attributeFilter: ["style"], attributes: true })
    })
    element.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, isPrimary: true, pointerId: 1 }),
    )
    const settledTransform = await settled
    return {
      pressedTransform,
      settledScale: settledTransform === "none" ? 1 : new DOMMatrixReadOnly(settledTransform).a,
    }
  }, mode)
  if (mode === "normal") expect(press.pressedTransform).not.toBe("none")
  else expect(press.pressedTransform).toBe("none")
  expect(press.settledScale).toBeCloseTo(1, 4)

  await digit.click()
  await expect(page.getByTestId("masked-digit")).toHaveCount(1)
  await page.getByRole("textbox", { name: "접근 코드" }).press("Enter")
  await expect(page.locator("#door-lock-message[role='alert']")).toHaveText(
    "접근 코드를 확인해 주세요.",
  )
  expect(await page.getByRole("button", { name: "한 자리 지우기" }).isEnabled()).toBe(true)
  for (const width of CAPTURE_WIDTHS) {
    await page.setViewportSize({ height: 812, width })
    await page.screenshot({ path: resolve(evidenceRoot, `staging-${mode}-lock-${width}.png`) })
  }
  return runtimeReport(page)
}

async function exerciseChat(page: import("@playwright/test").Page, mode: MotionMode) {
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto("/motion-task-12")
  const composer = page.getByTestId("chat-composer-region")
  await expect(composer).toHaveAttribute("data-placement", "center")
  const stopLayoutTrace = await startDevToolsLayoutTrace(page)
  await page.getByRole("textbox", { name: "의료 질문" }).fill("움직임 중에도 중지할 수 있나요")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(composer).toHaveAttribute("data-placement", "bottom")
  const streaming = page.locator("article[data-streaming='true']")
  await expect(streaming).toContainText("응답을 준비하고 있습니다.")
  const streamingAnimations = await streaming.evaluate((element) =>
    element.getAnimations({ subtree: true }).map((animation) => {
      const effect = animation.effect
      return {
        iterations: effect instanceof KeyframeEffect ? effect.getTiming().iterations : undefined,
        properties: [
          ...new Set(
            effect instanceof KeyframeEffect
              ? effect.getKeyframes().flatMap((keyframe) => Object.keys(keyframe))
              : [],
          ),
        ],
        target:
          effect instanceof KeyframeEffect && effect.target instanceof Element
            ? effect.target.hasAttribute("data-assistant-marker")
              ? "assistant-marker"
              : effect.target.tagName.toLowerCase()
            : "unknown",
      }
    }),
  )
  const markerAnimations = streamingAnimations.filter(
    (animation) => animation.target === "assistant-marker",
  )
  expect(markerAnimations).toHaveLength(mode === "normal" ? 1 : 0)
  if (mode === "normal") {
    expect(markerAnimations[0]?.properties).toContain("opacity")
    expect(markerAnimations[0]?.iterations).toBe(Number.POSITIVE_INFINITY)
  }
  expect(
    streamingAnimations.filter((animation) => animation.target !== "assistant-marker"),
  ).toEqual([])
  await page.getByRole("button", { name: "응답 중지" }).click()
  await expect(page.getByRole("button", { name: "응답 중지" })).toHaveCount(0)

  await page.getByRole("button", { name: "새 대화" }).click()
  await expect(composer).toHaveAttribute("data-placement", "center")
  await page.getByRole("textbox", { name: "의료 질문" }).fill("근거 출처를 확인해 주세요")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-continue")))
  await expect(page.getByRole("heading", { name: "아기 상태 확인" })).toBeVisible()
  await page.getByRole("button", { name: "출처 1개 보기" }).click()
  await expect(page.getByRole("link", { name: /신생아 수유와 게워냄/u })).toBeVisible()
  await page
    .locator("[data-chat-state]")
    .evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    )
  const layoutTrace = await stopLayoutTrace()
  for (const width of CAPTURE_WIDTHS) {
    await page.setViewportSize({ height: 812, width })
    await assertChatGeometry(page)
    await assertActiveCjkGeometry(page)
    await page.locator("[role='log'] > div").evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.screenshot({ path: resolve(evidenceRoot, `staging-${mode}-chat-${width}.png`) })
  }
  return { layoutTrace, runtime: await runtimeReport(page) }
}

async function exerciseAttachments(page: import("@playwright/test").Page) {
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto("/motion-attachments-task-12")
  await page
    .locator("[data-motion-surface='screen']")
    .evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    )
  await page
    .getByLabel("사진 보관함에서 선택")
    .setInputFiles("tests/fixtures/images/oriented-6.jpg")
  await expect(page.getByTestId("thumbnail-motion")).toHaveCount(1)
  await expect(page.getByText("첨부 완료", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "oriented-6.jpg 제거" }).click()
  await expect(page.getByTestId("thumbnail-motion")).toHaveCount(0)
  await page
    .getByLabel("사진 보관함에서 선택")
    .setInputFiles("tests/fixtures/images/oriented-6.jpg")
  await expect(page.getByTestId("thumbnail-motion")).toHaveCount(1)
  await expect(page.getByText("첨부 완료", { exact: true })).toBeVisible()
  return runtimeReport(page)
}

export async function runMotionMode(
  browser: import("@playwright/test").Browser,
  mode: MotionMode,
  stagingRoot: string,
) {
  const videoRoot = resolve(stagingRoot, "video")
  await mkdir(videoRoot, { recursive: true })
  const context = await browser.newContext({
    recordVideo: { dir: videoRoot, size: { height: 812, width: 375 } },
    reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
    viewport: { height: 812, width: 375 },
  })
  const page = await context.newPage()
  await installRuntimeAudit(page)
  const keypadReport = await exerciseKeypad(page, mode)
  const chatResult = await exerciseChat(page, mode)
  const attachmentReport = await exerciseAttachments(page)
  const report = {
    longTasks: [
      ...keypadReport.longTasks,
      ...chatResult.runtime.longTasks,
      ...attachmentReport.longTasks,
    ],
    records: [...keypadReport.records, ...chatResult.runtime.records, ...attachmentReport.records],
  }
  await writeFile(
    resolve(stagingRoot, `${mode}-runtime.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  expectCompositedOnly(report.records)
  expect(report.longTasks.filter((duration) => duration > 50)).toEqual([])
  if (mode === "normal") {
    expect(report.records.some((record) => record.target === "source")).toBe(true)
    expect([...new Set(report.records.map((record) => record.target))]).toContain(
      "thumbnail-motion",
    )
  } else {
    for (const record of report.records) {
      expect(record.properties).not.toContain("transform")
      expect(record.properties).not.toContain("filter")
      expect(record.delay).toBe(0)
    }
  }
  const layoutTrace = chatResult.layoutTrace
  expect(layoutTrace.summary.layout.eventCount).toBeLessThanOrEqual(
    LAYOUT_TRACE_BUDGET.layoutEventCount,
  )
  expect(layoutTrace.summary.layout.totalDurationMs).toBeLessThanOrEqual(
    LAYOUT_TRACE_BUDGET.totalLayoutDurationMs,
  )
  expect(layoutTrace.summary.layout.maximumDurationMs).toBeLessThanOrEqual(
    LAYOUT_TRACE_BUDGET.maximumLayoutDurationMs,
  )
  expect(layoutTrace.summary.style.totalDurationMs).toBeLessThanOrEqual(
    LAYOUT_TRACE_BUDGET.totalStyleDurationMs,
  )
  expect(layoutTrace.summary.forcedLayout.durationMs).toBeLessThanOrEqual(
    LAYOUT_TRACE_BUDGET.forcedLayoutDurationMs,
  )
  await writeFile(
    resolve(stagingRoot, `${mode}-devtools-trace.json.gz`),
    layoutTrace.compressedTrace,
  )
  await writeFile(
    resolve(stagingRoot, `${mode}-layout-summary.json`),
    `${JSON.stringify(layoutTrace.summary, null, 2)}\n`,
  )
  const video = page.video()
  await page.close()
  await context.close()
  if (video === null) throw new TypeError(`${mode} video was not recorded`)
  await video.saveAs(resolve(stagingRoot, `${mode}-video.webm`))
  await video.delete()
  await rm(videoRoot, { force: true, recursive: true })
}
