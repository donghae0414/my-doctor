import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"

export async function assertKoreanSemanticWrapping(page: Page): Promise<void> {
  const expected = [
    "접근할 수 있습니다.",
    "함께 살펴보는",
    "함께",
    "안내는",
    "보호자 안내",
    "있습니다",
    "소변 횟수도",
    "질문과",
    "함께 살펴보세요.",
    "체중 증가를",
    "남아 있습니다",
    "근거 자료",
    "항상",
    "현재",
    "있습니다.",
  ]
  const phrases = page.locator("[data-semantic-phrase]")
  expect(await phrases.count()).toBe(expected.length)
  for (const phrase of expected) await expect(page.locator(`[data-semantic-phrase="${phrase}"]`)).toHaveText(phrase)
  const fragmented = await phrases.evaluateAll((elements) =>
    elements.flatMap((element, index) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
      return lines.size === 1 ? [] : [{ index, lines: lines.size }]
    }),
  )
  expect(fragmented).toEqual([])
}

export async function assertAttachmentStatusGeometry(page: Page): Promise<void> {
  const statusLocator = page.locator("figcaption [data-keep-phrase]").filter({ hasText: "이미지 처리 중" })
  const spinnerLocator = page.locator("[title='이미지 처리 중']")
  const statusBox = await statusLocator.boundingBox()
  const spinnerBox = await spinnerLocator.boundingBox()
  expect(statusBox).not.toBeNull()
  expect(spinnerBox).not.toBeNull()
  if (statusBox === null || spinnerBox === null) throw new Error("missing attachment geometry")
  const status = statusBox
  const spinner = spinnerBox
  const intersects = (status.x < spinner.x + spinner.width && spinner.x < status.x + status.width && status.y < spinner.y + spinner.height && spinner.y < status.y + status.height)
  expect(intersects).toBe(false)
}

export async function assertSourceTitleWrapping(page: Page): Promise<void> {
  const titles = page.locator("[data-source-title]")
  expect(await titles.count()).toBe(2)
  const defects = await titles.evaluateAll((elements) =>
    elements.flatMap((element, titleIndex) => {
      const node = element.firstChild
      if (!(node instanceof Text) || element.getClientRects().length === 0) {
        return [{ kind: "missing-visible-text", titleIndex }]
      }
      return [...node.data.matchAll(/\S+/gu)].flatMap((match, tokenIndex) => {
        const start = match.index
        if (start === undefined) return [{ kind: "missing-token-offset", titleIndex, tokenIndex }]
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, start + match[0].length)
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
        return lines.size === 1 ? [] : [{ kind: "fragmented-token", titleIndex, tokenIndex }]
      })
    }),
  )
  expect(defects).toEqual([])
}
