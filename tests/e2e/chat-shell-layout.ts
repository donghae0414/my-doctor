import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

export async function assertChatGeometry(page: Page): Promise<void> {
  // Measure the settled shell, not an arbitrary frame of its entrance/layout spring.
  for (const selector of ["[data-chat-state]", "[data-testid='chat-composer-region'] form"]) {
    await page.locator(selector).evaluate((element) => {
      const target = element.tagName === "FORM" ? element.parentElement?.parentElement : element
      if (!target) throw new Error("Missing motion surface")
      return new Promise<void>((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (getComputedStyle(target).transform !== "none") return
          clearTimeout(timeout)
          observer.disconnect()
          resolve()
        })
        const timeout = setTimeout(() => {
          observer.disconnect()
          reject(new Error("Chat motion did not settle"))
        }, 5000)
        observer.observe(target, { attributes: true, attributeFilter: ["style"] })
        if (getComputedStyle(target).transform === "none") {
          clearTimeout(timeout)
          observer.disconnect()
          resolve()
        }
      })
    })
  }
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-chat-state]")
    const composer = document.querySelector<HTMLElement>("[data-testid='chat-composer-region']")
    const isEmpty = root?.dataset["chatState"] === "empty"
    const viewport = isEmpty && window.visualViewport?.scale === 1 ? window.visualViewport : null
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportHeight = viewport?.height ?? window.innerHeight
    const scrollOwners = document.querySelectorAll("[data-scroll-owner='conversation']")
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        "button,textarea,a[href],[role='menuitem'],[role='menuitemradio']",
      ),
    ]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          scrollable:
            element.closest("[data-scroll-owner='conversation']") !== null ||
            (isEmpty && element.closest("form") === null && root.contains(element)),
          top: rect.top,
          width: rect.width,
        }
      })
    const assistantBody = document.querySelector<HTMLElement>(
      "article[data-from='assistant'] > div",
    )
    const composerColumn = composer?.querySelector<HTMLElement>(":scope > div")
    return {
      assistantBodyLeft: assistantBody?.getBoundingClientRect().left,
      composerBottom: (isEmpty
        ? composer?.querySelector("form")
        : composer
      )?.getBoundingClientRect().bottom,
      composerColumnLeft: composerColumn?.getBoundingClientRect().left,
      controls,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rootHeight: root?.getBoundingClientRect().height,
      rootTop: root?.getBoundingClientRect().top,
      scrollOwners: scrollOwners.length,
      viewportBottom: viewportTop + viewportHeight,
      viewportHeight,
      viewportTop,
      viewportWidth: document.documentElement.clientWidth,
    }
  })

  expect(result.documentOverflow).toBe(false)
  expect(result.scrollOwners).toBe(1)
  // Once a reply exists, assistant text starts on the composer's inline-start edge.
  if (result.assistantBodyLeft !== undefined) {
    if (result.composerColumnLeft === undefined) throw new TypeError("composer column is missing")
    expect(Math.abs(result.assistantBodyLeft - result.composerColumnLeft)).toBeLessThanOrEqual(1)
  }
  expect(result.rootHeight).toBe(result.viewportHeight)
  expect(result.rootTop).toBe(result.viewportTop)
  expect(result.composerBottom).toBeLessThanOrEqual(result.viewportBottom)
  expect(
    result.controls.filter(
      ({ bottom, height, left, right, scrollable, top, width }) =>
        height < 43.5 ||
        width < 43.5 ||
        left < -1 ||
        right > result.viewportWidth + 1 ||
        (!scrollable && (top < result.viewportTop - 1 || bottom > result.viewportBottom + 1)),
    ),
  ).toEqual([])
}

export async function assertActiveCjkGeometry(
  page: Page,
  { allowWrappedDisclaimer = false }: { readonly allowWrappedDisclaimer?: boolean } = {},
): Promise<void> {
  const result = await page.evaluate(() => {
    const scrollBody = document.querySelector<HTMLElement>("[role='log'] > div")
    const composer = document.querySelector<HTMLElement>("[data-testid='chat-composer-region']")
    const medicalDisclaimer = [...document.querySelectorAll<HTMLElement>("*")].find(
      (element) => element.textContent === "AI는 틀릴 수 있어요. 의료 판단은 의료진과 확인하세요.",
    )
    if (scrollBody === null || composer === null || medicalDisclaimer === undefined)
      return { missing: true }
    const bodyRect = scrollBody.getBoundingClientRect()
    const clippedText = [...scrollBody.querySelectorAll<HTMLElement>("article h2, article p")]
      .filter((element) => element.getClientRects().length > 0)
      .flatMap((element, index) => {
        const rect = element.getBoundingClientRect()
        return rect.left < bodyRect.left - 1 || rect.right > bodyRect.right + 1 ? [index] : []
      })
    const composerRect = composer.getBoundingClientRect()
    const lineCount = (element: HTMLElement) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
    }
    return {
      clippedText,
      copyLines: {
        medicalDisclaimer: lineCount(medicalDisclaimer),
      },
      composerReachable: composerRect.top < window.innerHeight && composerRect.bottom > 0,
      horizontalOverflow: scrollBody.scrollWidth > scrollBody.clientWidth,
      missing: false,
    }
  })

  expect(result).toEqual({
    clippedText: [],
    copyLines: {
      medicalDisclaimer: expect.any(Number),
    },
    composerReachable: true,
    horizontalOverflow: false,
    missing: false,
  })
  if (result.missing === false && result.copyLines !== undefined) {
    if (allowWrappedDisclaimer) {
      expect(result.copyLines.medicalDisclaimer).toBeGreaterThan(1)
    } else {
      expect(result.copyLines.medicalDisclaimer).toBe(1)
    }
  }
}

export async function nextAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
}
