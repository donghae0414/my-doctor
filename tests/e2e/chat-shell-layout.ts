import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

export async function assertChatGeometry(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-chat-state]")
    const composer = document.querySelector<HTMLElement>("[data-testid='chat-composer-region']")
    const scrollOwners = document.querySelectorAll("[data-scroll-owner='conversation']")
    const controls = [...document.querySelectorAll<HTMLElement>("button,select,textarea,a[href]")]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return { height: rect.height, right: rect.right, width: rect.width }
      })
    return {
      composerBottom: composer?.getBoundingClientRect().bottom,
      controls,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rootHeight: root?.getBoundingClientRect().height,
      scrollOwners: scrollOwners.length,
      viewportHeight: window.innerHeight,
      viewportWidth: document.documentElement.clientWidth,
    }
  })

  expect(result.documentOverflow).toBe(false)
  expect(result.scrollOwners).toBe(1)
  expect(result.rootHeight).toBe(result.viewportHeight)
  expect(result.composerBottom).toBeLessThanOrEqual(result.viewportHeight)
  expect(
    result.controls.filter(
      ({ height, right, width }) => height < 44 || width < 44 || right > result.viewportWidth + 1,
    ),
  ).toEqual([])
}

export async function assertActiveCjkGeometry(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const scrollBody = document.querySelector<HTMLElement>("[role='log'] > div")
    const composer = document.querySelector<HTMLElement>("[data-testid='chat-composer-region']")
    const effortLabel = [...document.querySelectorAll<HTMLElement>("label span")].find(
      (element) => element.textContent === "추론 강도",
    )
    if (scrollBody === null || composer === null || effortLabel === undefined)
      return { missing: true }
    const bodyRect = scrollBody.getBoundingClientRect()
    const clippedText = [...scrollBody.querySelectorAll<HTMLElement>("article h2, article p")]
      .filter((element) => element.getClientRects().length > 0)
      .flatMap((element, index) => {
        const rect = element.getBoundingClientRect()
        return rect.left < bodyRect.left - 1 || rect.right > bodyRect.right + 1 ? [index] : []
      })
    const composerRect = composer.getBoundingClientRect()
    const effortRange = document.createRange()
    effortRange.selectNodeContents(effortLabel)
    const effortLabelLines = new Set(
      [...effortRange.getClientRects()].map((rect) => Math.round(rect.top)),
    ).size
    return {
      clippedText,
      effortLabelLines,
      composerReachable: composerRect.top < window.innerHeight && composerRect.bottom > 0,
      horizontalOverflow: scrollBody.scrollWidth > scrollBody.clientWidth,
      missing: false,
    }
  })

  expect(result).toEqual({
    clippedText: [],
    effortLabelLines: 1,
    composerReachable: true,
    horizontalOverflow: false,
    missing: false,
  })
}

export async function nextAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
}
