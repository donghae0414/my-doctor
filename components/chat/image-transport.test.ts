import type { PrepareSendMessagesRequest, UIMessage } from "ai"
import { describe, expect, it } from "vitest"

import { IMAGE_REQUEST_BYTE_LIMIT } from "@/lib/images/request-budget"
import { prepareSendMessagesRequest } from "./image-transport"

function imagePart(marker: string, filename = "attachment.jpg") {
  return {
    type: "file" as const,
    mediaType: "image/jpeg",
    filename,
    url: `data:image/jpeg;base64,${marker}`,
  }
}

function requestOptions(messages: UIMessage[], body: Record<string, unknown> = { effort: "high" }) {
  return {
    api: "/api/chat",
    body,
    credentials: "same-origin" as const,
    headers: { "x-test": "preserved" },
    id: "chat-id",
    messageId: messages.at(-1)?.id,
    messages,
    requestMetadata: undefined,
    trigger: "submit-message" as const,
  } satisfies Parameters<PrepareSendMessagesRequest<UIMessage>>[0]
}

describe("prepareSendMessagesRequest", () => {
  it("keeps bytes only on the newest current image-bearing user turn without mutating local history", async () => {
    // Given: two locally visible image turns and a later current image turn.
    const messages: UIMessage[] = [
      { id: "old", role: "user", parts: [imagePart("OLD"), { type: "text", text: "이전 사진" }] },
      { id: "reply", role: "assistant", parts: [{ type: "text", text: "확인했습니다." }] },
      { id: "new", role: "user", parts: [imagePart("NEW"), { type: "text", text: "현재 사진" }] },
    ]
    const localSnapshot = JSON.stringify(messages)

    // When: the AI SDK prepares the actual authenticated request body.
    const prepared = await prepareSendMessagesRequest(requestOptions(messages))
    const serialized = JSON.stringify(prepared.body)

    // Then: stale bytes are absent, current bytes and options survive, and local markers stay visible.
    expect(serialized).not.toContain("OLD")
    expect(serialized).toContain("NEW")
    expect(prepared.body).toMatchObject({
      effort: "high",
      id: "chat-id",
      trigger: "submit-message",
    })
    expect(JSON.stringify(messages)).toBe(localSnapshot)
    expect(localSnapshot).toContain("OLD")
  })

  it("replaces prior image bytes with a safe filename-bearing user-turn marker", async () => {
    // Given: a prior user image must remain meaningful after its bytes are removed.
    const messages: UIMessage[] = [
      { id: "old", role: "user", parts: [imagePart("OLD_BYTES", "산후-상처.jpg")] },
      { id: "current", role: "user", parts: [{ type: "text", text: "지금 상태도 봐 주세요." }] },
    ]

    // When: the model payload is prepared without mutating local history.
    const prepared = await prepareSendMessagesRequest(requestOptions(messages))
    const serialized = JSON.stringify(prepared.body)

    // Then: binary data is absent but safe context and filename remain in a text part.
    expect(serialized).not.toContain("OLD_BYTES")
    expect(serialized).toContain("이전 사용자 첨부 이미지")
    expect(serialized).toContain("산후-상처.jpg")
    expect(JSON.stringify(messages)).toContain("OLD_BYTES")
  })

  it("strips every historical image when the actual current user turn is text-only", async () => {
    // Given: an image turn followed by the current text-only turn.
    const messages: UIMessage[] = [
      { id: "old", role: "user", parts: [imagePart("STALE")] },
      { id: "current", role: "user", parts: [{ type: "text", text: "글로만 질문합니다." }] },
    ]

    // When: transport serialization runs.
    const prepared = await prepareSendMessagesRequest(requestOptions(messages))

    // Then: no image bytes can reach the network.
    expect(JSON.stringify(prepared.body)).not.toContain("data:image/")
  })

  it("rejects an over-budget body before fetch can begin", async () => {
    // Given: non-image request overhead alone exceeds the exact four-megabyte limit.
    const messages: UIMessage[] = [
      { id: "current", role: "user", parts: [{ type: "text", text: "가".repeat(1_400_000) }] },
    ]

    // When: request preparation measures UTF-8 bytes.
    const captureFailure = () => prepareSendMessagesRequest(requestOptions(messages))

    // Then: the local Korean budget failure prevents a request body from being returned.
    await expect(captureFailure()).rejects.toMatchObject({
      message: expect.stringMatching(/[가-힣]/u),
      name: "ImageRequestBudgetError",
    })
  })

  it("returns a complete body no larger than 4MB", async () => {
    // Given: a current normalized image turn beneath the cap.
    const messages: UIMessage[] = [
      { id: "current", role: "user", parts: [imagePart("A".repeat(2_000_000))] },
    ]

    // When: transport preparation completes.
    const prepared = await prepareSendMessagesRequest(requestOptions(messages))

    // Then: byte size, not string length, satisfies the platform limit.
    expect(new TextEncoder().encode(JSON.stringify(prepared.body)).byteLength).toBeLessThanOrEqual(
      IMAGE_REQUEST_BYTE_LIMIT,
    )
  })
})
