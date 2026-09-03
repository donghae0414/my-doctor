"use client"

import type { ChatTransport, UIMessage, UIMessageChunk } from "ai"
import { ChatShell } from "@/components/chat/chat-shell"

const LONG_ANSWER = `## 아기 상태 확인\n\n아기가 수유 뒤에 조금 게우는 일은 흔하지만, 체온과 소변 횟수, 처짐 여부를 함께 살펴보세요.\n\n${"수유 뒤에는 아기를 세워 안고 편안하게 트림을 도와주세요. ".repeat(20)}`

const fixtureTransport: ChatTransport<UIMessage> = {
  reconnectToStream: async () => null,
  sendMessages: async ({ abortSignal, body, messages }) => {
    const question = messages.at(-1)?.parts.find((part) => part.type === "text")
    if (question?.type === "text" && question.text.includes("오류")) {
      throw new TypeError("fixture transport detail")
    }
    if (question?.type === "text" && question.text.includes("빈 응답")) {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "start", messageId: `assistant-empty-${messages.length}` })
          controller.enqueue({ type: "finish", finishReason: "stop" })
          controller.close()
        },
      })
    }
    document.documentElement.dataset["lastEffort"] = String(
      body !== undefined && "effort" in body ? body.effort : undefined,
    )

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "start", messageId: `assistant-${messages.length}` })
        controller.enqueue({ type: "text-start", id: "answer" })
        controller.enqueue({ type: "text-delta", id: "answer", delta: "응답을 준비하고 있습니다." })

        const continueStream = () => {
          abortSignal?.removeEventListener("abort", abortStream)
          controller.enqueue({ type: "text-delta", id: "answer", delta: `\n\n${LONG_ANSWER}` })
          controller.enqueue({ type: "text-end", id: "answer" })
          controller.enqueue({
            type: "source-url",
            sourceId: "safe-source",
            title: "신생아 수유와 게워냄을 함께 살펴보는 보호자 근거 자료",
            url: "https://example.com/an-extremely-long-unbroken-source-address-for-chat-shell-testing",
          })
          controller.enqueue({
            type: "source-url",
            sourceId: "unsafe-source",
            title: "표시되면 안 되는 출처",
            url: "javascript:alert(1)",
          })
          controller.enqueue({ type: "finish", finishReason: "stop" })
          controller.close()
        }
        const abortStream = () => {
          window.removeEventListener("chat-shell-continue", continueStream)
          controller.enqueue({ type: "abort", reason: "사용자가 응답을 중지했습니다." })
          controller.close()
        }
        window.addEventListener("chat-shell-continue", continueStream, { once: true })
        abortSignal?.addEventListener("abort", abortStream, { once: true })
      },
    })
  },
}

type ChatShellFixtureProps = {
  readonly theme: "dark" | "light"
}

export function ChatShellFixture({ theme }: ChatShellFixtureProps) {
  return (
    <div className={theme === "dark" ? "dark" : undefined}>
      <ChatShell transport={fixtureTransport} />
    </div>
  )
}
