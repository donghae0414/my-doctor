import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai"
import { type ComponentProps, StrictMode } from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { renderWithMotion as render } from "@/tests/render-with-motion"
import { ChatComposer } from "./chat-composer"
import { ChatMessage } from "./chat-message"
import { ChatShell } from "./chat-shell"
import { MODEL_OPTIONS } from "./chat-types"

const motionMocks = vi.hoisted(() => ({ reduceMotion: false }))

vi.mock("motion/react", async (importOriginal) => {
  const original = await importOriginal<typeof import("motion/react")>()
  return {
    ...original,
    useReducedMotion: () => motionMocks.reduceMotion,
  }
})

vi.mock("streamdown", async (importOriginal) => {
  const original = await importOriginal<typeof import("streamdown")>()
  const ActualStreamdown = original.Streamdown
  return {
    ...original,
    Streamdown: ({ mode, ...props }: ComponentProps<typeof ActualStreamdown>) => (
      <div data-streamdown-mode={mode}>
        <ActualStreamdown {...(mode === undefined ? {} : { mode })} {...props} />
      </div>
    ),
  }
})

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  motionMocks.reduceMotion = false
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function stream(chunks: readonly UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function transportFor(chunks: readonly UIMessageChunk[]): ChatTransport<UIMessage> {
  return {
    reconnectToStream: async () => null,
    sendMessages: async () => stream(chunks),
  }
}

function assistantMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  }
}

const successfulChunks = [
  { type: "start", messageId: "assistant-1" },
  { type: "text-start", id: "answer" },
  { type: "text-delta", id: "answer", delta: "## 확인할 점\n아기의 체온을 확인해 주세요." },
  { type: "text-end", id: "answer" },
  {
    type: "source-url",
    sourceId: "safe-source",
    title: "신생아 체온 근거 자료",
    url: "https://example.com/medical-evidence",
  },
  {
    type: "source-url",
    sourceId: "unsafe-source",
    title: "표시되면 안 되는 출처",
    url: "javascript:alert(1)",
  },
  { type: "finish", finishReason: "stop" },
] satisfies readonly UIMessageChunk[]

describe("ChatShell", () => {
  it("reveals both welcome copies on one mount clock without blocking send or replaying on new chat", async () => {
    vi.useFakeTimers()
    const transport = transportFor(successfulChunks)
    const send = vi.spyOn(transport, "sendMessages")
    const { unmount } = render(
      <StrictMode>
        <ChatShell transport={transport} />
      </StrictMode>,
    )
    const copies = () => [...document.querySelectorAll("[data-welcome-text]")]
    const visibleCount = (copy: Element) =>
      [...copy.children].filter((grapheme) => (grapheme as HTMLElement).style.opacity === "1").length
    expect(copies()).toHaveLength(2)
    for (const copy of copies()) {
      expect(visibleCount(copy)).toBe(0)
      expect([...copy.children].map((child) => child.textContent)).toEqual(
        Array.from(
          new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(copy.textContent ?? ""),
          ({ segment }) => segment,
        ),
      )
    }
    act(() => vi.advanceTimersByTime(700))
    for (const copy of copies()) {
      expect(visibleCount(copy)).toBe(Math.floor(copy.children.length / 2))
    }
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "question" } })
    expect(screen.getByRole("button", { name: "질문 보내기" })).toBeEnabled()
    await act(async () => fireEvent.submit(screen.getByRole("form")))
    expect(send).toHaveBeenCalledOnce()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "새 대화" })))
    for (const copy of copies()) expect(visibleCount(copy)).toBe(copy.children.length)
    act(() => vi.advanceTimersByTime(700))
    for (const copy of copies()) expect(visibleCount(copy)).toBe(copy.children.length)
    unmount()
    render(<ChatShell transport={transport} />)
    for (const copy of copies()) expect(visibleCount(copy)).toBe(0)
    act(() => vi.advanceTimersByTime(1380))
    for (const copy of copies()) expect(visibleCount(copy)).toBeLessThan(copy.children.length)
    act(() => vi.advanceTimersByTime(20))
    for (const copy of copies()) expect(visibleCount(copy)).toBe(copy.children.length)
  })

  it("shows the complete welcome immediately under reduced motion", () => {
    motionMocks.reduceMotion = true
    render(<ChatShell transport={transportFor(successfulChunks)} />)
    const copies = [...document.querySelectorAll("[data-welcome-text]")]
    expect(copies).toHaveLength(2)
    for (const copy of copies) {
      for (const grapheme of copy.children) expect(grapheme).toHaveStyle({ opacity: "1" })
    }
  })

  it("rotates pending decoration on a four-second clock through empty streaming and resets each turn", async () => {
    vi.useFakeTimers()
    let controller!: ReadableStreamDefaultController<UIMessageChunk>
    render(
      <ChatShell
        transport={{
          reconnectToStream: async () => null,
          sendMessages: async () =>
            new ReadableStream({
              start(value) {
                controller = value
              },
            }),
        }}
      />,
    )
    const submit = async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "question" } })
      await act(async () => fireEvent.submit(screen.getByRole("form")))
    }
    await submit()
    const pending = document.querySelector("[data-pending-response]")
    expect(pending).not.toBeNull()
    expect(pending?.querySelectorAll("[data-pending-phrase]")).toHaveLength(3)
    expect(pending?.querySelector("[data-pending-phrase='0']")).toHaveAttribute(
      "data-active",
      "true",
    )
    expect(pending?.querySelector("[aria-hidden='true']")).not.toBeNull()
    const announcement = pending?.querySelector("[role='status']")?.textContent
    act(() => vi.advanceTimersByTime(3999))
    expect(pending?.querySelector("[data-pending-phrase='0']")).toHaveAttribute(
      "data-active",
      "true",
    )
    act(() => vi.advanceTimersByTime(1))
    expect(pending?.querySelector("[data-pending-phrase='1']")).toHaveAttribute(
      "data-active",
      "true",
    )
    await act(async () => {
      controller.enqueue({ type: "start", messageId: "empty-stream" })
      controller.enqueue({ type: "text-start", id: "answer" })
      controller.enqueue({ type: "source-url", sourceId: "source", url: "https://example.com" })
      controller.enqueue({ type: "text-delta", id: "answer", delta: "\n " })
    })
    expect(document.querySelector("[data-pending-response]")).toBe(pending)
    expect(document.querySelectorAll("[data-assistant-marker]")).toHaveLength(1)
    act(() => vi.advanceTimersByTime(4000))
    expect(pending?.querySelector("[data-pending-phrase='2']")).toHaveAttribute(
      "data-active",
      "true",
    )
    expect(pending?.querySelector("[role='status']")?.textContent).toBe(announcement)
    act(() => vi.advanceTimersByTime(4000))
    expect(pending?.querySelector("[data-pending-phrase='0']")).toHaveAttribute(
      "data-active",
      "true",
    )
    await act(async () => controller.enqueue({ type: "text-delta", id: "answer", delta: "Answer" }))
    expect(document.querySelector("[data-pending-response]")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "응답 중지" })))
    expect(document.querySelector("[data-assistant-marker]")).toBeNull()
    await submit()
    expect(document.querySelector("[data-pending-phrase='0']")).toHaveAttribute(
      "data-active",
      "true",
    )
    act(() => vi.advanceTimersByTime(4000))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "새 대화" })))
    expect(document.querySelector("[data-pending-response]")).toBeNull()
    await submit()
    expect(document.querySelector("[data-pending-phrase='0']")).toHaveAttribute(
      "data-active",
      "true",
    )
    await act(async () => controller.error(new Error("fixture")))
    expect(document.querySelector("[data-pending-response]")).toBeNull()
    expect(document.querySelector("[data-assistant-marker]")).toBeNull()
  })

  it("follows growing inner content, detaches on upward scroll and reattaches only on user return or send", async () => {
    let resized!: ResizeObserverCallback
    const observe = vi.fn()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resized = callback
        }
        observe = observe
        disconnect = vi.fn()
      },
    )
    render(<ChatShell transport={transportFor(successfulChunks)} />)
    const root = document.querySelector<HTMLElement>("[data-scroll-owner='conversation']")
    if (root === null) throw new Error("Missing conversation scroll owner")
    const inner = document.querySelector("[data-conversation-content]")
    expect(inner).not.toBeNull()
    expect(observe).toHaveBeenCalledWith(inner)
    expect(observe).not.toHaveBeenCalledWith(root)
    let height = 1000
    let top = 0
    Object.defineProperties(root, {
      scrollHeight: { get: () => height },
      clientHeight: { value: 300 },
      scrollTop: {
        get: () => top,
        set: (value: number) => {
          top = Math.max(0, Math.min(value, height - 300))
        },
      },
    })
    const grow = (next: number) => {
      height = next
      act(() => resized([], {} as ResizeObserver))
    }
    grow(1000)
    expect(root.scrollTop).toBe(700)
    root.scrollTop = 400
    fireEvent.scroll(root)
    grow(1200)
    expect(root.scrollTop).toBe(400)
    const latest = screen.getByRole("button", { name: "최신 메시지로 이동" })
    root.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      root.scrollTop = typeof options === "number" ? (y ?? 0) : (options?.top ?? 0)
    })
    fireEvent.click(latest)
    expect(root.scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 1200 })
    grow(1400)
    expect(root.scrollTop).toBe(1100)
    root.scrollTop = 400
    fireEvent.scroll(root)
    root.scrollTop = 1100
    fireEvent.scroll(root)
    grow(1600)
    expect(root.scrollTop).toBe(1300)
    root.scrollTop = 400
    fireEvent.scroll(root)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "question" } })
    await act(async () => fireEvent.submit(screen.getByRole("form")))
    grow(1800)
    expect(root.scrollTop).toBe(1500)
  })

  it.each([false, true])(
    "uses coarse/no-hover Enter as newline (%s), preserving desktop and IME input",
    async (mobile) => {
      const matchMedia = vi.fn((query: string) => ({
        matches: mobile && query === "(pointer: coarse) and (hover: none)",
      }))
      vi.stubGlobal("matchMedia", matchMedia)
      const user = userEvent.setup()
      const onSubmit = vi.fn()
      render(
        <ChatComposer
          effort="medium"
          model="gpt-5.6-sol"
          onEffortChange={vi.fn()}
          onHasAttachmentPreviews={vi.fn()}
          onModelChange={vi.fn()}
          onStop={vi.fn()}
          onSubmit={onSubmit}
          status="ready"
        />,
      )
      const input = screen.getByRole("textbox")
      await user.type(input, "first{Shift>}{Enter}{/Shift}second")
      fireEvent.keyDown(input, { key: "Enter", isComposing: true })
      expect(onSubmit).not.toHaveBeenCalled()
      await user.keyboard("{Enter}")
      if (mobile) {
        expect(input).toHaveValue("first\nsecond\n")
        expect(onSubmit).not.toHaveBeenCalled()
        await user.type(input, "third")
        await user.click(screen.getByRole("button", { name: "질문 보내기" }))
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ text: "first\nsecond\nthird" }),
        )
      } else {
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: "first\nsecond" }))
      }
    },
  )

  it("preserves interior user newlines in the message bubble", () => {
    render(
      <ChatMessage
        message={{ id: "multiline", role: "user", parts: [{ type: "text", text: "one\ntwo" }] }}
      />,
    )
    expect(screen.getByText(/one/u)).toHaveClass("whitespace-pre-wrap")
  })
  it("reveals the first grapheme immediately and accelerates from the queued backlog", () => {
    vi.useFakeTimers()
    render(<ChatMessage message={assistantMessage("assistant-cadence", "ABCDEFGH")} streaming />)

    const response = screen.getByText("A").closest("article")
    expect(response).not.toBeNull()
    expect(response).toHaveTextContent(/^A$/u)

    act(() => vi.advanceTimersByTime(4))
    expect(response).toHaveTextContent(/^A$/u)
    act(() => vi.advanceTimersByTime(1))
    expect(response).toHaveTextContent(/^AB$/u)

    act(() => vi.advanceTimersByTime(9))
    expect(response).toHaveTextContent(/^AB$/u)
    act(() => vi.advanceTimersByTime(1))
    expect(response).toHaveTextContent(/^ABC$/u)

    act(() => vi.advanceTimersByTime(15))
    expect(response).toHaveTextContent(/^ABCD$/u)
    act(() => vi.advanceTimersByTime(20))
    expect(response).toHaveTextContent(/^ABCDE$/u)
    act(() => vi.advanceTimersByTime(25))
    expect(response).toHaveTextContent(/^ABCDEF$/u)
    act(() => vi.advanceTimersByTime(30))
    expect(response).toHaveTextContent(/^ABCDEFG$/u)
    act(() => vi.advanceTimersByTime(30))
    expect(response).toHaveTextContent(/^ABCDEFGH$/u)
  })

  it("flushes terminal text and never replays it after reduced motion is disabled", () => {
    vi.useFakeTimers()
    const message = assistantMessage("assistant-terminal", "ABCDEFGH")
    const { rerender } = render(<ChatMessage message={message} streaming />)

    const response = screen.getByText("A").closest("article")
    expect(response).not.toBeNull()
    expect(response).toHaveTextContent(/^A$/u)

    motionMocks.reduceMotion = true
    rerender(<ChatMessage message={message} streaming />)
    expect(response).toHaveTextContent(/^ABCDEFGH$/u)
    expect(document.querySelector("[data-streamdown-mode='static']")).not.toBeNull()

    act(() => vi.advanceTimersByTime(1_000))
    expect(response).toHaveTextContent(/^ABCDEFGH$/u)

    motionMocks.reduceMotion = false
    rerender(<ChatMessage message={message} streaming />)
    expect(response).toHaveTextContent(/^ABCDEFGH$/u)
    expect(document.querySelector("[data-streamdown-mode='streaming']")).not.toBeNull()

    rerender(
      <ChatMessage message={assistantMessage("assistant-terminal", "ABCDEFGHI")} streaming />,
    )
    expect(response).toHaveTextContent(/^ABCDEFGHI$/u)
  })

  it("flushes a pending queue on normal completion and ignores stale timer callbacks", () => {
    vi.useFakeTimers()
    const message = assistantMessage("assistant-finish", "ABCDEFGHI")
    const { rerender } = render(<ChatMessage message={message} streaming />)

    const response = screen.getByText("A").closest("article")
    expect(response).toHaveTextContent(/^A$/u)
    expect(document.querySelector("[data-streamdown-mode='streaming']")).not.toBeNull()
    expect(document.querySelectorAll("[data-assistant-marker]")).toHaveLength(1)

    rerender(<ChatMessage message={message} streaming={false} />)
    expect(response).toHaveTextContent(/^ABCDEFGHI$/u)
    expect(document.querySelector("[data-streamdown-mode='static']")).not.toBeNull()
    expect(document.querySelectorAll("[data-assistant-marker]")).toHaveLength(0)

    act(() => vi.advanceTimersByTime(1_000))
    expect(response).toHaveTextContent(/^ABCDEFGHI$/u)
  })

  it("reconstructs pending graphemes after Strict Mode effect replay", () => {
    vi.useFakeTimers()
    render(
      <StrictMode>
        <ChatMessage message={assistantMessage("assistant-strict", "ABCDEFGH")} streaming />
      </StrictMode>,
    )

    const response = screen.getByText("A").closest("article")
    expect(response).toHaveTextContent(/^A$/u)
    act(() => vi.advanceTimersByTime(140))
    expect(response).toHaveTextContent(/^ABCDEFGH$/u)
  })

  it("clears a pending reveal timer when the message unmounts", () => {
    vi.useFakeTimers()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const { unmount } = render(
        <ChatMessage message={assistantMessage("assistant-unmount", "ABCDEFGH")} streaming />,
      )
      expect(screen.getByText("A")).toBeVisible()

      unmount()
      act(() => vi.advanceTimersByTime(1_000))
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it("resets queued text when the message identity or received prefix changes", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <ChatMessage message={assistantMessage("assistant-old", "OLD TEXT")} streaming />,
    )

    const response = screen.getByText("O").closest("article")
    expect(response).not.toBeNull()
    expect(response).toHaveTextContent(/^O$/u)

    rerender(<ChatMessage message={assistantMessage("assistant-new", "NEW")} streaming />)
    expect(response).toHaveTextContent(/^N$/u)
    act(() => vi.advanceTimersByTime(1_000))
    expect(response).toHaveTextContent(/^NEW$/u)

    rerender(<ChatMessage message={assistantMessage("assistant-new", "FIXED")} streaming />)
    expect(response).toHaveTextContent(/^F$/u)
    act(() => vi.advanceTimersByTime(1_000))
    expect(response).toHaveTextContent(/^FIXED$/u)
    expect(response).not.toHaveTextContent(/OLD/u)
  })

  it("prioritizes immediate display when a later delta extends the trailing grapheme", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <ChatMessage message={assistantMessage("assistant-grapheme", "ᄀ")} streaming />,
    )

    const response = screen.getByText("ᄀ").closest("article")
    expect(response).not.toBeNull()
    expect(response).toHaveTextContent(/^ᄀ$/u)

    rerender(<ChatMessage message={assistantMessage("assistant-grapheme", "가")} streaming />)
    expect(response?.textContent).toBe("가")

    rerender(<ChatMessage message={assistantMessage("assistant-grapheme", "👩")} streaming />)
    expect(response?.textContent).toBe("👩")
    rerender(<ChatMessage message={assistantMessage("assistant-grapheme", "👩‍")} streaming />)
    expect(response?.textContent).toBe("👩‍")
    rerender(<ChatMessage message={assistantMessage("assistant-grapheme", "👩‍⚕️")} streaming />)
    expect(response?.textContent).toBe("👩‍⚕️")
  })

  it("centers the initial composer with the selected model and effort menu defaults", async () => {
    const user = userEvent.setup()
    render(<ChatShell transport={transportFor(successfulChunks)} />)

    expect(screen.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
    expect(screen.getByTestId("chat-composer-region")).toHaveAttribute(
      "data-motion-surface",
      "composer",
    )
    const trigger = screen.getByRole("button", {
      name: "모델 GPT-5.6 Sol, 추론 강도 보통",
    })
    expect(trigger).toHaveTextContent("GPT-5.6 Sol · 보통")
    await user.click(trigger)
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3)
    expect(MODEL_OPTIONS.map((option) => option.value)).toEqual([
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
    ])
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual(
      MODEL_OPTIONS.map((option) => option.label),
    )
    expect(screen.getByRole("menuitemradio", { name: "GPT-5.6 Sol" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(screen.getByRole("menuitemradio", { name: "GPT-5.6 Luna" })).toHaveAttribute(
      "aria-checked",
      "false",
    )
    screen.getByRole("menuitem", { name: "추론 강도" }).focus()
    await user.keyboard("{ArrowRight}")
    expect(await screen.findByRole("menuitemradio", { name: "보통" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(9)
    expect(document.querySelector("[data-welcome-text='disclaimer']")).toBeVisible()
    expect(document.querySelector("[data-welcome-text='heading']")).toBeVisible()
    expect(document.querySelectorAll("[data-scroll-owner='conversation']")).toHaveLength(1)
  })

  it("keeps the root menu open for model selection and closes from an effort selection", async () => {
    const user = userEvent.setup()
    render(<ChatShell transport={transportFor(successfulChunks)} />)
    const trigger = screen.getByRole("button", {
      name: "모델 GPT-5.6 Sol, 추론 강도 보통",
    })

    await user.click(trigger)
    await user.click(screen.getByRole("menuitemradio", { name: "GPT-5.6 Terra" }))
    expect(screen.getByRole("menuitemradio", { name: "GPT-5.6 Terra" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(trigger).toHaveTextContent("GPT-5.6 Terra · 보통")

    screen.getByRole("menuitem", { name: "추론 강도" }).focus()
    await user.keyboard("{ArrowRight}")
    await user.keyboard("{End}{Enter}")
    await waitFor(() => expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAccessibleName("모델 GPT-5.6 Terra, 추론 강도 최대")
  })

  it("switches both menu sides as the composer moves and renders messages with safe sources", async () => {
    const user = userEvent.setup()
    render(<ChatShell transport={transportFor(successfulChunks)} />)

    for (const menuSide of ["bottom", "top"]) {
      if (menuSide === "top") {
        await user.type(
          screen.getByRole("textbox", { name: "의료 질문" }),
          "생후 3주 아기가 자주 토해요",
        )
        await user.click(screen.getByRole("button", { name: "질문 보내기" }))
      }
      for (const name of ["사진 첨부", /^모델 /u]) {
        await user.click(screen.getByRole("button", { name }))
        expect(screen.getByRole("menu")).toHaveAttribute("data-side", menuSide)
        await user.keyboard("{Escape}")
      }
    }

    expect(screen.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "bottom")
    expect(screen.getByText("생후 3주 아기가 자주 토해요").closest("article")).toHaveAttribute(
      "data-from",
      "user",
    )
    expect(await screen.findByRole("heading", { name: "확인할 점" })).toBeVisible()
    const assistantArticle = screen.getByRole("heading", { name: "확인할 점" }).closest("article")
    expect(assistantArticle).toHaveAttribute("data-from", "assistant")
    expect(assistantArticle?.querySelector(".bg-card")).toBeNull()
    expect(assistantArticle?.querySelector(".shadow-xs")).toBeNull()
    expect(
      screen
        .getByText("생후 3주 아기가 자주 토해요")
        .closest("article")
        ?.querySelector("[data-assistant-marker]"),
    ).toBeNull()
    expect(screen.getByRole("button", { name: /질문 보내기|응답 중지/u })).toHaveClass("bg-primary")
    await user.click(screen.getByRole("button", { name: "출처 1개 보기" }))
    expect(screen.getByRole("link", { name: "신생아 체온 근거 자료" })).toHaveAttribute(
      "href",
      "https://example.com/medical-evidence",
    )
    expect(screen.queryByText("표시되면 안 되는 출처")).not.toBeInTheDocument()
    expect(screen.queryByText(/<script/u)).not.toBeInTheDocument()
  })

  it("sanitizes malicious assistant HTML and Markdown links while preserving safe text", async () => {
    const user = userEvent.setup()
    const maliciousChunks = [
      { type: "start", messageId: "assistant-malicious" },
      { type: "text-start", id: "answer" },
      {
        type: "text-delta",
        id: "answer",
        delta:
          "안전한 의료 안내입니다. <script>window.__unsafe = true</script> [위험 링크](javascript:alert(1))",
      },
      { type: "text-end", id: "answer" },
      { type: "finish", finishReason: "stop" },
    ] satisfies readonly UIMessageChunk[]
    const { container } = render(<ChatShell transport={transportFor(maliciousChunks)} />)

    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "안전성 확인")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    expect(await screen.findByText(/안전한 의료 안내입니다/u)).toBeVisible()
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("a[href^='javascript:']")).toBeNull()
  })

  it("shows bounded Korean guidance when a completed stream has no assistant content", async () => {
    const user = userEvent.setup()
    const emptyChunks = [
      { type: "start", messageId: "assistant-empty" },
      { type: "finish", finishReason: "stop" },
    ] satisfies readonly UIMessageChunk[]
    render(<ChatShell transport={transportFor(emptyChunks)} />)

    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "빈 응답 확인")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    expect(
      await screen.findByText("답변 내용이 비어 있습니다. 질문을 조금 더 구체적으로 보내 주세요."),
    ).toBeVisible()
  })

  it("passes the selected model and effort, exposes stop while streaming, and keeps partial text", async () => {
    const user = userEvent.setup()
    const streamedText = "첫 번째 안내".repeat(20)
    let streamController: ReadableStreamDefaultController<UIMessageChunk> | undefined
    const sendMessages = vi.fn(
      async ({ abortSignal }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]) => {
        const response = new ReadableStream<UIMessageChunk>({
          start(controller) {
            streamController = controller
            controller.enqueue({ type: "start", messageId: "assistant-stream" })
            controller.enqueue({ type: "text-start", id: "answer" })
            controller.enqueue({ type: "text-delta", id: "answer", delta: streamedText })
            expect(abortSignal).toBeDefined()
          },
        })
        return response
      },
    )
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages,
    }
    render(<ChatShell transport={transport} />)

    const modelTrigger = screen.getByRole("button", {
      name: "모델 GPT-5.6 Sol, 추론 강도 보통",
    })
    await user.click(modelTrigger)
    await user.click(screen.getByRole("menuitemradio", { name: "GPT-5.6 Terra" }))
    screen.getByRole("menuitem", { name: "추론 강도" }).focus()
    await user.keyboard("{ArrowRight}")
    await user.keyboard("{End}{ArrowUp}{Enter}")
    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "질문")
    vi.useFakeTimers()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "질문 보내기" })))
    const streamingArticle = document.querySelector("article[data-streaming='true']")
    expect(streamingArticle?.textContent?.length).toBeGreaterThan(0)
    expect(streamingArticle).not.toHaveTextContent(streamedText)
    expect(streamingArticle).toHaveAttribute("data-motion-state", "instant")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "응답 중지" })))

    expect(screen.queryByRole("button", { name: "응답 중지" })).not.toBeInTheDocument()
    expect(document.querySelectorAll("[data-assistant-marker]")).toHaveLength(0)
    expect(screen.getByText(streamedText)).toBeVisible()
    expect(screen.getByText(streamedText).closest("article")).toHaveAttribute(
      "data-streaming",
      "false",
    )
    expect(sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({ body: { effort: "xhigh", model: "gpt-5.6-terra" } }),
    )
    expect(streamController).toBeDefined()
  })

  it("shows a muted disabled send until text or a ready attachment makes it sendable", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => undefined)
    const onHasAttachmentPreviews = vi.fn()
    const { rerender } = render(
      <ChatComposer
        effort="medium"
        model="gpt-5.6-sol"
        onEffortChange={vi.fn()}
        onHasAttachmentPreviews={onHasAttachmentPreviews}
        onModelChange={vi.fn()}
        onStop={vi.fn()}
        onSubmit={onSubmit}
        status="ready"
      />,
    )
    const send = screen.getByRole("button", { name: "질문 보내기" })
    expect(send).toBeDisabled()
    expect(send).toHaveClass("disabled:bg-muted", "disabled:text-muted-foreground")

    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "   ")
    expect(send).toBeDisabled()
    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "질문")
    expect(send).toBeEnabled()
    await user.click(send)
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: "질문" }))

    rerender(
      <ChatComposer
        effort="medium"
        model="gpt-5.6-sol"
        onEffortChange={vi.fn()}
        onHasAttachmentPreviews={onHasAttachmentPreviews}
        onModelChange={vi.fn()}
        onStop={vi.fn()}
        onSubmit={onSubmit}
        status="submitted"
      />,
    )
    expect(screen.getByRole("button", { name: "응답 중지" })).toBeEnabled()
    rerender(
      <ChatComposer
        effort="medium"
        model="gpt-5.6-sol"
        onEffortChange={vi.fn()}
        onHasAttachmentPreviews={onHasAttachmentPreviews}
        onModelChange={vi.fn()}
        onStop={vi.fn()}
        onSubmit={onSubmit}
        status="streaming"
      />,
    )
    expect(screen.getByRole("button", { name: "응답 중지" })).toBeEnabled()
  })

  it("reevaluates a retained draft after submitted, streaming, cancellation, and error states", async () => {
    const user = userEvent.setup()
    const properties = {
      effort: "medium" as const,
      model: "gpt-5.6-sol" as const,
      onEffortChange: vi.fn(),
      onHasAttachmentPreviews: vi.fn(),
      onModelChange: vi.fn(),
      onStop: vi.fn(),
      onSubmit: vi.fn(),
    }
    const { rerender } = render(<ChatComposer {...properties} status="ready" />)
    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "보존할 질문")
    expect(screen.getByRole("button", { name: "질문 보내기" })).toBeEnabled()

    rerender(<ChatComposer {...properties} status="submitted" />)
    expect(screen.getByRole("button", { name: "응답 중지" })).toBeEnabled()
    rerender(<ChatComposer {...properties} status="streaming" />)
    expect(screen.getByRole("button", { name: "응답 중지" })).toBeEnabled()
    rerender(<ChatComposer {...properties} status="ready" />)
    expect(screen.getByRole("button", { name: "질문 보내기" })).toBeEnabled()
    rerender(<ChatComposer {...properties} status="error" />)
    expect(screen.getByRole("button", { name: "질문 보내기" })).toBeEnabled()
  })

  it("shows the pending status with the streaming marker before the response starts", async () => {
    // Given: a transport that never resolves, so the chat stays in the submitted state.
    const user = userEvent.setup()
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages: () => new Promise(() => undefined),
    }
    render(<ChatShell transport={transport} />)

    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "질문")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    // Then: the pending status renders inside an assistant article with the marker.
    const pending = document.querySelector("[data-pending-response]")
    expect(pending).not.toBeNull()
    const pendingArticle = pending?.closest("article")
    expect(pendingArticle).toHaveAttribute("data-from", "assistant")
    expect(pendingArticle?.querySelectorAll("[data-assistant-marker]")).toHaveLength(1)
    // And: the marker floats in the gutter instead of reserving a leading column,
    // so the status text sits flush with the composer and has no bubble background.
    expect(pendingArticle?.className).not.toMatch(/grid-cols-/u)
    expect(pendingArticle?.querySelector("[data-assistant-marker]")).toHaveClass("absolute")
    await user.click(screen.getByRole("button", { name: "응답 중지" }))
    await waitFor(() => expect(document.querySelector("[data-assistant-marker]")).toBeNull())
  })

  it("shows an exact offline terminal when network transport fails", async () => {
    // Given: the browser transport rejects at the network boundary.
    const user = userEvent.setup()
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages: async () => {
        throw new TypeError("private transport details")
      },
    }
    render(<ChatShell transport={transport} />)

    // When: the question is submitted.
    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "오프라인 질문")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    // Then: a machine-identified offline terminal masks private transport details.
    await waitFor(() =>
      expect(document.querySelector("[data-chat-error-code='offline']")).not.toBeNull(),
    )
    const terminal = document.querySelector("[data-chat-error-code='offline']")
    expect(terminal).toHaveTextContent(
      "네트워크 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    )
    expect(screen.queryByText("private transport details")).not.toBeInTheDocument()
  })

  it("shows an exact provider terminal and new chat clears browser-memory messages", async () => {
    // Given: the provider returns a bounded server failure.
    const user = userEvent.setup()
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages: async () => {
        throw new Error("private provider details")
      },
    }
    render(<ChatShell transport={transport} />)

    // When: the question is submitted.
    const modelTrigger = screen.getByRole("button", {
      name: "모델 GPT-5.6 Sol, 추론 강도 보통",
    })
    await user.click(modelTrigger)
    await user.click(screen.getByRole("menuitemradio", { name: "GPT-5.6 Luna" }))
    screen.getByRole("menuitem", { name: "추론 강도" }).focus()
    await user.keyboard("{ArrowRight}")
    await user.keyboard("{End}{ArrowUp}{ArrowUp}{Enter}")
    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "제공자 오류 질문")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    // Then: the provider terminal has exact machine identity and public content.
    const terminal = await screen.findByText(
      "현재 의료 답변과 검색 근거를 제공할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    )
    expect(terminal).toHaveAttribute("data-chat-error-code", "provider")
    expect(screen.queryByText("private provider details")).not.toBeInTheDocument()

    // When: a new chat is requested.
    await user.click(screen.getByRole("button", { name: "새 대화" }))

    // Then: transient conversation state is cleared.
    expect(screen.queryByText("제공자 오류 질문")).not.toBeInTheDocument()
    expect(screen.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
    expect(
      screen.getByRole("button", { name: "모델 GPT-5.6 Luna, 추론 강도 높음" }),
    ).toHaveTextContent("GPT-5.6 Luna · 높음")
    expect(
      screen.queryByRole("button", { name: /재생성|다시 생성|다운로드/u }),
    ).not.toBeInTheDocument()
  })
})
