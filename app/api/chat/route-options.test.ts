import { openai } from "@ai-sdk/openai"
import { MockLanguageModelV4, simulateReadableStream } from "ai/test"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  openai: vi.fn(),
  webSearch: vi.fn(),
}))

vi.mock("@/lib/auth/require-session", () => ({ requireSession: mocks.requireSession }))
vi.mock("@ai-sdk/openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ai-sdk/openai")>()
  mocks.webSearch.mockImplementation(actual.openai.tools.webSearch)
  return {
    ...actual,
    openai: Object.assign(mocks.openai, {
      tools: { ...actual.openai.tools, webSearch: mocks.webSearch },
    }),
  }
})

import { MEDICAL_SYSTEM_PROMPT } from "@/lib/ai/medical-system-prompt"
import { POST } from "./route"

const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const
const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
} as const

function successfulModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: "답변" },
          { type: "text-end", id: "answer" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
        ],
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    },
  })
}

function chatRequest(effort?: string): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(effort === undefined ? {} : { effort }),
      messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "질문" }] }],
    }),
  })
}

beforeEach(() => {
  mocks.requireSession.mockReset()
  mocks.requireSession.mockResolvedValue({ authorized: true })
  mocks.openai.mockReset()
  mocks.webSearch.mockClear()
})

describe("POST /api/chat provider contract", () => {
  it.each(EFFORTS)("passes the selected %s effort unchanged", async (effort) => {
    // Given: an authenticated request and a deterministic Responses-compatible model.
    const model = successfulModel()
    mocks.openai.mockReturnValue(model)

    // When: the selected effort is submitted and the stream is consumed.
    const response = await POST(chatRequest(effort))
    await response.text()

    // Then: the provider receives that exact effort without remapping.
    expect(model.doStreamCalls[0]?.providerOptions).toEqual({
      openai: {
        reasoningMode: "pro",
        reasoningEffort: effort,
        store: false,
        reasoningSummary: null,
      },
    })
  })

  it("uses medium and every fixed Responses/search option when effort is omitted", async () => {
    // Given: an authenticated request with no explicit effort.
    const model = successfulModel()
    mocks.openai.mockReturnValue(model)

    // When: the request stream is consumed.
    const response = await POST(chatRequest())
    await response.text()

    // Then: the fixed model, medical prompt, output cap, and required unrestricted search are used.
    expect(openai).toHaveBeenCalledOnce()
    expect(openai).toHaveBeenCalledWith("gpt-5.6-sol")
    expect(mocks.webSearch).toHaveBeenCalledOnce()
    expect(mocks.webSearch).toHaveBeenCalledWith({ externalWebAccess: true })
    const call = model.doStreamCalls[0]
    expect(call?.maxOutputTokens).toBe(4096)
    expect(call?.toolChoice).toEqual({ type: "required" })
    expect(call?.providerOptions).toEqual({
      openai: {
        reasoningMode: "pro",
        reasoningEffort: "medium",
        store: false,
        reasoningSummary: null,
      },
    })
    expect(call?.prompt[0]).toEqual({ role: "system", content: MEDICAL_SYSTEM_PROMPT })
    expect(call?.tools).toHaveLength(1)
  })

  it("rejects an unknown effort before selecting a model", async () => {
    // Given: an authenticated request with an unsupported effort.

    // When: the route parses the request.
    const response = await POST(chatRequest("minimal"))

    // Then: a bounded Korean validation response is returned before OpenAI.
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "요청 형식이 올바르지 않습니다." })
    expect(mocks.openai).not.toHaveBeenCalled()
  })
})
