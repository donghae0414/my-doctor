import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import type { ChatTransport, UIMessage } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithMotion as render } from "@/tests/render-with-motion"
import { ChatShell } from "./chat-shell"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("empty chat layout", () => {
  it("follows only the empty visual viewport without replacing the focused draft", async () => {
    const viewport = Object.assign(new EventTarget(), { height: 812, offsetTop: 0, scale: 1 })
    vi.stubGlobal("visualViewport", viewport)
    const subscribe = vi.spyOn(viewport, "addEventListener")
    const unsubscribe = vi.spyOn(viewport, "removeEventListener")
    const observers: TestResizeObserver[] = []
    class TestResizeObserver implements ResizeObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      constructor(readonly callback: ResizeObserverCallback) {
        observers.push(this)
      }
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver)
    const frames = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    const cancelFrame = vi.fn((id: number) => frames.delete(id))
    vi.stubGlobal("cancelAnimationFrame", cancelFrame)
    const flushFrame = () =>
      act(() => {
        const pending = [...frames.values()]
        frames.clear()
        for (const callback of pending) callback(performance.now())
      })
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages: () => new Promise(() => undefined),
    }
    const { unmount } = render(<ChatShell transport={transport} />)
    const root = screen.getByRole("main")
    const form = screen.getByRole("form")
    const input = screen.getByRole("textbox")
    if (!(input instanceof HTMLTextAreaElement)) throw new Error("Missing composer textarea")
    const actions = input.nextElementSibling
    if (!actions) throw new Error("Missing composer actions")
    const formObserver = observers.find((observer) => observer.observe.mock.calls[0]?.[0] === form)
    if (!formObserver) throw new Error("Missing composer size observer")
    let formTop = 310
    let formHeight = 116
    const top = () => viewport.offsetTop + formTop - root.scrollTop
    vi.spyOn(form, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(16, top(), 343, formHeight),
    )
    vi.spyOn(input, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(24, top() + formHeight - 108, 327, 48),
    )
    vi.spyOn(actions, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(24, top() + formHeight - 60, 327, 52),
    )
    fireEvent.change(input, { target: { value: "draft" } })
    act(() => input.focus())
    input.setSelectionRange(1, 3)

    // Only the visual viewport changes; window.innerHeight and the mounted form do not.
    const layoutHeight = window.innerHeight
    Object.assign(viewport, { height: 360, offsetTop: 60 })
    act(() => viewport.dispatchEvent(new Event("resize")))
    flushFrame()
    expect(root).toHaveStyle({
      position: "fixed",
      top: "60px",
      height: "360px",
      maxHeight: "360px",
    })
    expect(window.innerHeight).toBe(layoutHeight)
    expect(screen.getByRole("textbox")).toBe(input)
    expect(input).toHaveFocus()
    expect(input).toHaveValue("draft")
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])
    expect(screen.getByRole("form")).toBe(form)
    expect(root.scrollTop).toBe(66)
    expect(form.getBoundingClientRect().bottom).toBe(420)

    // Panning tracks the viewport offset, without adding a second correction.
    viewport.offsetTop = 90
    act(() => viewport.dispatchEvent(new Event("scroll")))
    flushFrame()
    expect(root.style.top).toBe("90px")
    expect(root.scrollTop).toBe(66)

    // Tall attachments prioritize the textarea and bottom controls, not the preview's top.
    formTop = 100
    formHeight = 520
    act(() => formObserver.callback([], formObserver))
    flushFrame()
    expect(root.scrollTop).toBe(252)
    expect(input.getBoundingClientRect().top).toBeGreaterThanOrEqual(viewport.offsetTop)
    expect(actions.getBoundingClientRect().bottom).toBe(viewport.offsetTop + viewport.height)

    // Do not fight manual browsing while the textarea is not focused; focus reentry corrects it.
    act(() => input.blur())
    root.scrollTop = 0
    act(() => formObserver.callback([], formObserver))
    flushFrame()
    expect(root.scrollTop).toBe(0)
    act(() => input.focus())
    flushFrame()
    expect(root.scrollTop).toBe(252)

    // Pinch zoom falls back to CSS and never scrolls the empty root on its behalf.
    viewport.scale = 2
    act(() => viewport.dispatchEvent(new Event("resize")))
    flushFrame()
    for (const property of ["position", "left", "right", "top", "height", "max-height"]) {
      expect(root.style.getPropertyValue(property)).toBe("")
    }
    expect(root.scrollTop).toBe(252)
    Object.assign(viewport, { scale: 1, height: 812, offsetTop: 0 })
    formTop = 310
    formHeight = 116
    act(() => viewport.dispatchEvent(new Event("resize")))
    flushFrame()
    expect(root).toHaveStyle({ top: "0px", height: "812px", maxHeight: "812px" })

    // First send cancels pending work and leaves the active conversation's CSS in charge.
    act(() => viewport.dispatchEvent(new Event("scroll")))
    const pendingFrame = frameId
    await act(async () => fireEvent.submit(form))
    expect(root).toHaveAttribute("data-chat-state", "active")
    expect(root.scrollTop).toBe(0)
    expect(root.style.height).toBe("")
    expect(root.style.position).toBe("")
    expect(formObserver.disconnect).toHaveBeenCalledOnce()
    expect(cancelFrame).toHaveBeenCalledWith(pendingFrame)
    for (const event of ["resize", "scroll"]) {
      const listener = subscribe.mock.calls.find(([name]) => name === event)?.[1]
      expect(unsubscribe).toHaveBeenCalledWith(event, listener)
    }
    const subscriptionCount = subscribe.mock.calls.length
    Object.assign(viewport, { height: 300, offsetTop: 20 })
    act(() => viewport.dispatchEvent(new Event("resize")))
    flushFrame()
    expect(root.style.height).toBe("")
    expect(subscribe).toHaveBeenCalledTimes(subscriptionCount)

    // New chat subscribes again, and unmount cancels a queued frame and removes its styles.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "새 대화" })))
    expect(root).toHaveStyle({ height: "300px", top: "20px" })
    expect(subscribe).toHaveBeenCalledTimes(subscriptionCount + 2)
    act(() => viewport.dispatchEvent(new Event("scroll")))
    const unmountFrame = frameId
    unmount()
    expect(cancelFrame).toHaveBeenCalledWith(unmountFrame)
    expect(unsubscribe).toHaveBeenCalledTimes(4)
    expect(root.style.height).toBe("")
    expect(root.style.position).toBe("")
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true)
  })

  it("keeps the intro before the stable composer slot until the first send", async () => {
    // Given an empty chat with the real composer and a held transport.
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages: () => new Promise(() => undefined),
    }
    render(<ChatShell transport={transport} />)
    const region = screen.getByTestId("chat-composer-region")
    const composer = screen.getByRole("form").parentElement
    const intro = document.querySelector<HTMLElement>("[data-empty-state='conversation']")
    expect(intro).not.toBeNull()
    expect(screen.getByRole("main")).toContainElement(intro)
    expect(intro?.compareDocumentPosition(screen.getByRole("form"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )

    // When the first message is submitted.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "question" } })
    await act(async () => fireEvent.submit(screen.getByRole("form")))

    // Then only the intro disappears; the composer slot moves without remounting.
    expect(screen.getByTestId("chat-composer-region")).toBe(region)
    expect(screen.getByRole("form").parentElement).toBe(composer)
    expect(region).toHaveAttribute("data-placement", "bottom")
    expect(document.querySelector("[data-empty-state='conversation']")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "응답 중지" })))
  })
})
