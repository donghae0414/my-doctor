"use client"

import type { ChatTransport, UIMessage, UIMessageChunk } from "ai"
import { useSearchParams } from "next/navigation"
import { ChatShell } from "@/components/chat/chat-shell"
import { prepareSendMessagesRequest } from "@/components/chat/image-transport"
import { ImageNormalizationError, normalizeImages } from "@/lib/images/normalize-image"

const transport: ChatTransport<UIMessage> = {
  reconnectToStream: async () => null,
  sendMessages: async (options) => {
    const prepared = await prepareSendMessagesRequest({
      api: "/api/chat",
      body: options.body,
      credentials: "same-origin",
      headers: undefined,
      id: options.chatId,
      messageId: options.messageId,
      messages: options.messages,
      requestMetadata: options.metadata,
      trigger: options.trigger,
    })
    const root = document.documentElement
    root.dataset["transportCalls"] = String(Number(root.dataset["transportCalls"] ?? "0") + 1)
    root.dataset["lastRequest"] = JSON.stringify(prepared.body)

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        const messageId = `assistant-${root.dataset["transportCalls"]}`
        controller.enqueue({ type: "start", messageId })
        controller.enqueue({ type: "text-start", id: `${messageId}-text` })
        controller.enqueue({
          type: "text-delta",
          id: `${messageId}-text`,
          delta: "첨부 이미지를 현재 질문과 함께 확인했습니다.",
        })
        controller.enqueue({ type: "text-end", id: `${messageId}-text` })
        controller.enqueue({ type: "finish", finishReason: "stop" })
        controller.close()
      },
    })
  },
}

function fixturePart(file: File) {
  const canvas = document.createElement("canvas")
  canvas.width = 16
  canvas.height = 16
  const context = canvas.getContext("2d")
  if (context === null) throw new ImageNormalizationError("corrupt")
  context.fillStyle = file.name === "still.heic" ? "#b86643" : "#7c6658"
  context.fillRect(0, 0, canvas.width, canvas.height)
  return {
    type: "file" as const,
    mediaType: "image/jpeg",
    filename: file.name,
    url: canvas.toDataURL("image/jpeg", 0.82),
  }
}

const normalizeSelection = async (files: readonly File[]) => {
  const normalized = []
  for (const file of files) {
    if (file.name === "conversion-failure.heic") throw new ImageNormalizationError("corrupt")
    if (file.name === "late.jpg") {
      await new Promise<void>((resolve) => {
        window.addEventListener("resolve-late-normalization", () => resolve(), { once: true })
      })
      normalized.push(fixturePart(file))
      continue
    }
    if (file.name === "still.heic" || file.name === "oriented-6.jpg") {
      normalized.push(fixturePart(file))
      continue
    }
    normalized.push(...(await normalizeImages([file])))
  }
  return normalized
}

// biome-ignore lint/style/noDefaultExport: Next.js route modules require default exports.
export default function ImageAttachmentsPage() {
  const dark = useSearchParams().get("theme") === "dark"
  return (
    <div className={dark ? "dark" : undefined} data-theme-root>
      <ChatShell imageNormalizer={normalizeSelection} transport={transport} />
    </div>
  )
}
