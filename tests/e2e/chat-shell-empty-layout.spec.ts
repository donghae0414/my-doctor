import { expect, test } from "@playwright/test"

import { assertChatGeometry } from "./chat-shell-layout"

test.use({ contextOptions: { reducedMotion: "reduce" } })

test.describe("welcome reveal", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" }, hasTouch: true })

  test("keeps mobile text wrapping and composer geometry fixed while typing, sending and reentering", async ({
    page,
  }, testInfo) => {
    await page.clock.install({ time: 0 })
    await page.clock.pauseAt(100)
    const input = page.getByRole("textbox", { name: "의료 질문" })
    const copies = page.locator("[data-welcome-text]")
    const measure = () =>
      page.evaluate(() => {
        const root = document.querySelector("[data-chat-state]")
        const form = document.querySelector("form")
        if (!root || !form) throw new Error("Missing chat layout")
        const origin = root.getBoundingClientRect()
        const bounds = (element: Element) => {
          const box = element.getBoundingClientRect()
          return [box.x - origin.x, box.y - origin.y, box.width, box.height]
        }
        return {
          form: bounds(form),
          graphemes: [...document.querySelectorAll("[data-welcome-text] > span")].map(bounds),
        }
      })

    for (const width of [375, 188]) {
      await page.setViewportSize({ width, height: 812 })
      await page.goto("/chat-shell-task-10")
      await input.fill("draft")
      await expect(page.getByRole("button", { name: "질문 보내기" })).toBeEnabled()
      await page.evaluate(() => document.fonts.ready)
      const image = page.locator("img[src='/images/babyface.png']")
      await image.evaluate((element: HTMLImageElement) => element.decode())
      const original = await measure()
      await expect(copies).toHaveCount(2)
      for (const copy of await copies.all()) {
        await expect(copy.locator("span").first()).toHaveCSS("opacity", "0")
      }
      await page.clock.runFor(700)
      for (const copy of await copies.all()) {
        await expect(copy.locator("span").first()).toHaveCSS("opacity", "1")
        await expect(copy.locator("span").last()).toHaveCSS("opacity", "0")
      }
      expect(await measure()).toEqual(original)
      await page.screenshot({ path: testInfo.outputPath(`welcome-${width}-half.png`) })
      await page.clock.runFor(700)
      for (const copy of await copies.all()) {
        await expect(copy.locator("span").last()).toHaveCSS("opacity", "1")
      }
      expect(await measure()).toEqual(original)
      const imageStyle = await image.evaluate((element: HTMLImageElement) => ({
        width: element.width,
        height: element.height,
        originalWidth: element.naturalWidth,
        originalHeight: element.naturalHeight,
        fit: getComputedStyle(element).objectFit,
        background: getComputedStyle(element.parentElement ?? element).backgroundColor,
        border: getComputedStyle(element).borderWidth,
        headingGap:
          (element.parentElement?.nextElementSibling?.getBoundingClientRect().top ?? 0) -
          element.getBoundingClientRect().bottom,
      }))
      expect(imageStyle).toEqual({
        width: 96,
        height: 96,
        originalWidth: 1254,
        originalHeight: 1254,
        fit: "contain",
        background: "rgba(0, 0, 0, 0)",
        border: "0px",
        headingGap: 16,
      })
      await testInfo.attach(`welcome-${width}-geometry`, {
        body: JSON.stringify({ ...original, imageStyle }),
        contentType: "application/json",
      })
      await page.screenshot({ path: testInfo.outputPath(`welcome-${width}-complete.png`) })
    }

    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await input.fill("[pending]")
    await page.clock.runFor(700)
    await expect(copies.last().locator("span").last()).toHaveCSS("opacity", "0")
    await page.getByRole("button", { name: "질문 보내기" }).click()
    await expect(page.getByTestId("chat-composer-region")).toHaveAttribute(
      "data-placement",
      "bottom",
    )
    await expect(page.locator("[data-pending-response]")).toBeVisible()
    await page.getByRole("button", { name: "새 대화" }).click()
    for (const copy of await copies.all()) {
      await expect(copy.locator("span").last()).toHaveCSS("opacity", "1")
    }
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.reload()
    await expect(copies).toHaveCount(2)
    for (const copy of await copies.all()) {
      await expect(copy.locator("span").first()).toHaveCSS("opacity", "1")
      await expect(copy.locator("span").last()).toHaveCSS("opacity", "1")
    }
  })
})

for (const theme of ["light", "dark"]) {
  for (const width of [375, 768, 1280]) {
    test(`centers the input card on the viewport at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      // Given the empty real chat surface at a required viewport.
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/chat-shell-task-10?theme=${theme}`)
      const region = page.getByTestId("chat-composer-region")
      await expect(page.locator("[data-empty-state='conversation']")).toBeVisible()
      await page.evaluate(() => document.fonts.ready)

      // Then the form itself is centered, with the intro above and disclaimer below.
      const geometry = await region.evaluate((element) => {
        const intro = document.querySelector("[data-empty-state='conversation']")
        const title = intro?.querySelector("p")
        const icon = intro?.querySelector("span")
        const form = element.querySelector("form")
        const disclaimer = form?.parentElement?.lastElementChild
        if (!title || !icon || !form || !disclaimer) throw new Error("Missing empty stack")
        const titleBounds = title.getBoundingClientRect()
        const formBounds = form.getBoundingClientRect()
        const iconBounds = icon.getBoundingClientRect()
        return {
          centerDelta: (formBounds.top + formBounds.bottom - innerHeight) / 2,
          formTop: formBounds.top,
          formBottom: formBounds.bottom,
          viewportHeight: innerHeight,
          disclaimerGap: disclaimer.getBoundingClientRect().top - formBounds.bottom,
          gap: formBounds.top - titleBounds.bottom,
          iconBottom: iconBounds.bottom,
          titleTop: titleBounds.top,
          centers: [iconBounds, titleBounds, formBounds].map((rect) => rect.left + rect.width / 2),
        }
      })
      expect(Math.abs(geometry.centerDelta)).toBeLessThanOrEqual(0.5)
      expect(geometry.disclaimerGap).toBe(8)
      expect(geometry.gap).toBe(24)
      expect(geometry.iconBottom).toBeLessThan(geometry.titleTop)
      expect(Math.max(...geometry.centers) - Math.min(...geometry.centers)).toBeLessThanOrEqual(1)
      await assertChatGeometry(page)
      await testInfo.attach("geometry", {
        body: JSON.stringify(geometry),
        contentType: "application/json",
      })
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath("empty.png"),
        fullPage: true,
      })
    })
  }
}

test("keeps the composer slot while first send removes the intro and restores the bottom row", async ({
  page,
}, testInfo) => {
  // Given a composed question in the empty stack.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/chat-shell-task-10")
  const region = page.getByTestId("chat-composer-region")
  const input = page.getByRole("textbox", { name: "의료 질문" })
  await input.fill("[pending]")
  const slot = await region.locator("form").evaluateHandle((form) => form.parentElement)
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("before-send.png") })

  // When sending through the existing desktop keyboard surface.
  await input.press("Enter")

  // Then the intro is gone, the slot is stable, and active scroll ownership is unchanged.
  await expect(region).toHaveAttribute("data-placement", "bottom")
  await expect(page.locator("[data-empty-state='conversation']")).toHaveCount(0)
  expect(
    await region
      .locator("form")
      .evaluate((form, previous) => form.parentElement === previous, slot),
  ).toBe(true)
  const placement = await region.evaluate((element) => {
    const conversation = document.querySelector("[data-scroll-owner='conversation']")
    if (!conversation) throw new Error("Missing active scroll owner")
    return {
      top: element.getBoundingClientRect().top,
      bottom: element.getBoundingClientRect().bottom,
      conversationBottom: conversation.getBoundingClientRect().bottom,
      height: innerHeight,
      overflow: getComputedStyle(element).overflowY,
    }
  })
  expect(placement.top).toBe(placement.conversationBottom)
  expect(placement.bottom).toBe(placement.height)
  expect(placement.overflow).not.toBe("auto")
  await assertChatGeometry(page)
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("after-send.png") })
  await page.getByRole("button", { name: "응답 중지" }).click()
})

test("keeps focus and input identity as attachment previews replace the intro", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/chat-shell-task-10")
  const input = page.getByRole("textbox", { name: "의료 질문" })
  await input.fill("draft")
  const original = await input.elementHandle()
  await page
    .getByLabel("사진 보관함에서 선택")
    .setInputFiles("tests/fixtures/images/task13-valid.jpg")
  await expect(page.getByTestId("image-preview-grid")).toBeVisible()
  await expect(page.locator("[data-empty-state='conversation']")).toHaveCount(0)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue("draft")
  expect(await input.evaluate((element, previous) => element === previous, original)).toBe(true)
  await page.getByRole("button", { name: "task13-valid.jpg 제거" }).click()
  await expect(page.locator("[data-empty-state='conversation']")).toBeVisible()
  expect(await input.evaluate((element, previous) => element === previous, original)).toBe(true)
})

test("keeps the empty composer visible when only the visual viewport changes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => {
    const viewport = window.visualViewport
    if (!viewport) throw new Error("VisualViewport is unavailable")
    Object.defineProperties(viewport, {
      height: { configurable: true, value: innerHeight, writable: true },
      offsetTop: { configurable: true, value: 0, writable: true },
    })
  })
  await page.goto("/chat-shell-task-10")
  await page.evaluate(() => document.fonts.ready)
  const input = page.getByRole("textbox", { name: "의료 질문" })
  await input.fill("draft")
  await input.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(1, 3))
  const originalInput = await input.elementHandle()
  const originalForm = await page.getByRole("form").elementHandle()

  for (const [height, offsetTop, event] of [
    [650, 0, "resize"],
    [360, 50, "resize"],
    [360, 90, "scroll"],
    [812, 0, "resize"],
  ] as const) {
    // Subscribe before dispatch; the application alone must move its empty scroll root.
    await page.evaluate(
      ({ height, offsetTop, event }) => {
        const viewport = window.visualViewport
        const root = document.querySelector<HTMLElement>("[data-chat-state='empty']")
        if (!viewport || !root) throw new Error("Missing empty visual viewport layout")
        return new Promise<void>((resolve, reject) => {
          const observer = new MutationObserver(() => {
            if (root.style.height !== `${height}px` || root.style.top !== `${offsetTop}px`) return
            clearTimeout(timeout)
            observer.disconnect()
            resolve()
          })
          const timeout = setTimeout(() => {
            observer.disconnect()
            reject(new Error("Empty layout did not adopt the visual viewport"))
          }, 5000)
          observer.observe(root, { attributes: true, attributeFilter: ["style"] })
          Object.assign(viewport, { height, offsetTop })
          viewport.dispatchEvent(new Event(event))
        })
      },
      { height, offsetTop, event },
    )

    const geometry = await page.getByRole("form").evaluate((form) => {
      const root = document.querySelector<HTMLElement>("[data-chat-state='empty']")
      const send = form.querySelector("button[type='submit']")
      if (!root || !send) throw new Error("Missing empty composer controls")
      const formBounds = form.getBoundingClientRect()
      const sendBounds = send.getBoundingClientRect()
      const rootBounds = root.getBoundingClientRect()
      return {
        layoutHeight: innerHeight,
        rootHeight: rootBounds.height,
        rootTop: rootBounds.top,
        formTop: formBounds.top,
        formBottom: formBounds.bottom,
        sendTop: sendBounds.top,
        sendBottom: sendBounds.bottom,
        scrollTop: root.scrollTop,
        documentScrollTop: document.documentElement.scrollTop,
      }
    })
    expect(geometry.layoutHeight).toBe(812)
    expect(geometry.rootHeight).toBe(height)
    expect(geometry.rootTop).toBe(offsetTop)
    expect(geometry.formTop).toBeGreaterThanOrEqual(offsetTop)
    expect(geometry.formBottom).toBeLessThanOrEqual(offsetTop + height)
    expect(geometry.sendTop).toBeGreaterThanOrEqual(offsetTop)
    expect(geometry.sendBottom).toBeLessThanOrEqual(offsetTop + height)
    expect(geometry.documentScrollTop).toBe(0)
    if (height === 360) expect(geometry.scrollTop).toBeGreaterThan(0)
    else
      expect(
        Math.abs((geometry.formTop + geometry.formBottom) / 2 - offsetTop - height / 2),
      ).toBeLessThanOrEqual(0.5)
    await expect(input).toBeFocused()
    await expect(input).toHaveValue("draft")
    expect(await input.evaluate((element, previous) => element === previous, originalInput)).toBe(
      true,
    )
    expect(
      await page
        .getByRole("form")
        .evaluate((element, previous) => element === previous, originalForm),
    ).toBe(true)
    expect(
      await input.evaluate((element: HTMLTextAreaElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    ).toEqual([1, 3])
    await expect(page.locator("[data-empty-state='conversation']")).toHaveCount(1)
    await assertChatGeometry(page)
  }
})

test("prioritizes reachable content over centering when the focused viewport shrinks", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/chat-shell-task-10")
  const region = page.getByTestId("chat-composer-region")
  const input = page.getByRole("textbox", { name: "의료 질문" })
  await input.fill("draft")
  await page.evaluate(() => document.fonts.ready)
  const original = await input.elementHandle()
  for (const height of [650, 600, 400]) {
    await page.setViewportSize({ width: 375, height })
    await expect(page.locator("[data-scroll-owner='empty-chat']")).toHaveCSS(
      "height",
      `${height}px`,
    )
    const geometry = await region.evaluate((element) => {
      const form = element.querySelector("form")
      const intro = document.querySelector("[data-empty-state='conversation']")
      const header = document.querySelector("header")
      const root = document.querySelector("[data-scroll-owner='empty-chat']")
      if (!form || !intro || !header || !root) throw new Error("Missing empty layout")
      const formBounds = form.getBoundingClientRect()
      return {
        centerDelta: (formBounds.top + formBounds.bottom - innerHeight) / 2,
        introTop: intro.getBoundingClientRect().top,
        headerBottom: header.getBoundingClientRect().bottom,
        gap: formBounds.top - intro.getBoundingClientRect().bottom,
        scrollable: root.scrollHeight > root.clientHeight,
      }
    })
    if (height === 650) expect(Math.abs(geometry.centerDelta)).toBeLessThanOrEqual(0.5)
    else expect(geometry.centerDelta).toBeGreaterThan(0)
    expect(geometry.introTop).toBeGreaterThanOrEqual(geometry.headerBottom + 16)
    expect(geometry.gap).toBe(24)
    expect(geometry.scrollable).toBe(height === 400)
    await expect(input).toBeFocused()
    await expect(input).toHaveValue("draft")
    expect(await input.evaluate((element, previous) => element === previous, original)).toBe(true)
    await assertChatGeometry(page)
    await testInfo.attach(`height-${height}-geometry`, {
      body: JSON.stringify({ viewportHeight: height, ...geometry }),
      contentType: "application/json",
    })
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`height-${height}.png`),
    })
  }
})

for (const viewport of [
  { width: 375, height: 320 },
  { width: 188, height: 406 },
]) {
  test(`keeps an overflowing empty stack keyboard reachable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto("/chat-shell-task-10")
    const region = page.locator("[data-scroll-owner='empty-chat']")
    const input = page.getByRole("textbox", { name: "의료 질문" })
    await expect(input).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const start = await region.evaluate((element) => {
      const header = element.querySelector("header")
      const intro = element.querySelector("[data-empty-state='conversation']")
      const form = element.querySelector("form")
      if (!header || !intro || !form) throw new Error("Missing empty layout")
      return {
        top: element.getBoundingClientRect().top,
        headerTop: header.getBoundingClientRect().top,
        headerBottom: header.getBoundingClientRect().bottom,
        introTop: intro.getBoundingClientRect().top,
        gap: form.getBoundingClientRect().top - intro.getBoundingClientRect().bottom,
        scrollable: element.scrollHeight > element.clientHeight,
      }
    })
    expect(start.headerTop).toBe(start.top)
    expect(start.introTop).toBeGreaterThanOrEqual(start.headerBottom + 16)
    expect(start.gap).toBe(24)
    expect(start.scrollable).toBe(true)
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("top-reachable.png"),
    })
    await input.fill("draft")
    for (const { control, key } of [
      { control: page.getByRole("button", { name: "사진 첨부" }), key: "Shift+Tab" },
      { control: input, key: "Tab" },
      { control: page.getByRole("button", { name: /^모델 /u }), key: "Tab" },
      { control: page.getByRole("button", { name: "질문 보내기" }), key: "Tab" },
    ]) {
      await page.keyboard.press(key)
      await expect(control).toBeFocused()
      const box = await control.boundingBox()
      if (!box) throw new Error("Missing focused control")
      expect(box.y).toBeGreaterThanOrEqual(start.top)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath("keyboard-reachable.png"),
    })
  })
}
