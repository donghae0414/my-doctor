import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { renderWithMotion as render } from "@/tests/render-with-motion"
import { ChatShell } from "./chat-shell"

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
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
  it("centers the initial composer with the fixed model and six effort choices", async () => {
    render(<ChatShell transport={transportFor(successfulChunks)} />)

    expect(screen.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")
    expect(screen.getByTestId("chat-composer-region")).toHaveAttribute(
      "data-motion-surface",
      "composer",
    )
    expect(screen.getByText("GPT-5.6 Sol")).toHaveAttribute("data-model-id", "gpt-5.6-sol")
    const effort = screen.getByRole("combobox", { name: "추론 강도" })
    expect(within(effort).getAllByRole("option")).toHaveLength(6)
    expect(effort).toHaveValue("medium")
    await waitFor(() => expect(screen.getByText(/의료진의 진단을 대신하지 않으며/u)).toBeVisible())
    expect(document.querySelectorAll("[data-scroll-owner='conversation']")).toHaveLength(1)
  })

  it("moves the composer to the bottom and renders right user text, Markdown, and safe sources", async () => {
    const user = userEvent.setup()
    render(<ChatShell transport={transportFor(successfulChunks)} />)

    await user.type(
      screen.getByRole("textbox", { name: "의료 질문" }),
      "생후 3주 아기가 자주 토해요",
    )
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    expect(screen.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "bottom")
    expect(screen.getByText("생후 3주 아기가 자주 토해요").closest("article")).toHaveAttribute(
      "data-from",
      "user",
    )
    expect(await screen.findByRole("heading", { name: "확인할 점" })).toBeVisible()
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

  it("passes the selected effort, exposes stop while streaming, and keeps partial text", async () => {
    const user = userEvent.setup()
    let streamController: ReadableStreamDefaultController<UIMessageChunk> | undefined
    const sendMessages = vi.fn(
      async ({ abortSignal }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]) => {
        const response = new ReadableStream<UIMessageChunk>({
          start(controller) {
            streamController = controller
            controller.enqueue({ type: "start", messageId: "assistant-stream" })
            controller.enqueue({ type: "text-start", id: "answer" })
            controller.enqueue({ type: "text-delta", id: "answer", delta: "첫 번째 안내" })
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

    await user.selectOptions(screen.getByRole("combobox", { name: "추론 강도" }), "xhigh")
    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "질문")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))
    expect(await screen.findByText("첫 번째 안내")).toBeVisible()
    expect(screen.getByText("첫 번째 안내").closest("article")).toHaveAttribute(
      "data-streaming",
      "true",
    )
    expect(screen.getByText("첫 번째 안내").closest("article")).toHaveAttribute(
      "data-motion-state",
      "instant",
    )
    await user.click(screen.getByRole("button", { name: "응답 중지" }))

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "응답 중지" })).not.toBeInTheDocument(),
    )
    expect(screen.getByText("첫 번째 안내")).toBeVisible()
    expect(sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({ body: { effort: "xhigh" } }),
    )
    expect(streamController).toBeDefined()
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
      screen.queryByRole("button", { name: /재생성|다시 생성|추론|다운로드/u }),
    ).not.toBeInTheDocument()
  })
})
